import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TransactionRecord } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { buildRecurrenceDates, MAX_RECURRENCE_MONTHS, type RecurrenceStart } from "../recurrence";
import { storageGetSignedUrl, storagePut } from "../storage";

/** Categoria fixa das duas pernas da transferência: não é receita nem despesa. */
export const TRANSFER_CATEGORY = "Transferência";

const transactionValuesBaseSchema = z.object({
  type: z.enum(["entrada", "saida", "transferencia"]),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  description: z.string().trim().min(2, "Informe a descrição").max(180),
  contact: z.string().trim().max(120).default(""),
  // Obrigatória para entrada e saída; a transferência recebe TRANSFER_CATEGORY.
  category: z.string().trim().max(120).default(""),
  amount: z.number().finite().positive("O valor deve ser maior que zero").max(999_999_999_999.99),
  account: z.string().trim().min(1, "Informe a conta").max(80),
  accountId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  destinationAccountId: z.number().int().positive().nullable().optional(),
  costCenter: z.string().trim().max(120).default(""),
  costCenterId: z.number().int().positive().nullable().optional(),
  status: z.enum(["Pago", "Pendente"]),
  recurring: z.boolean().default(false),
  recurringMonths: z.number().int().min(1).max(MAX_RECURRENCE_MONTHS).nullable().optional(),
  recurrenceStart: z.enum(["este_mes", "proximo_mes"]).default("este_mes"),
  attachmentKey: z.string().trim().max(255).nullable().optional(),
  attachmentName: z.string().trim().max(180).nullable().optional(),
});

type TransactionValuesInput = z.infer<typeof transactionValuesBaseSchema>;

function refineTransactionValues(value: TransactionValuesInput, ctx: z.RefinementCtx) {
  if (value.type === "transferencia") {
    if (!value.accountId) {
      ctx.addIssue({ code: "custom", path: ["accountId"], message: "Escolha a conta de origem" });
    }
    if (!value.destinationAccountId) {
      ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "Escolha a conta de destino" });
    }
    if (value.accountId && value.accountId === value.destinationAccountId) {
      ctx.addIssue({ code: "custom", path: ["destinationAccountId"], message: "A conta de destino precisa ser diferente da origem" });
    }
  } else if (value.category.length < 2) {
    ctx.addIssue({ code: "custom", path: ["category"], message: "Informe a categoria" });
  }
  if (value.recurring && !value.recurringMonths) {
    ctx.addIssue({ code: "custom", path: ["recurringMonths"], message: "Informe por quantos meses repetir" });
  }
  if (!value.recurring && value.recurringMonths) {
    ctx.addIssue({ code: "custom", path: ["recurringMonths"], message: "O prazo só se aplica a lançamentos recorrentes" });
  }
  if (Boolean(value.attachmentKey) !== Boolean(value.attachmentName)) {
    ctx.addIssue({ code: "custom", path: ["attachmentKey"], message: "Anexo incompleto" });
  }
}

const transactionValuesSchema = transactionValuesBaseSchema.superRefine(refineTransactionValues);

/**
 * "single" mexe só no lançamento aberto. "following" alcança também as parcelas
 * seguintes da mesma série que ainda não foram pagas — mês já pago é histórico e
 * nunca é reescrito nem apagado por essa via.
 */
const seriesScopeSchema = z.enum(["single", "following"]).default("single");

const transactionUpdateSchema = transactionValuesBaseSchema
  .extend({ id: z.number().int().positive(), scope: seriesScopeSchema })
  .superRefine(refineTransactionValues);

const periodSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
});

function periodBounds(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 1));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

function signedAmount(input: TransactionValuesInput) {
  const absolute = Math.abs(input.amount);
  return input.type === "saida" ? -absolute : absolute;
}

export function shouldMaterializeRecurrence(
  existing: Pick<TransactionRecord, "recurrenceGroupId" | "transferGroupId">,
  values: Pick<TransactionValuesInput, "recurring" | "recurringMonths">,
) {
  return !existing.recurrenceGroupId
    && !existing.transferGroupId
    && values.recurring
    && Boolean(values.recurringMonths);
}

