export const RULE_MATCH_TYPES = ["descricao", "contato", "conta"] as const;
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number];

export const RULE_MATCH_LABELS: Record<RuleMatchType, string> = {
  descricao: "Descrição contém",
  contato: "Contato contém",
  conta: "Conta é",
};

export type CategoryRule = {
  id: number;
  matchType: RuleMatchType;
  matchValue: string;
  categoryId: number | null;
  category: string;
  costCenterId: number | null;
  costCenter: string;
  priority: number;
  isActive: boolean;
};

export type RuleTarget = {
  description: string;
  contact: string;
  account: string;
};

/** Minúsculas e sem acento, para "Serviços" casar com "servicos". */
export function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function fieldFor(target: RuleTarget, matchType: RuleMatchType) {
  if (matchType === "descricao") return target.description;
  if (matchType === "contato") return target.contact;
  return target.account;
}

export function ruleMatches(rule: CategoryRule, target: RuleTarget) {
  if (!rule.isActive) return false;
  const needle = normalizeForMatch(rule.matchValue);
  // Valor vazio casaria com tudo e recategorizaria a base inteira em silêncio.
  if (!needle) return false;
  const haystack = normalizeForMatch(fieldFor(target, rule.matchType));
  if (!haystack) return false;
  // "conta" é o nome inteiro; os outros dois procuram um trecho.
  return rule.matchType === "conta" ? haystack === needle : haystack.includes(needle);
}

/**
 * A primeira regra que casa, na ordem de prioridade. Empate resolve pelo id,
 * para a mesma base sempre classificar igual — sem isso a ordem viria do banco
 * e dois usuários com as mesmas regras poderiam ver categorias diferentes.
 */
export function findMatchingRule(rules: readonly CategoryRule[], target: RuleTarget) {
  return [...rules]
    .sort((left, right) => left.priority - right.priority || left.id - right.id)
    .find(rule => ruleMatches(rule, target)) ?? null;
}
