/**
 * Fluxo de caixa: o saldo dia a dia e mês a mês.
 *
 * Realizado e projetado saem da mesma tabela. Até hoje o saldo conta só o que
 * está pago — é o dinheiro que existe. De hoje em diante ele parte desse saldo
 * real e soma os pendentes, inclusive os atrasados, que continuam sendo dinheiro
 * esperado. Recorrência já nasce parcelada no banco, então mês futuro tem linha
 * de verdade e a projeção não precisa inventar tendência nenhuma.
 */

import { roundCurrency } from "./currency";

export type FlowRow = {
  transactionDate: string;
  /** Assinado: entrada positiva, saída negativa. */
  amount: number;
  status: "Pago" | "Pendente";
  type: "entrada" | "saida" | "transferencia";
  description: string;
  category: string;
};

export type FlowBucket = {
  /** Data do dia, ou o primeiro dia da semana/mês do balde. */
  date: string;
  label: string;
  incoming: number;
  outgoing: number;
  /** Saldo ao fim do balde. */
  balance: number;
  realized: boolean;
};

/** Transferência entre contas próprias não muda o caixa total. */
function movesCash(row: FlowRow) {
  return row.type !== "transferencia";
}

export function addDaysIso(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function eachDay(start: string, end: string) {
  const days: string[] = [];
  for (let day = start; day <= end; day = addDaysIso(day, 1)) days.push(day);
  return days;
}

export type DailyFlow = {
  opening: number;
  closing: number;
  days: FlowBucket[];
  totals: { incoming: number; outgoing: number };
  /** Menor saldo do período, com o dia em que acontece. */
  lowest: { date: string; balance: number } | null;
  biggestIncome: { date: string; description: string; amount: number } | null;
  tightestDay: { date: string; amount: number } | null;
};

/**
 * O saldo de cada dia entre `start` e `end`.
 *
 * `opening` é o saldo em caixa na véspera de `start` — só o que estava pago.
 * Dias sem movimento saem da lista: a tela mostra o que aconteceu, não o
 * calendário inteiro.
 */
export function buildDailyFlow(
  rows: readonly FlowRow[],
  options: { opening: number; start: string; end: string; todayIso: string }
): DailyFlow {
  const inWindow = rows.filter(row => movesCash(row) && row.transactionDate >= options.start && row.transactionDate <= options.end);

  const paidByDay = new Map<string, number>();
  const pendingByDay = new Map<string, number>();
  const incomingByDay = new Map<string, number>();
  const outgoingByDay = new Map<string, number>();

  for (const row of inWindow) {
    const target = row.status === "Pago" ? paidByDay : pendingByDay;
    target.set(row.transactionDate, (target.get(row.transactionDate) ?? 0) + row.amount);
    if (row.amount > 0) {
      incomingByDay.set(row.transactionDate, (incomingByDay.get(row.transactionDate) ?? 0) + row.amount);
    } else {
      outgoingByDay.set(row.transactionDate, (outgoingByDay.get(row.transactionDate) ?? 0) - row.amount);
    }
  }

  /*
   * Duas contas correm juntas: `paid` só anda até hoje e é o dinheiro que
   * existe; `pending` acumula desde o começo da janela mas só entra no saldo a
   * partir de hoje — assim o atrasado aparece no primeiro dia projetado, e não
   * no passado, onde ele não chegou a acontecer.
   */
  let paid = options.opening;
  let pending = 0;
  let balance = options.opening;
  const days: FlowBucket[] = [];

  for (const day of eachDay(options.start, options.end)) {
    if (day <= options.todayIso) paid += paidByDay.get(day) ?? 0;
    pending += pendingByDay.get(day) ?? 0;
    balance = day >= options.todayIso ? paid + pending : paid;

    const incoming = incomingByDay.get(day) ?? 0;
    const outgoing = outgoingByDay.get(day) ?? 0;
    if (incoming === 0 && outgoing === 0) continue;

    days.push({
      date: day,
      label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
      incoming: roundCurrency(incoming),
      outgoing: roundCurrency(outgoing),
      balance: roundCurrency(balance),
      realized: day <= options.todayIso,
    });
  }

  const incomes = inWindow.filter(row => row.amount > 0);
  const biggest = incomes.reduce<FlowRow | null>(
    (best, row) => (best === null || row.amount > best.amount ? row : best),
    null
  );
  const netByDay = new Map<string, number>();
  for (const row of inWindow) netByDay.set(row.transactionDate, (netByDay.get(row.transactionDate) ?? 0) + row.amount);
  let tightest: { date: string; amount: number } | null = null;
  netByDay.forEach((amount, date) => {
    if (amount < 0 && (tightest === null || amount < tightest.amount)) tightest = { date, amount: roundCurrency(amount) };
  });
  const lowest = days.reduce<{ date: string; balance: number } | null>(
    (worst, bucket) => (worst === null || bucket.balance < worst.balance ? { date: bucket.date, balance: bucket.balance } : worst),
    null
  );

  return {
    opening: roundCurrency(options.opening),
    closing: roundCurrency(balance),
    days,
    totals: {
      incoming: roundCurrency(inWindow.filter(row => row.amount > 0).reduce((sum, row) => sum + row.amount, 0)),
      outgoing: roundCurrency(-inWindow.filter(row => row.amount < 0).reduce((sum, row) => sum + row.amount, 0)),
    },
    lowest,
    biggestIncome: biggest ? { date: biggest.transactionDate, description: biggest.description, amount: roundCurrency(biggest.amount) } : null,
    tightestDay: tightest,
  };
}

/** Agrupa os dias em semanas de sete dias contadas a partir do início da janela. */
export function toWeeks(daily: DailyFlow, start: string): FlowBucket[] {
  const weeks = new Map<string, FlowBucket>();
  for (const day of daily.days) {
    const offset = Math.floor(
      (Date.parse(`${day.date}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000 / 7
    );
    const first = addDaysIso(start, offset * 7);
    const existing = weeks.get(first);
    if (existing) {
      existing.incoming = roundCurrency(existing.incoming + day.incoming);
      existing.outgoing = roundCurrency(existing.outgoing + day.outgoing);
      existing.balance = day.balance;
      existing.realized = existing.realized && day.realized;
    } else {
      weeks.set(first, {
        date: first,
        label: `${first.slice(8, 10)}/${first.slice(5, 7)} – ${addDaysIso(first, 6).slice(8, 10)}/${addDaysIso(first, 6).slice(5, 7)}`,
        incoming: day.incoming,
        outgoing: day.outgoing,
        balance: day.balance,
        realized: day.realized,
      });
    }
  }
  return Array.from(weeks.values());
}

export type MonthlyColumn = {
  year: number;
  month: number;
  label: string;
  projected: boolean;
  opening: number;
  incoming: number;
  outgoing: number;
  result: number;
  closing: number;
  /** Entradas e saídas abertas pela raiz da categoria. */
  incomingByRoot: Array<{ label: string; value: number }>;
  outgoingByRoot: Array<{ label: string; value: number }>;
};

const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rootOfCategory(category: string) {
  const root = category.split("/")[0]?.trim();
  return root || "Sem categoria";
}

function byRoot(rows: readonly FlowRow[], sign: 1 | -1) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (Math.sign(row.amount) !== sign) continue;
    const root = rootOfCategory(row.category);
    totals.set(root, (totals.get(root) ?? 0) + Math.abs(row.amount));
  }
  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value: roundCurrency(value) }))
    .sort((left, right) => right.value - left.value);
}

/**
 * A projeção mês a mês.
 *
 * Cada mês parte do saldo final do anterior. Meses que ainda não começaram são
 * projeção — os valores vêm de lançamentos pendentes já registrados, não de
 * tendência estimada.
 */
export function buildMonthlyFlow(
  rows: readonly FlowRow[],
  options: { opening: number; months: Array<{ year: number; month: number }>; todayIso: string }
): MonthlyColumn[] {
  let opening = options.opening;
  return options.months.map(({ year, month }) => {
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const inMonth = rows.filter(row => movesCash(row) && row.transactionDate >= start && row.transactionDate < end);
    const incoming = inMonth.filter(row => row.amount > 0).reduce((sum, row) => sum + row.amount, 0);
    const outgoing = -inMonth.filter(row => row.amount < 0).reduce((sum, row) => sum + row.amount, 0);
    const result = roundCurrency(incoming - outgoing);
    const closing = roundCurrency(opening + result);
    const column: MonthlyColumn = {
      year,
      month,
      label: SHORT_MONTHS[month - 1],
      projected: start > options.todayIso,
      opening: roundCurrency(opening),
      incoming: roundCurrency(incoming),
      outgoing: roundCurrency(outgoing),
      result,
      closing,
      incomingByRoot: byRoot(inMonth, 1),
      outgoingByRoot: byRoot(inMonth, -1),
    };
    opening = closing;
    return column;
  });
}

/**
 * Quantos meses o caixa cobre sem nenhuma entrada nova.
 *
 * Null quando não há saída registrada — sem despesa não existe prazo para
 * acabar o dinheiro.
 */
export function runwayMonths(cash: number, monthlyOutflow: number) {
  if (monthlyOutflow <= 0 || cash <= 0) return null;
  return roundCurrency(cash / monthlyOutflow);
}
