const currencyInputFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

const MAX_CURRENCY_DIGITS = 14;

export function formatCurrencyInput(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return "";
  if (trimmed === "-") return "-";

  const negative = trimmed.startsWith("-");
  const digits = trimmed.replace(/\D/g, "").slice(0, MAX_CURRENCY_DIGITS);
  if (!digits) return negative ? "-" : "";

  const value = Number(digits) / 100;
  return `${negative ? "-" : ""}${currencyInputFormatter.format(value)}`;
}

export function formatCurrencyValue(value: number) {
  const absolute = Math.abs(value);
  return `${value < 0 ? "-" : ""}${currencyInputFormatter.format(absolute)}`;
}

export function currencyInputToNumber(formattedValue: string) {
  const trimmed = formattedValue.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return Number.NaN;
  const value = Number(digits) / 100;
  return trimmed.startsWith("-") ? -value : value;
}
