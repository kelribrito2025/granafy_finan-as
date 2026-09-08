/**
 * A sugestão de pareamento entre o extrato e o razão.
 *
 * A regra que não se dobra: valor tem que bater ao centavo. Num sistema
 * financeiro, sugerir um pareamento de valor diferente é oferecer um erro
 * pronto para ser confirmado sem ninguém reparar. Data próxima, descrição
 * parecida e regra do usuário mudam a confiança, nunca o valor.
 *
 * Nada aqui concilia sozinho: a função devolve candidato, motivo e confiança,
 * e quem decide é a tela — ou uma regra que o usuário marcou como automática.
 */

export type MovementSide = {
  id: number;
  accountId: number;
  movementDate: string;
  description: string;
  contact: string;
  /** Assinado: entrada positiva, saída negativa. */
  amount: number;
};

export type LedgerSide = {
  id: number;
  accountId: number | null;
  transactionDate: string;
  description: string;
  contact: string;
  amount: number;
  category: string;
};

export type SuggestionRule = {
  id: number;
  matchValue: string;
  category: string;
  categoryId: number | null;
};

export type Suggestion = {
  transactionId: number;
  /** 0 a 100, para a tela mostrar "· 98%". */
  confidence: number;
  reason: string;
};

/** Dias que uma data pode se afastar e o pareamento ainda ser plausível. */
export const MAX_DATE_DISTANCE_DAYS = 3;

/*
 * Ruído de extrato: conectivos, meio de pagamento, sufixo societário e moeda.
 * Nenhuma dessas palavras identifica quem está do outro lado — "TWILIO INC USD
 * 604.12" e "Twilio · fatura agosto" são o mesmo fornecedor, e é a palavra
 * "twilio" que diz isso.
 */
const STOP_WORDS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "para", "por", "com", "via",
  "no", "na", "nos", "nas", "o", "a", "os", "as", "um", "uma",
  "ltda", "sa", "inc", "llc", "me", "epp", "eireli",
  "brl", "usd", "eur", "rs",
  "pix", "ted", "doc", "pagamento", "recebido", "enviado", "transferencia",
]);

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalizeText(value)
    .split(" ")
    // Número solto é valor, documento ou lote — nunca identidade de quem pagou.
    .filter(word => word.length > 2 && !/^\d+$/.test(word) && !STOP_WORDS.has(word));
}

/**
 * Quanto dois textos se parecem, de 0 a 1.
 *
 * Conta palavras em comum sobre o menor dos dois conjuntos, não sobre a união:
 * "TWILIO INC USD 604.12" e "Twilio" descrevem a mesma coisa, e medir pela
 * união puniria a descrição mais detalhada justamente por ser mais detalhada.
 */
export function similarity(left: string, right: string) {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (a.size === 0 || b.size === 0) return 0;
  let common = 0;
  a.forEach(word => { if (b.has(word)) common += 1; });
  return common / Math.min(a.size, b.size);
}