function toTransaction(record: TransactionRecord) {
  return {
    id: record.id,
    type: record.type,
    transactionDate: record.transactionDate,
    description: record.description,
    contact: record.contact,
    category: record.category,
    amount: Number(record.amount),
    account: record.account,
    accountId: record.accountId,
    categoryId: record.categoryId,
    costCenter: record.costCenter,
    costCenterId: record.costCenterId,
    importBatchId: record.importBatchId,
    status: record.status,
    recurring: record.recurring,
    recurringMonths: record.recurringMonths,
    recurrenceGroupId: record.recurrenceGroupId,
    recurrenceIndex: record.recurrenceIndex,
    attachmentKey: record.attachmentKey,
    attachmentName: record.attachmentName,
    transferGroupId: record.transferGroupId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/** Transferência move dinheiro entre contas do próprio usuário: não é receita nem despesa. */
function isCashFlow(record: Pick<TransactionRecord, "type">) {
  return record.type !== "transferencia";
}

async function resolveTransactionOrganization(userId: number, input: TransactionValuesInput) {
  const normalized = { ...input };
  if (input.accountId) {
    const account = await db.getFinancialAccount(userId, input.accountId);
    if (!account?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Conta não encontrada ou inativa" });
    normalized.account = account.name;
  }
  if (input.categoryId) {
    const category = await db.getTransactionCategory(userId, input.categoryId);
    if (!category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Categoria não encontrada ou inativa" });
    if (category.type !== "ambos" && category.type !== input.type) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A categoria não é compatível com o tipo do lançamento" });
    }
    normalized.category = category.name;
  }
  if (input.costCenterId) {
    const costCenter = await db.getCostCenter(userId, input.costCenterId);
    if (!costCenter?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Centro de custo não encontrado ou inativo" });
    normalized.costCenter = costCenter.name;
  } else {
    normalized.costCenter = "";
  }
  return normalized;
}

/**
 * Monta as duas pernas da transferência a partir de um único formulário: saída na
 * conta de origem e entrada na de destino, com o mesmo grupo, data, situação,
 * centro de custo e anexo. A categoria é fixa para não poluir os relatórios.
 */
async function buildTransferLegs(userId: number, input: TransactionValuesInput) {
  const [origin, destination] = await Promise.all([
    db.getFinancialAccount(userId, input.accountId!),
    db.getFinancialAccount(userId, input.destinationAccountId!),
  ]);
  if (!origin?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Conta de origem não encontrada ou inativa" });
  if (!destination?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Conta de destino não encontrada ou inativa" });

  const shared = {
    type: "transferencia" as const,
    transactionDate: input.transactionDate,
    contact: input.contact,
    category: TRANSFER_CATEGORY,
    categoryId: null,
    costCenter: input.costCenter,
    costCenterId: input.costCenterId ?? null,
    status: input.status,
    recurring: input.recurring,
    recurringMonths: input.recurringMonths ?? null,
    attachmentKey: input.attachmentKey ?? null,
    attachmentName: input.attachmentName ?? null,
  };
  const value = Math.abs(input.amount);

  return {
    origin: {
      ...shared,
      description: `${input.description} · para ${destination.name}`.slice(0, 180),
      amount: (-value).toFixed(2),
      account: origin.name,
      accountId: origin.id,
    },
    destination: {
      ...shared,
      description: `${input.description} · de ${origin.name}`.slice(0, 180),
      amount: value.toFixed(2),
      account: destination.name,
      accountId: destination.id,
    },
  };
}

function summarize(records: TransactionRecord[]) {
  const cashFlow = records.filter(isCashFlow);
  const incoming = cashFlow.reduce((sum, record) => sum + Math.max(0, Number(record.amount)), 0);
  const outgoing = cashFlow.reduce((sum, record) => sum + Math.abs(Math.min(0, Number(record.amount))), 0);
  return { incoming, outgoing, balance: incoming - outgoing };
}

/** 8 MB de arquivo. Em base64 o corpo da requisição fica em ~10,7 MB. */
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const ATTACHMENT_CONTENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** Pastas de anexo. O nome entra na chave, então a lista é fechada. */
const ATTACHMENT_FOLDERS = ["lancamentos", "bens"] as const;
type AttachmentFolder = (typeof ATTACHMENT_FOLDERS)[number];

/**
 * Todo anexo mora sob o prefixo do dono. Ler exige que a chave comece com um
 * prefixo do usuário da requisição, então uma chave vazada não serve para
 * alcançar o anexo de outra conta.
 */
function attachmentPrefix(userId: number, folder: AttachmentFolder) {
  return `${folder}/${userId}/`;
}

function ownsAttachment(userId: number, key: string) {
  return ATTACHMENT_FOLDERS.some(folder => key.startsWith(attachmentPrefix(userId, folder)));
}

/**
 * As linhas que uma única submissão do formulário produz.
 *
 * Sem recorrência é uma linha (ou duas, na transferência). Com recorrência é uma
 * por mês, todas no mesmo grupo. Só a primeira parcela herda a situação escolhida:
 * dinheiro de novembro não foi recebido hoje, e marcá-lo como pago inflaria o
 * caixa e as contas a receber do painel.
 */
async function buildRowsForCreate(userId: number, input: TransactionValuesInput) {
  const dates = input.recurring && input.recurringMonths
    ? buildRecurrenceDates(input.transactionDate, input.recurringMonths, input.recurrenceStart as RecurrenceStart)
    : [input.transactionDate];
  const recurrenceGroupId = dates.length > 1 ? randomUUID() : null;
  const statusFor = (index: number) => (index === 0 ? input.status : "Pendente" as const);
  const recurrenceIndexFor = (index: number) => (recurrenceGroupId ? index + 1 : null);

  if (input.type === "transferencia") {
    const legs = await buildTransferLegs(userId, input);
    return dates.flatMap((transactionDate, index) => {
      // Cada mês é uma transferência inteira, com o seu próprio par.
      const shared = {
        transactionDate,
        status: statusFor(index),
        transferGroupId: randomUUID(),
        recurrenceGroupId,
        recurrenceIndex: recurrenceIndexFor(index),
        recurringMonths: input.recurring ? input.recurringMonths ?? null : null,
      };
      return [{ ...legs.origin, ...shared }, { ...legs.destination, ...shared }];
    });
  }

  const {
    destinationAccountId: _unusedDestination,
    recurrenceStart: _unusedStart,
    ...normalized
  } = await resolveTransactionOrganization(userId, input);
  const amount = signedAmount(input).toFixed(2);

  return dates.map((transactionDate, index) => ({
    ...normalized,
    transactionDate,
    amount,
    status: statusFor(index),
    costCenterId: normalized.costCenterId ?? null,
    recurringMonths: normalized.recurringMonths ?? null,
    attachmentKey: normalized.attachmentKey ?? null,
    attachmentName: normalized.attachmentName ?? null,
    recurrenceGroupId,
    recurrenceIndex: recurrenceIndexFor(index),
  }));
}

/**
 * As linhas alcançadas por uma ação de escopo "following": a clicada, as pernas
 * da mesma transferência, e as parcelas posteriores ainda não pagas.
 */
function selectSeriesTargets(group: TransactionRecord[], clicked: TransactionRecord) {
  return group.filter(record =>
    record.id === clicked.id ||
    (clicked.transferGroupId != null && record.transferGroupId === clicked.transferGroupId) ||
    (record.transactionDate > clicked.transactionDate && record.status !== "Pago")
  );
}

const MAX_BULK_DELETE_IDS = 20_000;
const MAX_BULK_UPDATE_IDS = 20_000;

const bulkUpdateChangesSchema = z.object({
  status: z.enum(["Pago", "Pendente"]).optional(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").optional(),
  accountId: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional(),
  recurring: z.boolean().optional(),
}).refine(changes => Object.values(changes).some(value => value !== undefined), "Escolha ao menos uma alteração");

export const transactionsRouter = router({
  list: protectedProcedure.input(periodSchema).query(async ({ ctx, input }) => {
    const { start, end } = periodBounds(input.year, input.month);
    const [records, previousRecords, accounts] = await Promise.all([
      db.listTransactionsByPeriod(ctx.user.id, start, end),
      db.listTransactionsBefore(ctx.user.id, start),
      db.listFinancialAccounts(ctx.user.id),
    ]);
    const initialBalance = accounts.reduce((sum, account) => sum + Number(account.initialBalance), 0);
    const previousBalance = initialBalance + previousRecords.reduce((sum, record) => sum + Number(record.amount), 0);

    return {
      items: records.map(toTransaction),
      summary: { ...summarize(records), previousBalance },
    };
  }),

  dashboard: protectedProcedure
    .input(z.object({ range: z.enum(["month", "quarter", "year"]).default("month") }).optional())
    .query(async ({ ctx, input }) => {
    const [records, accounts] = await Promise.all([
      db.listAllTransactions(ctx.user.id),
      db.listFinancialAccounts(ctx.user.id),
    ]);
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;
    const range = input?.range ?? "month";
    const startMonth = range === "year" ? 1 : range === "quarter" ? Math.floor((month - 1) / 3) * 3 + 1 : month;
    const endMonth = range === "year" ? 13 : range === "quarter" ? startMonth + 3 : month + 1;
    const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const end = endMonth === 13 ? `${year + 1}-01-01` : `${year}-${String(endMonth).padStart(2, "0")}-01`;
    const current = records.filter(record => record.transactionDate >= start && record.transactionDate < end);
    const currentSummary = summarize(current);
    const paidBalance = accounts.reduce((sum, account) => sum + Number(account.initialBalance), 0) + records
      .filter(record => record.status === "Pago")
      .reduce((sum, record) => sum + Number(record.amount), 0);
    const pendingReceivable = records.filter(record => isCashFlow(record) && record.status === "Pendente" && Number(record.amount) > 0);
    const pendingPayable = records.filter(record => isCashFlow(record) && record.status === "Pendente" && Number(record.amount) < 0);
    const todayString = today.toISOString().slice(0, 10);
    const overdue = pendingPayable.filter(record => record.transactionDate < todayString);
    const dueToday = pendingReceivable.filter(record => record.transactionDate === todayString);
    const margin = currentSummary.incoming > 0
      ? ((currentSummary.incoming - currentSummary.outgoing) / currentSummary.incoming) * 100
      : 0;

    const months = Array.from({ length: 9 }, (_, index) => {
      const date = new Date(Date.UTC(year, month - 9 + index, 1));
      const period = periodBounds(date.getUTCFullYear(), date.getUTCMonth() + 1);
      const monthRecords = records.filter(record => record.transactionDate >= period.start && record.transactionDate < period.end);
      return {
        label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", ""),
        ...summarize(monthRecords),
      };
    });

    const revenueByCategory = Array.from(
      current
        .filter(record => isCashFlow(record) && Number(record.amount) > 0)
        .reduce((groups, record) => {
          groups.set(record.category, (groups.get(record.category) ?? 0) + Number(record.amount));
          return groups;
        }, new Map<string, number>())
    )
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);

    return {
      cashAvailable: paidBalance,
      current: currentSummary,
      pendingReceivable: {
        count: pendingReceivable.length,
        amount: pendingReceivable.reduce((sum, record) => sum + Number(record.amount), 0),
      },
      pendingPayable: {
        count: pendingPayable.length,
        amount: pendingPayable.reduce((sum, record) => sum + Math.abs(Number(record.amount)), 0),
      },
      overdue: {
        count: overdue.length,
        amount: overdue.reduce((sum, record) => sum + Math.abs(Number(record.amount)), 0),
      },
      dueToday: {
        count: dueToday.length,
        amount: dueToday.reduce((sum, record) => sum + Number(record.amount), 0),
      },
      margin,
      months,
      recent: records.slice(0, 5).map(toTransaction),
      revenueByCategory,
      range,
    };
  }),

  create: protectedProcedure.input(transactionValuesSchema).mutation(async ({ ctx, input }) => {
    const rows = await buildRowsForCreate(ctx.user.id, input);
    const records = await db.createTransactionSeries(ctx.user.id, rows);
    if (records.length !== rows.length) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar o lançamento" });
    }
    const first = records.find(record => Number(record.amount) < 0 && record.type === "transferencia") ?? records[0];
    const monthCount = new Set(records.map(record => record.transactionDate)).size;
    return { ...toTransaction(first), createdCount: records.length, monthCount };
  }),

  update: protectedProcedure.input(transactionUpdateSchema).mutation(async ({ ctx, input }) => {
    const { id, scope, ...values } = input;
    const existing = await db.getTransactionById(ctx.user.id, id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });

    const wasTransfer = Boolean(existing.transferGroupId);
    if (wasTransfer !== (values.type === "transferencia")) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Não é possível converter uma transferência em entrada ou saída. Exclua e lance de novo.",
      });
    }

    // Antes da implementação das séries reais, marcar "recorrente" gravava só
    // uma flag. Ao editar uma linha avulsa, materializamos agora todas as parcelas
    // para que os meses futuros apareçam em Lançamentos, A pagar/receber, Fluxo de
    // caixa e DRE. Transferências precisam ser recriadas porque cada mês tem duas
    // pernas vinculadas.
    if (shouldMaterializeRecurrence(existing, values)) {
      const rows = await buildRowsForCreate(ctx.user.id, values);
      const records = await db.materializeTransactionSeries(ctx.user.id, id, rows);
      if (records.length !== rows.length) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar todas as parcelas" });
      }
      const first = records.find(record => record.id === id) ?? records[0];
      return { ...toTransaction(first), updatedCount: records.length };
    }
    if (!existing.recurrenceGroupId && wasTransfer && values.recurring) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Para repetir uma transferência, exclua esta linha e crie uma nova transferência recorrente.",
      });
    }

    // Cada parcela guarda a própria data e a própria situação: alcançar as
    // seguintes muda o conteúdo do lançamento, não o calendário nem o que já
    // foi quitado.
    const seriesId = scope === "following" ? existing.recurrenceGroupId : null;
    const group = seriesId ? await db.getRecurrenceGroup(ctx.user.id, seriesId) : [];
    const targets = seriesId ? selectSeriesTargets(group, existing) : [existing];

    if (wasTransfer) {
      const legs = await buildTransferLegs(ctx.user.id, values);
      const transferGroupIds = Array.from(new Set(
        targets.map(record => record.transferGroupId).filter((value): value is string => Boolean(value))
      ));
      for (const transferGroupId of transferGroupIds) {
        const month = targets.find(record => record.transferGroupId === transferGroupId)!;
        const isClicked = transferGroupId === existing.transferGroupId;
        const shared = {
          transactionDate: isClicked ? values.transactionDate : month.transactionDate,
          status: isClicked ? values.status : month.status,
          transferGroupId,
          recurrenceGroupId: month.recurrenceGroupId,
          recurrenceIndex: month.recurrenceIndex,
          recurringMonths: month.recurringMonths,
        };
        const updated = await db.updateTransferPair(
          ctx.user.id,
          transferGroupId,
          { ...legs.origin, ...shared },
          { ...legs.destination, ...shared }
        );
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Transferência incompleta no banco" });
      }
      const refreshed = await db.getTransactionById(ctx.user.id, id);
      if (!refreshed) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
      return { ...toTransaction(refreshed), updatedCount: targets.length };
    }

    const {
      destinationAccountId: _unusedDestination,
      recurrenceStart: _unusedStart,
      ...normalized
    } = await resolveTransactionOrganization(ctx.user.id, values);
    const amount = signedAmount(values).toFixed(2);

    for (const target of targets) {
      const isClicked = target.id === existing.id;
      await db.updateTransaction(ctx.user.id, target.id, {
        ...normalized,
        transactionDate: isClicked ? values.transactionDate : target.transactionDate,
        status: isClicked ? values.status : target.status,
        costCenterId: normalized.costCenterId ?? null,
        recurringMonths: target.recurringMonths,
        attachmentKey: normalized.attachmentKey ?? null,
        attachmentName: normalized.attachmentName ?? null,
        recurrenceGroupId: target.recurrenceGroupId,
        recurrenceIndex: target.recurrenceIndex,
        amount,
      });
    }

    const record = await db.getTransactionById(ctx.user.id, id);
    if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
    return { ...toTransaction(record), updatedCount: targets.length };
  }),

  duplicate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const existing = await db.getTransactionById(ctx.user.id, input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });

    if (existing.transferGroupId) {
      const group = await db.getTransferGroup(ctx.user.id, existing.transferGroupId);
      if (group.length !== 2) throw new TRPCError({ code: "CONFLICT", message: "Transferência incompleta no banco" });
      const transferGroupId = randomUUID();
      const copyLeg = (record: TransactionRecord) => ({
        type: record.type,
        transactionDate: record.transactionDate,
        description: `${record.description} (cópia)`.slice(0, 180),
        contact: record.contact,
        category: record.category,
        amount: record.amount,
        account: record.account,
        accountId: record.accountId,
        categoryId: record.categoryId,
        costCenter: record.costCenter,
        costCenterId: record.costCenterId,
        status: record.status,
        recurring: record.recurring,
        recurringMonths: record.recurringMonths,
        transferGroupId,
      });
      const [outgoing, incoming] = Number(group[0].amount) <= Number(group[1].amount)
        ? [group[0], group[1]]
        : [group[1], group[0]];
      const records = await db.createTransferPair(ctx.user.id, copyLeg(outgoing), copyLeg(incoming));
      if (records.length !== 2) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível duplicar a transferência" });
      return toTransaction(records.find(record => Number(record.amount) < 0) ?? records[0]);
    }

    const record = await db.createTransaction(ctx.user.id, {
      type: existing.type,
      transactionDate: existing.transactionDate,
      description: `${existing.description} (cópia)`.slice(0, 180),
      contact: existing.contact,
      category: existing.category,
      amount: existing.amount,
      account: existing.account,
      accountId: existing.accountId,
      categoryId: existing.categoryId,
      costCenter: existing.costCenter,
      costCenterId: existing.costCenterId,
      status: existing.status,
      // A cópia nasce avulsa: herdar o grupo faria uma parcela fantasma aparecer
      // dentro de uma série que não a conhece.
      recurring: false,
      recurringMonths: null,
      recurrenceGroupId: null,
      recurrenceIndex: null,
    });
    if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível duplicar o lançamento" });
    return toTransaction(record);
  }),

  toggleStatus: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const existing = await db.getTransactionById(ctx.user.id, input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });

    // Uma perna paga e a outra pendente descasaria o saldo das duas contas.
    if (existing.transferGroupId) {
      const group = await db.getTransferGroup(ctx.user.id, existing.transferGroupId);
      const status = existing.status === "Pago" ? "Pendente" : "Pago";
      await db.updateTransactions(ctx.user.id, group.map(record => record.id), { status });
      const refreshed = await db.getTransactionById(ctx.user.id, input.id);
      if (!refreshed) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
      return toTransaction(refreshed);
    }

    const record = await db.updateTransaction(ctx.user.id, input.id, {
      type: existing.type,
      transactionDate: existing.transactionDate,
      description: existing.description,
      contact: existing.contact,
      category: existing.category,
      amount: existing.amount,
      account: existing.account,
      accountId: existing.accountId,
      categoryId: existing.categoryId,
      status: existing.status === "Pago" ? "Pendente" : "Pago",
      recurring: existing.recurring,
    });
    if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
    return toTransaction(record);
  }),

  updateMany: protectedProcedure.input(z.object({
    ids: z.array(z.number().int().positive()).min(1).max(MAX_BULK_UPDATE_IDS, "Selecione no máximo 20.000 lançamentos por vez"),
    changes: bulkUpdateChangesSchema,
  })).mutation(async ({ ctx, input }) => {
    const ids = Array.from(new Set(input.ids));
    const records = await db.getTransactionsByIds(ctx.user.id, ids);
    if (records.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum lançamento selecionado foi encontrado" });

    const transferCount = records.filter(record => record.transferGroupId).length;
    if (transferCount > 0 && (input.changes.accountId !== undefined || input.changes.categoryId !== undefined)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `A seleção inclui ${transferCount} ${transferCount === 1 ? "linha" : "linhas"} de transferência, que não aceitam troca de conta ou categoria em lote. Edite a transferência individualmente.`,
      });
    }

    const values: Parameters<typeof db.updateTransactions>[2] = {};
    if (input.changes.status !== undefined) values.status = input.changes.status;
    if (input.changes.transactionDate !== undefined) values.transactionDate = input.changes.transactionDate;
    if (input.changes.recurring !== undefined) values.recurring = input.changes.recurring;

    if (input.changes.accountId !== undefined) {
      const account = await db.getFinancialAccount(ctx.user.id, input.changes.accountId);
      if (!account?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Conta não encontrada ou inativa" });
      values.accountId = account.id;
      values.account = account.name;
    }

    if (input.changes.categoryId !== undefined) {
      const category = await db.getTransactionCategory(ctx.user.id, input.changes.categoryId);
      if (!category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Categoria não encontrada ou inativa" });
      if (records.some(record => category.type !== "ambos" && category.type !== record.type)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A categoria não é compatível com todos os lançamentos selecionados" });
      }
      values.categoryId = category.id;
      values.category = category.name;
    }

    const updatedCount = await db.updateTransactions(ctx.user.id, ids, values);
    return { success: true, requestedCount: ids.length, matchedCount: records.length, updatedCount } as const;
  }),

  uploadAttachment: protectedProcedure
    .input(z.object({
      fileName: z.string().trim().min(1).max(180),
      contentType: z.enum(ATTACHMENT_CONTENT_TYPES),
      dataBase64: z.string().min(1),
      folder: z.enum(ATTACHMENT_FOLDERS).default("lancamentos"),
    }))
    .mutation(async ({ ctx, input }) => {
      const data = Buffer.from(input.dataBase64, "base64");
      if (data.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo vazio" });
      if (data.length > MAX_ATTACHMENT_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O anexo deve ter no máximo 8 MB" });
      }
      const safeName = input.fileName.replace(/[^\w.\-]+/g, "_").slice(-120);
      try {
        const stored = await storagePut(
          `${attachmentPrefix(ctx.user.id, input.folder)}${Date.now()}_${safeName}`,
          data,
          input.contentType
        );
        return { key: stored.key, name: input.fileName.slice(0, 180) };
      } catch (error) {
        console.error("[Attachment] Upload failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível enviar o anexo. Verifique a configuração de storage.",
        });
      }
    }),

  attachmentUrl: protectedProcedure
    .input(z.object({ key: z.string().trim().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      if (!ownsAttachment(ctx.user.id, input.key)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Anexo não pertence a esta conta" });
      }
      try {
        return { url: await storageGetSignedUrl(input.key) };
      } catch (error) {
        console.error("[Attachment] Signed URL failed", {
          message: error instanceof Error ? error.message : "unknown",
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível abrir o anexo. Verifique a configuração de storage.",
        });
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), scope: seriesScopeSchema }))
    .mutation(async ({ ctx, input }) => {
      const existing = await db.getTransactionById(ctx.user.id, input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });

      if (input.scope === "following" && existing.recurrenceGroupId) {
        const group = await db.getRecurrenceGroup(ctx.user.id, existing.recurrenceGroupId);
        const ids = selectSeriesTargets(group, existing).map(record => record.id);
        const deletedCount = await db.deleteTransactions(ctx.user.id, ids);
        return { success: true, deletedCount } as const;
      }

      // Apagar só uma perna deixaria o saldo de uma das contas errado para sempre.
      if (existing.transferGroupId) {
        const deletedCount = await db.deleteTransferGroup(ctx.user.id, existing.transferGroupId);
        return { success: true, deletedCount } as const;
      }
      await db.deleteTransaction(ctx.user.id, input.id);
      return { success: true, deletedCount: 1 } as const;
    }),

  deleteMany: protectedProcedure.input(z.object({
    ids: z.array(z.number().int().positive()).min(1).max(MAX_BULK_DELETE_IDS, "Selecione no máximo 20.000 lançamentos por vez"),
  })).mutation(async ({ ctx, input }) => {
    const ids = Array.from(new Set(input.ids));
    const deletedCount = await db.deleteTransactions(ctx.user.id, ids);
    return { success: true, requestedCount: ids.length, deletedCount } as const;
  }),
});

export { bulkUpdateChangesSchema, buildTransferLegs, isCashFlow, MAX_BULK_DELETE_IDS, MAX_BULK_UPDATE_IDS, periodBounds, signedAmount, summarize, toTransaction, transactionValuesBaseSchema, transactionValuesSchema, transactionUpdateSchema };
