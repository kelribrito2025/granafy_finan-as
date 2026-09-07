export type RowStatusTone = "positive" | "negative" | "neutral";

export type RowStatus = {
  label: string;
  tone: RowStatusTone;
  /** Dias de atraso, só quando `tone` é negative. */
  daysLate?: number;
};

type StatusInput = {
  type: "entrada" | "saida" | "transferencia";
  status: "Pago" | "Pendente";
  transactionDate: string;
};

/** Dias inteiros entre duas datas ISO, sem fuso para atrapalhar. */
export function daysBetween(fromIso: string, toIso: string) {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

/**
 * O status mostrado na linha. "Atrasado" não existe no banco: é um pendente com
 * data já vencida. Transferência nunca é receita nem despesa, então fica sempre
 * em tom neutro — pintar de verde faria dinheiro andando entre contas próprias
 * parecer entrada.
 */
export function rowStatus(transaction: StatusInput, todayIso: string): RowStatus {
  if (transaction.type === "transferencia") {
    return { label: transaction.status === "Pago" ? "Concluída" : "Em aberto", tone: "neutral" };
  }
  if (transaction.status === "Pago") {
    return { label: "Pago", tone: "positive" };
  }
  const daysLate = daysBetween(transaction.transactionDate, todayIso);
  if (daysLate > 0) {
    return { label: "Atrasado", tone: "negative", daysLate };
  }
  return { label: "Em aberto", tone: "neutral" };
}

/**
 * Monograma de duas letras para o avatar da linha. Ignora conectivos e sinais
 * para "Pix recebido via QR Code" não virar "PR" nem "P·".
 */
export function monogram(text: string) {
  const words = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(word => word.length > 0 && !["de", "da", "do", "das", "dos", "e", "via", "para"].includes(word.toLowerCase()));
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/**
 * De onde tirar as iniciais do avatar. O contato é a melhor pista de quem está
 * do outro lado; sem ele, descrições no formato "Pix recebido via QR Code: Nome"
 * carregam o nome depois dos dois-pontos — usar a descrição inteira faria todas
 * essas linhas virarem o mesmo "PR".
 */
export function monogramSource(description: string, contact: string) {
  if (contact.trim().length >= 2) return contact;
  const colon = description.indexOf(":");
  if (colon !== -1) {
    const tail = description.slice(colon + 1).trim();
    if (tail.length >= 2) return tail;
  }
  return description;
}