export function daysApart(left: string, right: string) {
  const a = Date.parse(`${left}T00:00:00Z`);
  const b = Date.parse(`${right}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((a - b) / 86_400_000));
}

/** Compara em centavos: 0.1 + 0.2 não é 0.3 em ponto flutuante. */
function sameAmount(left: number, right: number) {
  return Math.round(left * 100) === Math.round(right * 100);
}

export function ruleFor(rules: readonly SuggestionRule[], description: string) {
  const haystack = normalizeText(description);
  return rules.find(rule => {
    const needle = normalizeText(rule.matchValue);
    return needle.length > 0 && haystack.includes(needle);
  });
}

/**
 * A nota de um candidato, ou null quando ele nem entra na disputa.
 *
 * Fora da disputa: conta diferente, valor diferente ou data longe demais.
 */
export function scoreCandidate(
  movement: MovementSide,
  candidate: LedgerSide,
  rule?: SuggestionRule
): Omit<Suggestion, "transactionId"> | null {
  if (candidate.accountId !== movement.accountId) return null;
  if (!sameAmount(candidate.amount, movement.amount)) return null;

  const distance = daysApart(movement.movementDate, candidate.transactionDate);
  if (distance > MAX_DATE_DISTANCE_DAYS) return null;

  const parecido = Math.max(
    similarity(movement.description, candidate.description),
    similarity(movement.contact, candidate.contact)
  );

  if (distance === 0 && parecido >= 0.6) {
    return { confidence: 98, reason: "mesmo valor e data" };
  }
  if (rule && rule.category === candidate.category) {
    return { confidence: 95, reason: `regra “${rule.matchValue}”` };
  }
  if (distance === 0) {
    return { confidence: 90, reason: "mesmo valor e data" };
  }
  if (parecido >= 0.6) {
    return { confidence: 88, reason: "descrição semelhante" };
  }
  return { confidence: 70, reason: `mesmo valor · ${distance} ${distance === 1 ? "dia" : "dias"} de diferença` };
}

/**
 * O melhor candidato para uma movimentação.
 *
 * Empate resolve pelo id menor, para a mesma lista sempre sugerir a mesma
 * coisa — sugestão que muda de lugar entre dois carregamentos faz o usuário
 * desconfiar da tela inteira.
 */
export function suggestFor(
  movement: MovementSide,
  candidates: readonly LedgerSide[],
  rules: readonly SuggestionRule[] = []
): Suggestion | null {
  const rule = ruleFor(rules, movement.description);
  let best: Suggestion | null = null;

  for (const candidate of candidates) {
    const score = scoreCandidate(movement, candidate, rule);
    if (!score) continue;
    if (
      best === null ||
      score.confidence > best.confidence ||
      (score.confidence === best.confidence && candidate.id < best.transactionId)
    ) {
      best = { transactionId: candidate.id, ...score };
    }
  }

  return best;
}

/**
 * Sugere para uma lista inteira sem oferecer o mesmo lançamento duas vezes.
 *
 * As movimentações mais confiantes ficam com o candidato primeiro; sem isso,
 * a primeira da lista tomaria um lançamento que casava muito melhor com outra.
 */
export function suggestAll(
  movements: readonly MovementSide[],
  candidates: readonly LedgerSide[],
  rules: readonly SuggestionRule[] = []
): Map<number, Suggestion> {
  const scored = movements
    .map(movement => ({ movement, suggestion: suggestFor(movement, candidates, rules) }))
    .filter((item): item is { movement: MovementSide; suggestion: Suggestion } => item.suggestion !== null)
    .sort((left, right) =>
      right.suggestion.confidence - left.suggestion.confidence || left.movement.id - right.movement.id
    );

  const taken = new Set<number>();
  const result = new Map<number, Suggestion>();
  const disponiveis = new Map(candidates.map(candidate => [candidate.id, candidate]));

  for (const { movement, suggestion } of scored) {
    if (!taken.has(suggestion.transactionId)) {
      taken.add(suggestion.transactionId);
      result.set(movement.id, suggestion);
      continue;
    }
    // O favorito já foi levado: procura de novo, agora só entre os que sobraram.
    const sobrando = candidates.filter(candidate => !taken.has(candidate.id) && disponiveis.has(candidate.id));
    const segunda = suggestFor(movement, sobrando, rules);
    if (segunda) {
      taken.add(segunda.transactionId);
      result.set(movement.id, segunda);
    }
  }

  return result;
}

/** Texto do motivo com a confiança, como a tela mostra. */
export function suggestionLabel(suggestion: Suggestion) {
  return `${suggestion.reason} · ${suggestion.confidence}%`;
}

export type BatchSummary = {
  count: number;
  incomingCount: number;
  outgoingCount: number;
  incoming: number;
  outgoing: number;
  net: number;
};

/** O resumo que a barra escura e o modal de confirmação repetem. */
export function summarizeBatch(amounts: readonly number[]): BatchSummary {
  const round = (value: number) => Math.round(value * 100) / 100;
  const incoming = amounts.filter(amount => amount > 0);
  const outgoing = amounts.filter(amount => amount < 0);
  return {
    count: amounts.length,
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    incoming: round(incoming.reduce((total, amount) => total + amount, 0)),
    outgoing: round(outgoing.reduce((total, amount) => total + amount, 0)),
    net: round(amounts.reduce((total, amount) => total + amount, 0)),
  };
}
