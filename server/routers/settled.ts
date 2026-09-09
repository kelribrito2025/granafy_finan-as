import { roundCurrency } from "@shared/currency";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

const monthSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** O primeiro dia do mês seguinte: o recorte do banco é exclusivo à direita. */
function nextMonthStart(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Pagas e recebidas: só o que já foi liquidado, pela data da liquidação.
 *
 * A tela de "a pagar e receber" lista o que está em aberto, pelo vencimento.
 * Esta lista o que já se moveu, pelo dia em que se moveu — um título vencido em
 * agosto e pago em setembro sai de lá e aparece aqui, em setembro. Nada se cria
 * por aqui: consultar, exportar e estornar.
 */
export const settledRouter = router({
  overview: protectedProcedure.input(monthSchema).query(async ({ ctx, input }) => {
    const from = monthStart(input.year, input.month);
    const to = nextMonthStart(input.year, input.month);

    /*
     * As duas consultas saem juntas. Em série pagariam duas idas e voltas ao
     * TiDB, e a agregação inteira custa menos que uma delas — a lição do 2.7.
     */
    const [totals, items] = await Promise.all([
      db.getSettledTotals(ctx.user.id, from, to),
      db.listSettledInMonth(ctx.user.id, from, to),
    ]);

    const received = roundCurrency(totals.received);
    const paid = roundCurrency(totals.paid);

    return {
      year: input.year,
      month: input.month,
      label: `${MONTH_NAMES[input.month - 1]} de ${input.year}`,
      items: items.map(item => ({ ...item, amount: Number(item.amount) })),
      totals: {
        received,
        receivedCount: totals.receivedCount,
        paid,
        paidCount: totals.paidCount,
        /** A soma bruta das duas pontas, não o líquido: é o que se moveu. */
        moved: roundCurrency(received + paid),
        result: roundCurrency(received - paid),
        /*
         * Nulo num mês sem título liquidado. Zero dias e "não houve movimento"
         * são coisas diferentes, e a tela precisa distinguir para não escrever
         * "0,0 dias" num mês vazio.
         */
        averageDelayDays: totals.averageDelayDays,
        lateCount: totals.lateCount,
        lastSettledAt: totals.lastSettledAt,
        settledDays: totals.settledDays,
      },
    };
  }),
});
