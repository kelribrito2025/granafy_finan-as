import { z } from "zod";
import {
  chaveDoMes,
  contasDoRelatorio,
  diaAnterior,
  fimExclusivoDoMes,
  inicioDoMes,
  mesDe,
  mesesAnteriores,
  mesesConsolidados,
  mesesDaJanela,
  rotuloDoPeriodo,
  totais,
  type ContaBase,
} from "@shared/relatorios";
import { roundCurrency } from "@shared/currency";
import { escopoDe } from "../escopo";
import { protectedProcedure, router } from "../_core/trpc";
import { userToday } from "../userToday";
import * as db from "../db";

/*
 * Relatórios: uma consulta serve as três telas.
 *
 * Só leitura, então `protectedProcedure`: o contador vê o relatório da empresa
 * que lhe foi aberta, como vê o resto. Todo número aqui vem do que está PAGO,
 * pela data do lançamento, com a mesma regra de saldo inicial com data das
 * outras somas de caixa — para o "saldo final" daqui bater com o "caixa
 * disponível" do painel no mesmo dia.
 */

const entrada = z.object({
  janela: z.enum(["6m", "12m", "ano"]).default("6m"),
  /** O último mês da janela. Sem ele, o mês de hoje no fuso da conta. */
  ate: z.object({ year: z.number().int().min(2000).max(2200), month: z.number().int().min(1).max(12) }).optional(),
});

export const relatoriosRouter = router({
  fluxo: protectedProcedure.input(entrada).query(async ({ ctx, input }) => {
    const escopo = escopoDe(ctx);
    const hoje = await userToday(ctx.user.id);
    const ate = input.ate ?? mesDe(hoje);
    const meses = mesesDaJanela(input.janela, ate);
    const anteriores = mesesAnteriores(meses);
    const inicio = inicioDoMes(meses[0]!);
    const fim = fimExclusivoDoMes(meses[meses.length - 1]!);

    const [contas, pagoAntesPorConta, linhas, pagoAntes, temLancamentos] = await Promise.all([
      db.listFinancialAccounts(escopo),
      db.getAccountBalances(escopo, diaAnterior(inicio)),
      db.movimentoMensalPorConta(escopo, inicioDoMes(anteriores[0]!), fim),
      db.sumPaidBefore(escopo, inicio),
      db.temLancamentoPago(escopo),
    ]);

    const chavesAtuais = new Set(meses.map(chaveDoMes));
    const linhasAtuais = linhas.filter(l => chavesAtuais.has(l.mes));
    const linhasAnteriores = linhas.filter(l => !chavesAtuais.has(l.mes));

    const base: ContaBase[] = contas.map(c => ({
      id: c.id,
      name: c.name,
      institution: c.institution,
      accountType: c.accountType,
      isActive: c.isActive,
      initialBalance: Number(c.initialBalance),
      pagoAntes: pagoAntesPorConta.get(c.id) ?? 0,
    }));
    const saldoInicial = roundCurrency(base.reduce((s, c) => s + c.initialBalance, 0) + pagoAntes);
    const anterior = totais(mesesConsolidados(anteriores, linhasAnteriores));

    return {
      janela: input.janela,
      ate,
      hoje,
      periodo: rotuloDoPeriodo(meses),
      meses: mesesConsolidados(meses, linhasAtuais),
      saldoInicial,
      contas: contasDoRelatorio(meses, base, linhasAtuais),
      anterior: { entradas: anterior.entradas, saidas: anterior.saidas, margem: anterior.margem },
      temLancamentos,
      temContas: contas.length > 0,
    };
  }),
});
