export type Period = "mensal" | "trimestral" | "anual";

export const periodLabels: Record<Period, string> = {
  mensal: "Mensal",
  trimestral: "Trimestral",
  anual: "Anual",
};

export const periodNouns: Record<Period, string> = {
  mensal: "no mês",
  trimestral: "no trimestre",
  anual: "no ano",
};

/** Último dia do mês, em ISO. `month` é 1-12; 0 devolve 31/12 do ano anterior. */
export function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * O balanço é sempre a posição na data de referência — um balanço patrimonial é uma
 * fotografia, não um intervalo. O período escolhido define contra o que essa fotografia
 * é comparada: o fechamento imediatamente anterior ao período corrente.
 *
 * Em 07/09/2026: mensal → 31/08/2026, trimestral → 30/06/2026, anual → 31/12/2025.
 */
export function periodBaseline(period: Period, reference = todayIso()) {
  const [year, month] = reference.split("-").map(Number);
  if (period === "anual") return lastDayOfMonth(year - 1, 12);
  if (period === "trimestral") return lastDayOfMonth(year, Math.floor((month - 1) / 3) * 3);
  return lastDayOfMonth(year, month - 1);
}
