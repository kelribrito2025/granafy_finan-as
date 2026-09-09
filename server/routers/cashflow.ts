import { roundCurrency } from "@shared/currency";
import { z } from "zod";
import {
  buildDailyFlow,
  buildMonthlyFlow,
  runwayMonths,
  toWeeks,
  type FlowRow,
} from "@shared/cashflow";
import { buildPayablesView, type TitleRow } from "@shared/payables";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { userToday } from "../userToday";

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const monthSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
});

type Record_ = Awaited<ReturnType<typeof db.listLedgerWindow>>[number];

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function lastDayOf(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** O dia seguinte, em texto. O recorte do banco é exclusivo à direita. */
function addOneDay(date: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

function shiftMonth(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function monthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}

function toFlowRow(record: Record_): FlowRow {
  return {
    transactionDate: record.transactionDate,
    amount: Number(record.amount),
    status: record.status,
    type: record.type,
    description: record.description,
    category: record.category,
  };
}

function toTitleRow(record: Record_): TitleRow {
  return {
    id: record.id,
    type: record.type,
    transactionDate: record.transactionDate,
    description: record.description,
    contact: record.contact,
    category: record.category,
    amount: Number(record.amount),
    account: record.account,
    status: record.status,
  };
}

/**
 * O caixa na véspera de `date`: o saldo inicial das contas mais tudo que já foi
 * pago até lá. É o mesmo critério do painel e do balanço — pendente não é
 * dinheiro em caixa.
 */
/*
 * O saldo de abertura, somado no banco.
 *
 * Era o motivo de a tela precisar do razão inteiro em memória: somava uma
 * coluna de 6.725 linhas para produzir um número. Agora é um SUM, e a semente
 * da projeção do mês continua arredondada uma vez só — a deriva daqui entraria
 * em cada dia da série e sairia no CSV multiplicada.
 */
async function openingBalance(
  userId: number,
  accounts: Awaited<ReturnType<typeof db.listFinancialAccounts>>,
  date: string
) {
  const initial = accounts.reduce((sum, account) => sum + Number(account.initialBalance), 0);
  return roundCurrency(initial + await db.sumPaidBefore(userId, date));
}

/*
 * Só o que estas telas usam de verdade.
 *
 * `buildDailyFlow`, `buildMonthlyFlow` e `buildPayablesView` já descartavam por
 * conta própria o que está fora da janela ou não está pendente — trazer o razão
 * inteiro era pagar rede por linha que ia ser jogada fora em memória. Medido
 * contra o TiDB: 539 ms para tudo, 189 ms para o recorte.
 */
async function loadLedger(userId: number, from: string, to: string) {
  const [records, accounts] = await Promise.all([
    db.listLedgerWindow(userId, from, to),
    db.listFinancialAccounts(userId),
  ]);
  return { records, accounts };
}

export const payablesRouter = router({
  /** Só os números da bolinha da barra lateral: uma contagem, não a lista. */
  badges: protectedProcedure.query(async ({ ctx }) => {
    const today = await userToday(ctx.user.id);
    const [year, month] = today.split("-").map(Number);
    return db.countOpenTitles(ctx.user.id, today, lastDayOf(year, month));
  }),


  /**
   * Os títulos abertos do mês, mais os atrasados de qualquer data.
   *
   * O atraso não pertence ao mês em que venceu: ele continua sendo dívida hoje,
   * e esconder um boleto de julho porque a tela está em setembro seria perder a
   * única informação que a página existe para dar.
   */
  overview: protectedProcedure.input(monthSchema).query(async ({ ctx, input }) => {
    const today = await userToday(ctx.user.id);
    const start = monthStart(input.year, input.month);
    const end = lastDayOf(input.year, input.month);
    // A janela do recorte vai até o dia seguinte ao fim do mês porque `end` é
    // inclusivo aqui e o recorte do banco é exclusivo à direita.
    const { records, accounts } = await loadLedger(ctx.user.id, start, addOneDay(end));

    const inScope = records.filter(record =>
      (record.transactionDate >= start && record.transactionDate <= end) ||
      (record.status === "Pendente" && record.transactionDate < today)
    );

    const view = buildPayablesView(inScope.map(toTitleRow), today);
    const opening = await openingBalance(ctx.user.id, accounts, start);
    const flow = buildDailyFlow(records.map(toFlowRow), { opening, start, end, todayIso: today });

    return {
      year: input.year,
      month: input.month,
      label: monthLabel(input.year, input.month),
      today,
      ...view,
      projectedCash: flow.closing,
      projectedCashDate: end,
    };
  }),
});

export const cashflowRouter = router({
  /** Saldo dia a dia (ou semana a semana) do mês escolhido. */
  daily: protectedProcedure
    .input(monthSchema.extend({ granularity: z.enum(["dia", "semana"]).default("dia") }))
    .query(async ({ ctx, input }) => {
      const today = await userToday(ctx.user.id);
      const start = monthStart(input.year, input.month);
      const end = lastDayOf(input.year, input.month);
      // A tela desenha este mês e o seguinte: o recorte precisa alcançar os dois.
      const proximo = shiftMonth(input.year, input.month, 1);
      const { records, accounts } = await loadLedger(
        ctx.user.id, start, addOneDay(lastDayOf(proximo.year, proximo.month))
      );
      const rows = records.map(toFlowRow);

      const flow = buildDailyFlow(rows, {
        opening: await openingBalance(ctx.user.id, accounts, start),
        start,
        end,
        todayIso: today,
      });

      // O saldo de hoje é caixa de verdade: só o que está pago, sem projeção.
      const cashToday = await openingBalance(ctx.user.id, accounts, addOneDay(today));
      const next = proximo;
      const nextFlow = buildDailyFlow(rows, {
        opening: flow.closing,
        start: monthStart(next.year, next.month),
        end: lastDayOf(next.year, next.month),
        todayIso: today,
      });

      return {
        year: input.year,
        month: input.month,
        label: monthLabel(input.year, input.month),
        granularity: input.granularity,
        today,
        start,
        end,
        opening: flow.opening,
        closing: flow.closing,
        cashToday,
        monthChange: Math.round((flow.closing - flow.opening) * 100) / 100,
        nextMonthLabel: monthLabel(next.year, next.month),
        nextMonthClosing: nextFlow.closing,
        buckets: input.granularity === "semana" ? toWeeks(flow, start) : flow.days,
        totals: flow.totals,
        lowest: flow.lowest,
        biggestIncome: flow.biggestIncome,
        tightestDay: flow.tightestDay,
      };
    }),

  /** Projeção mês a mês: seis ou doze colunas terminando três meses à frente. */
  monthly: protectedProcedure
    .input(monthSchema.extend({ span: z.union([z.literal(6), z.literal(12)]).default(6) }))
    .query(async ({ ctx, input }) => {
      const today = await userToday(ctx.user.id);
      // A janela olha três meses à frente: projeção que termina no mês corrente
      // não projeta nada.
      const last = shiftMonth(input.year, input.month, 3);
      const first = shiftMonth(last.year, last.month, -(input.span - 1));
      const months = Array.from({ length: input.span }, (_, index) => shiftMonth(first.year, first.month, index));
      const { records, accounts } = await loadLedger(
        ctx.user.id, monthStart(first.year, first.month), addOneDay(lastDayOf(last.year, last.month))
      );

      const columns = buildMonthlyFlow(records.map(toFlowRow), {
        opening: await openingBalance(ctx.user.id, accounts, monthStart(first.year, first.month)),
        months,
        todayIso: today,
      });

      const realized = columns.filter(column => !column.projected && column.outgoing > 0);
      const averageOutflow = realized.length > 0
        ? roundCurrency(realized.reduce((sum, column) => sum + column.outgoing, 0) / realized.length)
        : 0;
      const cashToday = await openingBalance(ctx.user.id, accounts, addOneDay(today));

      return {
        span: input.span,
        today,
        from: monthLabel(first.year, first.month),
        to: monthLabel(last.year, last.month),
        columns,
        totals: {
          incoming: roundCurrency(columns.reduce((sum, column) => sum + column.incoming, 0)),
          outgoing: roundCurrency(columns.reduce((sum, column) => sum + column.outgoing, 0)),
          opening: columns[0]?.opening ?? 0,
          closing: columns[columns.length - 1]?.closing ?? 0,
        },
        closingDate: lastDayOf(last.year, last.month),
        averageOutflow: Math.round(averageOutflow * 100) / 100,
        runway: runwayMonths(cashToday, averageOutflow),
      };
    }),
});
