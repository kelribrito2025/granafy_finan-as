export const DEFAULT_PERIODS = ["mes", "trimestre", "ano"] as const;
export const CURRENCIES = ["BRL", "USD", "EUR"] as const;
export const DATE_FORMATS = ["dmy", "mdy", "iso"] as const;
export const SIDEBAR_MODES = ["expandido", "icones", "hover"] as const;

export type DefaultPeriod = (typeof DEFAULT_PERIODS)[number];
export type Currency = (typeof CURRENCIES)[number];
export type DateFormat = (typeof DATE_FORMATS)[number];
export type SidebarMode = (typeof SIDEBAR_MODES)[number];

export type Preferences = {
  defaultPeriod: DefaultPeriod;
  currency: Currency;
  timeZone: string;
  dateFormat: DateFormat;
  /** Mês em que o exercício começa, 1-12. */
  fiscalYearStartMonth: number;
  /** Como a barra lateral abre o painel. */
  sidebarMode: SidebarMode;
  /** Tooltip com o nome do item quando a barra está recolhida. */
  sidebarTooltips: boolean;
  /** Bolinha com o número de pendências sobre o ícone recolhido. */
  sidebarBadges: boolean;
  /** Recolher na mão passa a valer na próxima visita. */
  sidebarRemember: boolean;
  /** E-mail diário com as contas a pagar atrasadas. */
  alertaContasAtrasadas: boolean;
};

export const DEFAULT_PREFERENCES: Preferences = {
  defaultPeriod: "mes",
  currency: "BRL",
  timeZone: "America/Sao_Paulo",
  dateFormat: "dmy",
  fiscalYearStartMonth: 1,
  sidebarMode: "expandido",
  sidebarTooltips: true,
  sidebarBadges: true,
  sidebarRemember: false,
  alertaContasAtrasadas: true,
};

/**
 * A moeda escolhida muda o símbolo e o formato do número — não converte valor.
 * Converter o razão exigiria uma taxa e uma decisão contábil, e faria o mesmo
 * lançamento valer coisas diferentes conforme a tela aberta.
 */
export const CURRENCY_LOCALES: Record<Currency, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "de-DE",
};

export const CURRENCY_LABELS: Record<Currency, { name: string; symbol: string }> = {
  BRL: { name: "Real brasileiro", symbol: "R$" },
  USD: { name: "Dólar americano", symbol: "$" },
  EUR: { name: "Euro", symbol: "€" },
};

export function formatMoneyWith(preferences: Preferences, value: number) {
  return new Intl.NumberFormat(CURRENCY_LOCALES[preferences.currency], {
    style: "currency",
    currency: preferences.currency,
  }).format(value);
}

/** Formata uma data ISO sem passar pelo fuso local da máquina. */
export function formatDateWith(preferences: Preferences, isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return isoDate;
  if (preferences.dateFormat === "iso") return `${year}-${month}-${day}`;
  if (preferences.dateFormat === "mdy") return `${month}/${day}/${year}`;
  return `${day}/${month}/${year}`;
}

/** A data de hoje no fuso escolhido, em ISO. */
export function todayIn(preferences: Preferences, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: preferences.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}

/**
 * O exercício que contém a data de referência.
 *
 * Com início em janeiro é o ano civil. Com início em abril, uma data de
 * fevereiro de 2026 pertence ao exercício que começou em abril de 2025 — usar o
 * ano civil aí jogaria três meses de resultado no exercício errado.
 */
export function fiscalYearRange(preferences: Preferences, referenceIso: string) {
  const [year, month] = referenceIso.slice(0, 10).split("-").map(Number);
  const startMonth = Math.min(12, Math.max(1, Math.trunc(preferences.fiscalYearStartMonth)));
  const startYear = month >= startMonth ? year : year - 1;
  const endExclusive = new Date(Date.UTC(startYear + 1, startMonth - 1, 1)).toISOString().slice(0, 10);
  return {
    start: `${startYear}-${String(startMonth).padStart(2, "0")}-01`,
    endExclusive,
  };
}

export const SIDEBAR_MODE_LABELS: Record<SidebarMode, { name: string; hint: string }> = {
  expandido: {
    name: "Sempre expandido",
    hint: "Ícone e nome sempre visíveis. Melhor para telas largas.",
  },
  icones: {
    name: "Somente ícones",
    hint: "Barra estreita de 76px. O nome aparece num tooltip ao passar o mouse.",
  },
  hover: {
    name: "Expandir ao passar",
    hint: "Fica recolhida e abre sobre o conteúdo enquanto o mouse estiver nela.",
  },
};

/** A barra nasce recolhida nos dois modos que não são "sempre expandido". */
export function startsCollapsed(mode: SidebarMode) {
  return mode !== "expandido";
}
