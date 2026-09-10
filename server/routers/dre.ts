import { z } from "zod";
import {
  breakEvenRevenue,
  buildDreStatement,
  variationOf,
  type DreRow,
} from "@shared/dre";
import { addDays, calculateItemBookValue, roundCurrency } from "../balanceSheet";
import { escopoDe } from "../escopo";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const SHORT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const monthSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
  regime: z.enum(["competencia", "caixa"]).default("competencia"),
});

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Primeiro dia do mês seguinte: o fim exclusivo das consultas por período. */
function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

function lastDayOf(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function shiftMonth(year: number, month: number, offset: number) {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function monthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month - 1]} de ${year}`;
}

type TransactionRecord = Awaited<ReturnType<typeof db.listTransactionsByPeriod>>[number];

function toDreRow(record: TransactionRecord): DreRow {
  return {
    category: record.category,
    type: record.type,
    amount: Number(record.amount),
    status: record.status,
  };
}

/**
 * A depreciação dos bens no mês: o quanto o valor contábil andou entre a véspera
 * do primeiro dia e o último. Sai do mesmo cálculo que o balanço usa, para as
 * duas telas nunca discordarem sobre o mesmo bem.
 */
function assetDepreciationIn(
  items: Awaited<ReturnType<typeof db.listPatrimonialItems>>,
  year: number,
  month: number
) {
  const before = addDays(monthStart(year, month), -1);
  const end = lastDayOf(year, month);
  let total = 0;
  for (const item of items) {
    if (item.valuationMethod !== "depreciacao_linear") continue;
    const fall = calculateItemBookValue(item, before) - calculateItemBookValue(item, end);
    if (fall > 0) total += fall;
  }
  return roundCurrency(total);
}

/**
 * O dia em que a receita líquida acumulada cobre o ponto de equilíbrio.
 *
 * Percorre o mês somando dia a dia; devolve null quando o mês termina sem
 * alcançar — que é a informação útil quando não alcançou.
 */
function breakEvenDay(rows: readonly TransactionRecord[], target: number | null, regime: string) {
  if (target === null || target <= 0) return null;
  const byDay = new Map<string, number>();
  for (const record of rows) {
    if (record.type === "transferencia") continue;
    if (regime === "caixa" && record.status !== "Pago") continue;
    const amount = Number(record.amount);
    if (amount <= 0) continue;
    byDay.set(record.transactionDate, (byDay.get(record.transactionDate) ?? 0) + amount);
  }

  let running = 0;
  for (const day of Array.from(byDay.keys()).sort()) {
    running += byDay.get(day) ?? 0;
    if (running >= target) return day;
  }
  return null;
}

export const dreRouter = router({
  /** A DRE de um mês, com a coluna de variação contra o mês anterior. */
  statement: protectedProcedure.input(monthSchema).query(async ({ ctx, input }) => {
    const previous = shiftMonth(input.year, input.month, -1);
    const [records, items, snapshots] = await Promise.all([
      db.listTransactionsByPeriod(
        escopoDe(ctx),
        monthStart(previous.year, previous.month),
        monthEnd(input.year, input.month)
      ),
      db.listPatrimonialItems(escopoDe(ctx)),
      db.listBalanceSheetSnapshots(escopoDe(ctx), 24),
    ]);

    const start = monthStart(input.year, input.month);
    const currentRecords = records.filter(record => record.transactionDate >= start);
    const previousRecords = records.filter(record => record.transactionDate < start);

    const current = buildDreStatement(currentRecords.map(toDreRow), {
      regime: input.regime,
      assetDepreciation: assetDepreciationIn(items, input.year, input.month),
    });
    const before = buildDreStatement(previousRecords.map(toDreRow), {
      regime: input.regime,
      assetDepreciation: assetDepreciationIn(items, previous.year, previous.month),
    });

    const previousByKey = new Map(before.lines.map(line => [line.key, line.value]));
    const breakEven = breakEvenRevenue(current.totals);

    return {
      year: input.year,
      month: input.month,
      regime: input.regime,
      label: monthLabel(input.year, input.month),
      previousLabel: monthLabel(previous.year, previous.month),
      lines: current.lines.map(line => ({
        ...line,
        previous: previousByKey.get(line.key) ?? 0,
        variation: variationOf(line.value, previousByKey.get(line.key) ?? 0),
      })),
      totals: current.totals,
      previousTotals: before.totals,
      breakEven,
      breakEvenDay: breakEvenDay(currentRecords, breakEven, input.regime),
      // Só o que entrou na demonstração: no regime de caixa o pendente fica de fora.
      transactionCount: currentRecords.filter(record =>
        record.type !== "transferencia" && (input.regime === "competencia" || record.status === "Pago")
      ).length,
      closedAt: snapshots.find(snapshot => snapshot.referenceDate === lastDayOf(input.year, input.month))?.updatedAt ?? null,
    };
  }),

  /** As mesmas contas em várias colunas: seis meses (semestre) ou doze (ano). */
  series: protectedProcedure
    .input(monthSchema.extend({ span: z.union([z.literal(6), z.literal(12)]).default(6) }))
    .query(async ({ ctx, input }) => {
      const first = shiftMonth(input.year, input.month, -(input.span - 1));
      const [records, items] = await Promise.all([
        db.listTransactionsByPeriod(
          escopoDe(ctx),
          monthStart(first.year, first.month),
          monthEnd(input.year, input.month)
        ),
        db.listPatrimonialItems(escopoDe(ctx)),
      ]);

      const months = Array.from({ length: input.span }, (_, index) => shiftMonth(first.year, first.month, index));
      const columns = months.map(({ year, month }) => {
        const start = monthStart(year, month);
        const end = monthEnd(year, month);
        const statement = buildDreStatement(
          records.filter(record => record.transactionDate >= start && record.transactionDate < end).map(toDreRow),
          { regime: input.regime, assetDepreciation: assetDepreciationIn(items, year, month) }
        );
        return {
          year,
          month,
          label: SHORT_MONTHS[month - 1],
          isCurrent: year === input.year && month === input.month,
          totals: statement.totals,
          /** As raízes de despesa operacional, para a tela abrir uma linha por raiz. */
          operatingRoots: statement.lines
            .filter(line => line.kind === "item" && line.key.startsWith("despesas_operacionais/"))
            .map(line => ({ label: line.label, value: line.value })),
        };
      });

      return {
        regime: input.regime,
        span: input.span,
        from: monthLabel(first.year, first.month),
        to: monthLabel(input.year, input.month),
        columns,
      };
    }),
});

export { assetDepreciationIn, breakEvenDay, lastDayOf, shiftMonth };
