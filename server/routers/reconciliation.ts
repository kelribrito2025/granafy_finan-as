import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MAX_DATE_DISTANCE_DAYS,
  suggestAll,
  suggestionLabel,
  summarizeBatch,
  type LedgerSide,
  type MovementSide,
  type SuggestionRule,
} from "@shared/reconciliation";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const periodSchema = z.object({
  accountId: z.number().int().positive().nullable().default(null),
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
});

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function lastDayOf(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type MovementRecord = Awaited<ReturnType<typeof db.listBankMovements>>[number];

function toMovementSide(movement: MovementRecord): MovementSide {
  return {
    id: movement.id,
    accountId: movement.accountId,
    movementDate: movement.movementDate,
    description: movement.description,
    contact: movement.contact,
    amount: Number(movement.amount),
  };
}

/**
 * A conta que a tela abre por padrão: a primeira com movimentação no mês, ou a
 * primeira ativa. Abrir numa conta vazia faria a tela parecer quebrada.
 */
async function resolveAccount(userId: number, requested: number | null) {
  const accounts = (await db.listFinancialAccounts(userId)).filter(account => account.isActive);
  if (accounts.length === 0) return { accounts, account: null };
  const account = requested
    ? accounts.find(item => item.id === requested) ?? null
    : accounts[0];
  return { accounts, account };
}

export const reconciliationRouter = router({
  /** A fila de revisão do mês: movimentações, sugestões e os números do topo. */
  overview: protectedProcedure.input(periodSchema).query(async ({ ctx, input }) => {
    const { accounts, account } = await resolveAccount(ctx.user.id, input.accountId);
    const start = monthStart(input.year, input.month);
    const end = lastDayOf(input.year, input.month);
    const label = `${MONTH_NAMES[input.month - 1]} de ${input.year}`;

    if (!account) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cadastre uma conta bancária para conciliar." });
    }

    const [movements, candidateRows, rules, statement] = await Promise.all([
      db.listBankMovements(ctx.user.id, account.id, start, end),
      // A janela de candidatos passa dos limites do mês: um lançamento do dia 30
      // pode parear com uma movimentação do dia 2 do mês seguinte.
      db.listUnlinkedTransactions(
        ctx.user.id,
        account.id,
        addDays(start, -MAX_DATE_DISTANCE_DAYS),
        addDays(end, MAX_DATE_DISTANCE_DAYS)
      ),
      db.listCategoryRules(ctx.user.id),
      db.getStatementBalance(ctx.user.id, account.id, end),
    ]);

    const links = await db.listReconciliationLinks(ctx.user.id, movements.map(movement => movement.id));
    const linkedTransactionIds = Array.from(new Set(links.map(link => link.transactionId)));
    const linkedTransactions = await db.getTransactionsByIds(ctx.user.id, linkedTransactionIds);
    const transactionById = new Map(linkedTransactions.map(transaction => [transaction.id, transaction]));
    const linkByMovement = new Map(links.map(link => [link.movementId, link]));

    const candidates: LedgerSide[] = candidateRows.map(row => ({
      id: row.id,
      accountId: row.accountId,
      transactionDate: row.transactionDate,
      description: row.description,
      contact: row.contact,
      amount: Number(row.amount),
      category: row.category,
    }));

    const suggestionRules: SuggestionRule[] = rules
      .filter(rule => rule.isActive)
      .map(rule => ({
        id: rule.id,
        matchValue: rule.matchValue,
        category: rule.category,
        categoryId: rule.categoryId,
      }));

    const pending = movements.filter(movement => !linkByMovement.has(movement.id) && movement.status !== "classificado");
    const suggestions = suggestAll(pending.map(toMovementSide), candidates, suggestionRules);

    const items = movements.map(movement => {
      const link = linkByMovement.get(movement.id);
      const linked = link ? transactionById.get(link.transactionId) : undefined;
      const suggestion = suggestions.get(movement.id);
      const candidate = suggestion ? candidates.find(item => item.id === suggestion.transactionId) : undefined;

      return {
        id: movement.id,
        movementDate: movement.movementDate,
        description: movement.description,
        contact: movement.contact,
        amount: Number(movement.amount),
        status: link ? ("conciliado" as const) : movement.status === "classificado" ? ("classificado" as const) : suggestion ? ("sugerido" as const) : ("sem_par" as const),
        classification: movement.classification,
        reconciledAt: movement.reconciledAt,
        linkedTransaction: linked
          ? { id: linked.id, description: linked.description, category: linked.category, amount: Number(linked.amount) }
          : null,
        suggestion: suggestion && candidate
          ? {
              transactionId: suggestion.transactionId,
              description: candidate.description,
              category: candidate.category,
              confidence: suggestion.confidence,
              label: suggestionLabel(suggestion),
            }
          : null,
      };
    });

    const conciliados = items.filter(item => item.status === "conciliado").length;
    const sugeridos = items.filter(item => item.status === "sugerido").length;
    const semPar = items.filter(item => item.status === "sem_par").length;
    const classificados = items.filter(item => item.status === "classificado").length;

    /*
     * O saldo do sistema para comparar com o do banco: só o que está pago na
     * conta até a data-base do extrato. Pendente não passou pelo banco, então
     * incluí-lo criaria uma diferença que não existe.
     */
    const balances = await db.getAccountBalances(ctx.user.id, statement?.asOf ?? end);
    const systemBalance = Number(account.initialBalance) + (balances.get(account.id) ?? 0);
    const difference = statement ? Math.round((statement.balance - systemBalance) * 100) / 100 : null;

    return {
      label,
      year: input.year,
      month: input.month,
      account: { id: account.id, name: account.name, institution: account.institution },
      accounts: accounts.map(item => ({ id: item.id, name: item.name, institution: item.institution })),
      items,
      counts: {
        total: items.length,
        conciliados,
        sugeridos,
        semPar,
        classificados,
        pendentes: sugeridos + semPar,
      },
      progress: items.length > 0 ? Math.round((conciliados / items.length) * 100) : 100,
      balance: {
        statement: statement?.balance ?? null,
        statementDate: statement?.asOf ?? null,
        system: Math.round(systemBalance * 100) / 100,
        difference,
      },
      rules: suggestionRules.map(rule => ({ id: rule.id, matchValue: rule.matchValue, category: rule.category })),
    };
  }),

  /** Aceita a sugestão de uma movimentação, ou vincula a um lançamento escolhido. */
  confirm: protectedProcedure
    .input(z.object({
      movementId: z.number().int().positive(),
      transactionId: z.number().int().positive(),
      origin: z.enum(["sugestao", "manual"]).default("manual"),
    }))
    .mutation(async ({ ctx, input }) => {
      const movement = await db.getBankMovement(ctx.user.id, input.movementId);
      if (!movement) throw new TRPCError({ code: "NOT_FOUND", message: "Movimentação não encontrada" });

      const existing = await db.listReconciliationLinks(ctx.user.id, [movement.id]);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Esta movimentação já está conciliada" });
      }

      const [transaction] = await db.getTransactionsByIds(ctx.user.id, [input.transactionId]);
      if (!transaction) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });

      /*
       * As mesmas travas da sugestão valem para a escolha manual: conciliar
       * valores diferentes é o erro que a tela existe para impedir, e ele não
       * fica menos errado por ter sido feito à mão.
       */
      if (Math.round(Number(transaction.amount) * 100) !== Math.round(Number(movement.amount) * 100)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O valor do lançamento é diferente do valor da movimentação" });
      }
      if (transaction.accountId !== movement.accountId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O lançamento é de outra conta" });
      }

      await db.linkMovement({
        userId: ctx.user.id,
        movementId: movement.id,
        transactionId: transaction.id,
        amount: movement.amount,
        origin: input.origin,
        previousStatus: movement.status,
        detail: `${movement.description} ↔ ${transaction.description}`,
      });

      return { success: true } as const;
    }),

  /**
   * Confirma as sugestões de várias movimentações de uma vez.
   *
   * As sugestões são recalculadas aqui: entre a tela ter carregado e o clique,
   * um lançamento pode ter sido conciliado por outro caminho. O que não casa
   * mais é devolvido como pulado, em vez de conciliado no escuro.
   */
  confirmBatch: protectedProcedure
    .input(z.object({
      movementIds: z.array(z.number().int().positive()).min(1).max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      const movements = (await Promise.all(
        input.movementIds.map(id => db.getBankMovement(ctx.user.id, id))
      )).filter((movement): movement is NonNullable<typeof movement> => Boolean(movement));

      if (movements.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma movimentação encontrada" });
      }

      const accountId = movements[0].accountId;
      if (movements.some(movement => movement.accountId !== accountId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione movimentações de uma conta só" });
      }

      const dates = movements.map(movement => movement.movementDate).sort();
      const [candidateRows, rules, existingLinks] = await Promise.all([
        db.listUnlinkedTransactions(
          ctx.user.id,
          accountId,
          addDays(dates[0], -MAX_DATE_DISTANCE_DAYS),
          addDays(dates[dates.length - 1], MAX_DATE_DISTANCE_DAYS)
        ),
        db.listCategoryRules(ctx.user.id),
        db.listReconciliationLinks(ctx.user.id, movements.map(movement => movement.id)),
      ]);

      const jaConciliadas = new Set(existingLinks.map(link => link.movementId));
      const pendentes = movements.filter(movement => !jaConciliadas.has(movement.id));

      const suggestions = suggestAll(
        pendentes.map(toMovementSide),
        candidateRows.map(row => ({
          id: row.id,
          accountId: row.accountId,
          transactionDate: row.transactionDate,
          description: row.description,
          contact: row.contact,
          amount: Number(row.amount),
          category: row.category,
        })),
        rules.filter(rule => rule.isActive).map(rule => ({
          id: rule.id,
          matchValue: rule.matchValue,
          category: rule.category,
          categoryId: rule.categoryId,
        }))
      );

      let conciliadas = 0;
      const puladas: number[] = [];
      for (const movement of pendentes) {
        const suggestion = suggestions.get(movement.id);
        if (!suggestion) {
          puladas.push(movement.id);
          continue;
        }
        await db.linkMovement({
          userId: ctx.user.id,
          movementId: movement.id,
          transactionId: suggestion.transactionId,
          amount: movement.amount,
          origin: "sugestao",
          previousStatus: movement.status,
          detail: `lote · ${suggestionLabel(suggestion)}`,
        });
        conciliadas += 1;
      }

      return {
        conciliadas,
        puladas: puladas.length + jaConciliadas.size,
        summary: summarizeBatch(movements.map(movement => Number(movement.amount))),
      };
    }),

  /** O histórico de uma movimentação. */
  history: protectedProcedure
    .input(z.object({ movementId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const movement = await db.getBankMovement(ctx.user.id, input.movementId);
      if (!movement) throw new TRPCError({ code: "NOT_FOUND", message: "Movimentação não encontrada" });
      return db.listReconciliationAudit(ctx.user.id, input.movementId);
    }),
});
