export type MovementItem = {
  name: string;
  isActive: boolean;
  acquisitionDate: string | null;
  acquisitionValueNumber: number;
  residualValueNumber: number;
  usefulLifeMonths: number | null;
  valuationMethod: "manual" | "depreciacao_linear";
};

export type MovementRow = {
  monthKey: string;
  label: string;
  movement: string;
  contributions: number;
  depreciation: number;
};

const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function monthKeyOf(isoDate: string) {
  return isoDate.slice(0, 7);
}

/** "2026-09" -> "set/26". */
export function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return `${SHORT_MONTHS[month - 1]}/${String(year).slice(-2)}`;
}

function monthsBetween(fromMonthKey: string, toMonthKey: string) {
  const [fromYear, fromMonth] = fromMonthKey.split("-").map(Number);
  const [toYear, toMonth] = toMonthKey.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/**
 * Quanto um item deprecia dentro de um mês do calendário.
 *
 * A primeira parcela cai no mês seguinte ao da aquisição — no mês da compra o
 * bem ainda não completou um mês de uso, e é assim que calculateItemBookValue
 * conta no servidor. A última parcela é a de número `usefulLifeMonths`; depois
 * disso o valor contábil já parou no residual e cobrar de novo faria a tabela
 * mostrar depreciação que o balanço não tem.
 */
export function monthlyDepreciationOf(item: MovementItem, monthKey: string) {
  if (!item.isActive) return 0;
  if (item.valuationMethod !== "depreciacao_linear") return 0;
  if (!item.acquisitionDate || !item.usefulLifeMonths || item.usefulLifeMonths <= 0) return 0;

  const elapsed = monthsBetween(monthKeyOf(item.acquisitionDate), monthKey);
  if (elapsed < 1 || elapsed > item.usefulLifeMonths) return 0;

  const acquisition = Math.max(0, item.acquisitionValueNumber);
  const residual = Math.min(acquisition, Math.max(0, item.residualValueNumber));
  return (acquisition - residual) / item.usefulLifeMonths;
}

/** Soma o que entrou no imobilizado dentro do mês. */
export function contributionsOf(items: readonly MovementItem[], monthKey: string) {
  return items
    .filter(item => item.isActive && item.acquisitionDate && monthKeyOf(item.acquisitionDate) === monthKey)
    .reduce((sum, item) => sum + Math.max(0, item.acquisitionValueNumber), 0);
}

/**
 * A frase da coluna "Principal movimento", montada só com o que aconteceu de
 * fato no mês — nunca um texto genérico que sugira movimentação inexistente.
 */
export function movementLabelOf(items: readonly MovementItem[], monthKey: string) {
  const acquired = items.filter(
    item => item.isActive && item.acquisitionDate && monthKeyOf(item.acquisitionDate) === monthKey
  );
  if (acquired.length === 0) return "Sem movimentação de bens";
  if (acquired.length === 1) return `Aquisição de ${acquired[0].name}`;
  if (acquired.length === 2) return `Aquisição de ${acquired[0].name} e mais 1 bem`;
  return `Aquisição de ${acquired[0].name} e mais ${acquired.length - 1} bens`;
}

export function buildMovementRow(items: readonly MovementItem[], monthKey: string): MovementRow {
  return {
    monthKey,
    label: monthLabel(monthKey),
    movement: movementLabelOf(items, monthKey),
    contributions: contributionsOf(items, monthKey),
    depreciation: items.reduce((sum, item) => sum + monthlyDepreciationOf(item, monthKey), 0),
  };
}
