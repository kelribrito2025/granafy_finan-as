/** Quantidade máxima de parcelas de uma série. Espelha o limite do formulário. */
export const MAX_RECURRENCE_MONTHS = 120;

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Soma meses mantendo o dia âncora do lançamento original.
 *
 * O dia é sempre recalculado a partir da data de origem, nunca da parcela
 * anterior: 31/01 + 1 mês é 28/02, mas 31/01 + 2 meses é 31/03, e não 28/03.
 * Encadear o cálculo faria a série inteira escorregar para o dia 28 depois de
 * passar por fevereiro.
 */
export function addMonthsAnchored(isoDate: string, months: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const targetIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetIndex / 12);
  const targetMonth = ((targetIndex % 12) + 12) % 12 + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

export type RecurrenceStart = "este_mes" | "proximo_mes";

/**
 * As datas de uma série. `start` decide se a primeira parcela cai na data
 * escolhida ou um mês depois; o total de parcelas é o mesmo nos dois casos.
 */
export function buildRecurrenceDates(isoDate: string, months: number, start: RecurrenceStart = "este_mes") {
  const total = Math.max(1, Math.min(MAX_RECURRENCE_MONTHS, Math.trunc(months)));
  const firstDate = start === "proximo_mes" ? addMonthsAnchored(isoDate, 1) : isoDate;
  return Array.from({ length: total }, (_, index) => addMonthsAnchored(firstDate, index));
}
