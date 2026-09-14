import type { TransactionType } from "@/lib/transactionTypes";
import { z } from "zod";

const STORAGE_PREFIX = "granafy:new-transaction-draft:v1";
const DRAFT_VERSION = 1 as const;
export const TRANSACTION_DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const transactionDraftSchema = z.object({
  version: z.literal(DRAFT_VERSION),
  updatedAt: z.number().int().nonnegative(),
  type: z.enum(["entrada", "saida", "transferencia"]),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(180),
  contact: z.string().max(120),
  category: z.string(),
  categoryId: z.number().int().positive().nullable(),
  amount: z.string().max(32).refine(
    value => value === "" || value === "-" || /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(value),
  ),
  account: z.string(),
  accountId: z.number().int().positive().nullable(),
  destinationAccountId: z.number().int().positive().nullable(),
  costCenter: z.string(),
  costCenterId: z.number().int().positive().nullable(),
  status: z.enum(["Pago", "Pendente"]),
  settledAt: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  recurring: z.boolean(),
  recurringMonths: z.number().int().min(1).max(120),
  recurrenceStart: z.enum(["este_mes", "proximo_mes"]),
  attachmentKey: z.string().nullable(),
  attachmentName: z.string().nullable(),
});

export type TransactionDraft = z.infer<typeof transactionDraftSchema>;
export type TransactionDraftValues = Omit<TransactionDraft, "version" | "updatedAt">;

/** Um rascunho nunca pode aparecer em outro login ou em outra empresa. */
export function transactionDraftKey(userId: number | null | undefined, companyId: number | null | undefined) {
  if (!Number.isSafeInteger(userId) || Number(userId) <= 0) return null;
  if (!Number.isSafeInteger(companyId) || Number(companyId) <= 0) return null;
  return `${STORAGE_PREFIX}:${userId}:${companyId}`;
}

/** Conteúdo inválido, futuro ou vencido é ignorado em vez de quebrar o modal. */
export function parseTransactionDraft(raw: string | null, now = Date.now()): TransactionDraft | null {
  if (!raw) return null;
  try {
    const parsed = transactionDraftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (parsed.data.updatedAt > now + 60_000) return null;
    if (now - parsed.data.updatedAt > TRANSACTION_DRAFT_MAX_AGE_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function readTransactionDraft(key: string) {
  if (typeof window === "undefined") return null;
  try {
    return parseTransactionDraft(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writeTransactionDraft(key: string, values: TransactionDraftValues) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...values, version: DRAFT_VERSION, updatedAt: Date.now() }));
  } catch {
    // Navegação privada ou política corporativa pode bloquear localStorage.
  }
}

export function removeTransactionDraft(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // A limpeza do rascunho nunca deve bloquear o formulário.
  }
}

/** Data e natureza vêm preenchidas ao abrir e, sozinhas, não constituem rascunho. */
export function hasMeaningfulTransactionDraft(
  values: TransactionDraftValues,
  defaults: { type: TransactionType; transactionDate: string },
) {
  const amountInCents = Number(values.amount.replace(/\D/g, ""));
  return values.type !== defaults.type
    || values.transactionDate !== defaults.transactionDate
    || (Number.isFinite(amountInCents) && amountInCents > 0)
    || values.description.trim() !== ""
    || values.contact.trim() !== ""
    || values.categoryId !== null
    || values.accountId !== null
    || values.destinationAccountId !== null
    || values.costCenterId !== null
    || values.status !== "Pendente"
    || values.recurring
    || (values.recurring && values.recurringMonths !== 12)
    || (values.recurring && values.recurrenceStart !== "este_mes")
    || values.attachmentKey !== null
    || (values.attachmentKey !== null && values.attachmentName !== null);
}

export function transactionDraftDefaults(type: TransactionType, transactionDate: string): TransactionDraftValues {
  return {
    type,
    transactionDate,
    description: "",
    contact: "",
    category: "",
    categoryId: null,
    amount: "0,00",
    account: "",
    accountId: null,
    destinationAccountId: null,
    costCenter: "",
    costCenterId: null,
    status: "Pendente",
    settledAt: "",
    recurring: false,
    recurringMonths: 12,
    recurrenceStart: "este_mes",
    attachmentKey: null,
    attachmentName: null,
  };
}

export function transactionDraftValues(draft: TransactionDraft): TransactionDraftValues {
  const { version: _version, updatedAt: _updatedAt, ...values } = draft;
  return values;
}
