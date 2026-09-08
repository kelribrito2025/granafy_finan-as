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

/**
 * Mês fechado não aceita alteração.
 *
 * Sem isso, o fechamento seria um carimbo decorativo: alguém mexeria num
 * lançamento de agosto e o saldo fechado deixaria de bater sem deixar rastro.
 * Para mexer, reabra — e a reabertura fica no histórico.
 */
async function requireOpenPeriod(userId: number, accountId: number, date: string) {
  const [year, month] = date.split("-").map(Number);
  const period = await db.getReconciliationPeriod(userId, accountId, year, month);
  if (period && !period.reopenedAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Este mês está fechado. Reabra o período para alterar a conciliação.",
    });
  }
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

    const [movements, candidateRows, rules, statement, period] = await Promise.all([
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
      db.getReconciliationPeriod(ctx.user.id, account.id, input.year, input.month),
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
      rules: rules.filter(rule => rule.isActive).map(rule => ({
        id: rule.id,
        matchValue: rule.matchValue,
        category: rule.category,
        autoReconcile: rule.autoReconcile,
      })),
      period: period && !period.reopenedAt
        ? { closed: true as const, closedAt: period.closedAt, movementCount: period.movementCount }
        : { closed: false as const, closedAt: null, movementCount: 0 },
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
      await requireOpenPeriod(ctx.user.id, movement.accountId, movement.movementDate);

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
      // O lote pode cruzar a virada do mês: basta uma ponta fechada para recusar.
      await requireOpenPeriod(ctx.user.id, accountId, dates[0]);
      await requireOpenPeriod(ctx.user.id, accountId, dates[dates.length - 1]);

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

  /** Desfaz a conciliação de uma movimentação. */
  undo: protectedProcedure
    .input(z.object({ movementId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const movement = await db.getBankMovement(ctx.user.id, input.movementId);
      if (!movement) throw new TRPCError({ code: "NOT_FOUND", message: "Movimentação não encontrada" });

      const links = await db.listReconciliationLinks(ctx.user.id, [movement.id]);
      if (links.length === 0 && movement.status !== "classificado") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esta movimentação não está conciliada" });
      }

      await requireOpenPeriod(ctx.user.id, movement.accountId, movement.movementDate);
      await db.unlinkMovement({
        userId: ctx.user.id,
        movementId: movement.id,
        previousStatus: movement.status,
        detail: movement.description,
      });
      return { success: true } as const;
    }),

  /**
   * Classifica a movimentação sem lançamento: transferência, movimento
   * pessoal, duplicidade, estorno ou fora dos relatórios. A linha continua no
   * extrato — classificar não é apagar.
   */
  classify: protectedProcedure
    .input(z.object({
      movementId: z.number().int().positive(),
      classification: z.enum(["transferencia", "pessoal", "duplicidade", "estorno", "fora_dos_relatorios"]),
      note: z.string().trim().max(500).default(""),
      relatedMovementId: z.number().int().positive().nullable().default(null),
    }))
    .mutation(async ({ ctx, input }) => {
      const movement = await db.getBankMovement(ctx.user.id, input.movementId);
      if (!movement) throw new TRPCError({ code: "NOT_FOUND", message: "Movimentação não encontrada" });

      const links = await db.listReconciliationLinks(ctx.user.id, [movement.id]);
      if (links.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Desfaça a conciliação antes de classificar" });
      }
      // Tirar do relatório é decisão que alguém vai auditar depois; sem
      // justificativa, o histórico registra só que sumiu.
      if (input.classification === "fora_dos_relatorios" && input.note.length < 3) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Explique por que esta movimentação não entra nos relatórios" });
      }
      if (input.relatedMovementId) {
        const related = await db.getBankMovement(ctx.user.id, input.relatedMovementId);
        if (!related) throw new TRPCError({ code: "BAD_REQUEST", message: "A movimentação original não foi encontrada" });
      }

      await requireOpenPeriod(ctx.user.id, movement.accountId, movement.movementDate);
      await db.classifyMovement({
        userId: ctx.user.id,
        movementId: movement.id,
        classification: input.classification,
        note: input.note,
        relatedMovementId: input.relatedMovementId,
        previousStatus: movement.status,
      });
      return { success: true } as const;
    }),

  /**
   * Cria o lançamento que faltava — ou divide a movimentação em vários.
   *
   * A soma das partes tem que fechar com o valor da movimentação ao centavo:
   * dividir 1.000 em 400 e 500 deixaria 100 fora do razão sem ninguém avisar.
   */
  createFromMovement: protectedProcedure
    .input(z.object({
      movementId: z.number().int().positive(),
      parts: z.array(z.object({
        description: z.string().trim().min(2).max(180),
        categoryId: z.number().int().positive(),
        costCenterId: z.number().int().positive().nullable().default(null),
        amount: z.number().finite(),
      })).min(1).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const movement = await db.getBankMovement(ctx.user.id, input.movementId);
      if (!movement) throw new TRPCError({ code: "NOT_FOUND", message: "Movimentação não encontrada" });

      const links = await db.listReconciliationLinks(ctx.user.id, [movement.id]);
      if (links.length > 0) throw new TRPCError({ code: "CONFLICT", message: "Esta movimentação já está conciliada" });

      const total = input.parts.reduce((sum, part) => sum + part.amount, 0);
      if (Math.round(total * 100) !== Math.round(Number(movement.amount) * 100)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A soma das partes precisa fechar com o valor da movimentação",
        });
      }
      if (input.parts.some(part => Math.sign(part.amount) !== Math.sign(Number(movement.amount)))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "As partes precisam ter o mesmo sinal da movimentação" });
      }

      const account = await db.getFinancialAccount(ctx.user.id, movement.accountId);
      if (!account) throw new TRPCError({ code: "BAD_REQUEST", message: "Conta não encontrada" });

      const categories = await Promise.all(
        Array.from(new Set(input.parts.map(part => part.categoryId)))
          .map(id => db.getTransactionCategory(ctx.user.id, id))
      );
      const categoryById = new Map(categories.filter(Boolean).map(category => [category!.id, category!]));
      if (input.parts.some(part => !categoryById.get(part.categoryId)?.isActive)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Uma das categorias não está disponível" });
      }

      await requireOpenPeriod(ctx.user.id, movement.accountId, movement.movementDate);
      await db.createTransactionsForMovement({
        userId: ctx.user.id,
        movementId: movement.id,
        previousStatus: movement.status,
        detail: input.parts.length > 1
          ? `${input.parts.length} partes de ${movement.description}`
          : movement.description,
        parts: input.parts.map(part => ({
          type: part.amount < 0 ? ("saida" as const) : ("entrada" as const),
          transactionDate: movement.movementDate,
          description: part.description,
          contact: movement.contact,
          category: categoryById.get(part.categoryId)!.name,
          categoryId: part.categoryId,
          costCenter: "",
          costCenterId: part.costCenterId,
          amount: part.amount.toFixed(2),
          account: account.name,
          accountId: account.id,
          status: "Pago" as const,
          recurring: false,
          linkAmount: part.amount.toFixed(2),
        })),
      });

      return { success: true, criados: input.parts.length } as const;
    }),

  /**
   * Os lançamentos que podem receber um grupo de movimentações.
   *
   * Só entram os de valor igual à soma do grupo: agrupar é dizer que aquelas
   * linhas do extrato são, juntas, aquele lançamento — e isso só é verdade se
   * o total bater.
   */
  groupCandidates: protectedProcedure
    .input(z.object({ movementIds: z.array(z.number().int().positive()).min(2).max(50) }))
    .query(async ({ ctx, input }) => {
      const movements = (await Promise.all(input.movementIds.map(id => db.getBankMovement(ctx.user.id, id))))
        .filter((movement): movement is NonNullable<typeof movement> => Boolean(movement));
      if (movements.length < 2) return { total: 0, candidates: [] };

      const total = movements.reduce((sum, movement) => sum + Number(movement.amount), 0);
      const dates = movements.map(movement => movement.movementDate).sort();
      const rows = await db.listUnlinkedTransactions(
        ctx.user.id,
        movements[0].accountId,
        addDays(dates[0], -MAX_DATE_DISTANCE_DAYS),
        addDays(dates[dates.length - 1], MAX_DATE_DISTANCE_DAYS)
      );

      return {
        total: Math.round(total * 100) / 100,
        candidates: rows
          .filter(row => Math.round(Number(row.amount) * 100) === Math.round(total * 100))
          .map(row => ({
            id: row.id,
            description: row.description,
            transactionDate: row.transactionDate,
            amount: Number(row.amount),
            category: row.category,
          })),
      };
    }),

  /** Agrupa várias movimentações num lançamento só. */
  group: protectedProcedure
    .input(z.object({
      movementIds: z.array(z.number().int().positive()).min(2).max(50),
      transactionId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const movements = (await Promise.all(input.movementIds.map(id => db.getBankMovement(ctx.user.id, id))))
        .filter((movement): movement is NonNullable<typeof movement> => Boolean(movement));
      if (movements.length !== input.movementIds.length) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alguma movimentação não foi encontrada" });
      }

      const existing = await db.listReconciliationLinks(ctx.user.id, input.movementIds);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "Desfaça a conciliação das movimentações antes de agrupar" });
      }

      const [transaction] = await db.getTransactionsByIds(ctx.user.id, [input.transactionId]);
      if (!transaction) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });

      const total = movements.reduce((sum, movement) => sum + Number(movement.amount), 0);
      if (Math.round(total * 100) !== Math.round(Number(transaction.amount) * 100)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A soma das movimentações precisa fechar com o valor do lançamento",
        });
      }
      if (movements.some(movement => movement.accountId !== transaction.accountId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Movimentações e lançamento precisam ser da mesma conta" });
      }

      await requireOpenPeriod(ctx.user.id, movements[0].accountId, movements[0].movementDate);
      await db.groupMovements({
        userId: ctx.user.id,
        movementIds: movements.map(movement => movement.id),
        transactionId: transaction.id,
        amounts: movements.map(movement => movement.amount),
        detail: `${movements.length} movimentações ↔ ${transaction.description}`,
      });

      return { success: true } as const;
    }),

  /** As movimentações que compõem a diferença de saldo. */
  difference: protectedProcedure.input(periodSchema).query(async ({ ctx, input }) => {
    const { account } = await resolveAccount(ctx.user.id, input.accountId);
    if (!account) throw new TRPCError({ code: "BAD_REQUEST", message: "Conta não encontrada" });

    const start = monthStart(input.year, input.month);
    const end = lastDayOf(input.year, input.month);
    const [movements, statement] = await Promise.all([
      db.listBankMovements(ctx.user.id, account.id, start, end),
      db.getStatementBalance(ctx.user.id, account.id, end),
    ]);
    const links = await db.listReconciliationLinks(ctx.user.id, movements.map(movement => movement.id));
    const conciliadas = new Set(links.map(link => link.movementId));

    /*
     * A diferença é o que o banco viu e o razão não: movimentação sem
     * lançamento nenhum. Classificada continua contando — classificar explica
     * o dinheiro, mas não o coloca no saldo do sistema.
     */
    const responsaveis = movements.filter(movement => !conciliadas.has(movement.id));
    const balances = await db.getAccountBalances(ctx.user.id, statement?.asOf ?? end);
    const systemBalance = Number(account.initialBalance) + (balances.get(account.id) ?? 0);

    return {
      statement: statement?.balance ?? null,
      statementDate: statement?.asOf ?? null,
      system: Math.round(systemBalance * 100) / 100,
      difference: statement ? Math.round((statement.balance - systemBalance) * 100) / 100 : null,
      items: responsaveis.map(movement => ({
        id: movement.id,
        movementDate: movement.movementDate,
        description: movement.description,
        amount: Number(movement.amount),
        classification: movement.classification,
      })),
      accountName: account.name,
    };
  }),

  /**
   * Fecha o mês. Só com diferença zero: fechar com sobra é assinar embaixo de
   * um número que não bate.
   */
  closePeriod: protectedProcedure.input(periodSchema).mutation(async ({ ctx, input }) => {
    const { account } = await resolveAccount(ctx.user.id, input.accountId);
    if (!account) throw new TRPCError({ code: "BAD_REQUEST", message: "Conta não encontrada" });

    const start = monthStart(input.year, input.month);
    const end = lastDayOf(input.year, input.month);
    const [movements, statement] = await Promise.all([
      db.listBankMovements(ctx.user.id, account.id, start, end),
      db.getStatementBalance(ctx.user.id, account.id, end),
    ]);

    if (!statement) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Importe um extrato que declare o saldo para poder fechar o mês" });
    }

    const balances = await db.getAccountBalances(ctx.user.id, statement.asOf);
    const systemBalance = Number(account.initialBalance) + (balances.get(account.id) ?? 0);
    const difference = Math.round((statement.balance - systemBalance) * 100) / 100;
    if (difference !== 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "O mês só pode ser fechado com a diferença de saldo zerada",
      });
    }

    await db.closeReconciliationPeriod({
      userId: ctx.user.id,
      accountId: account.id,
      year: input.year,
      month: input.month,
      statementBalance: statement.balance.toFixed(2),
      systemBalance: systemBalance.toFixed(2),
      movementCount: movements.length,
    });
    return { success: true } as const;
  }),

  /** Reabre o mês. Exige motivo, e ele fica no histórico. */
  reopenPeriod: protectedProcedure
    .input(periodSchema.extend({ reason: z.string().trim().min(3, "Diga por que está reabrindo").max(500) }))
    .mutation(async ({ ctx, input }) => {
      const { account } = await resolveAccount(ctx.user.id, input.accountId);
      if (!account) throw new TRPCError({ code: "BAD_REQUEST", message: "Conta não encontrada" });

      const period = await db.getReconciliationPeriod(ctx.user.id, account.id, input.year, input.month);
      if (!period || period.reopenedAt) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este mês não está fechado" });
      }

      await db.reopenReconciliationPeriod({
        userId: ctx.user.id,
        periodId: period.id,
        reason: input.reason,
        detail: `${String(input.month).padStart(2, "0")}/${input.year} · ${input.reason}`,
      });
      return { success: true } as const;
    }),

  /**
   * Concilia o que está coberto por uma regra marcada como automática.
   *
   * A ação é explícita de propósito. A regra é a autorização de conciliar sem
   * conferir uma a uma, mas quem decide quando isso roda é o usuário: gravar no
   * razão por conta própria enquanto a tela só estava aberta seria surpresa,
   * não automação.
   */
  applyAutoRules: protectedProcedure.input(periodSchema).mutation(async ({ ctx, input }) => {
    const { account } = await resolveAccount(ctx.user.id, input.accountId);
    if (!account) throw new TRPCError({ code: "BAD_REQUEST", message: "Conta não encontrada" });

    const start = monthStart(input.year, input.month);
    const end = lastDayOf(input.year, input.month);
    const [movements, candidateRows, rules] = await Promise.all([
      db.listBankMovements(ctx.user.id, account.id, start, end),
      db.listUnlinkedTransactions(
        ctx.user.id,
        account.id,
        addDays(start, -MAX_DATE_DISTANCE_DAYS),
        addDays(end, MAX_DATE_DISTANCE_DAYS)
      ),
      db.listCategoryRules(ctx.user.id),
    ]);

    const automaticas = rules.filter(rule => rule.isActive && rule.autoReconcile);
    if (automaticas.length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Nenhuma regra está marcada para conciliar sozinha" });
    }

    const links = await db.listReconciliationLinks(ctx.user.id, movements.map(movement => movement.id));
    const conciliadas = new Set(links.map(link => link.movementId));
    const pendentes = movements.filter(movement => !conciliadas.has(movement.id) && movement.status !== "classificado");

    const suggestionRules: SuggestionRule[] = automaticas.map(rule => ({
      id: rule.id,
      matchValue: rule.matchValue,
      category: rule.category,
      categoryId: rule.categoryId,
    }));

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
      suggestionRules
    );

    let aplicadas = 0;
    for (const movement of pendentes) {
      const suggestion = suggestions.get(movement.id);
      // Só entra o que a própria regra explicou; o resto continua esperando
      // confirmação, que é o combinado.
      if (!suggestion || !suggestion.reason.startsWith("regra")) continue;
      await requireOpenPeriod(ctx.user.id, movement.accountId, movement.movementDate);
      await db.linkMovement({
        userId: ctx.user.id,
        movementId: movement.id,
        transactionId: suggestion.transactionId,
        amount: movement.amount,
        origin: "regra",
        previousStatus: movement.status,
        detail: suggestionLabel(suggestion),
      });
      aplicadas += 1;
    }

    return { aplicadas };
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
