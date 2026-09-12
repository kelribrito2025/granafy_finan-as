import {
  ArrowDownIcon,
  ArrowUpIcon,
  CloseIcon,
  DeleteIcon,
  DocumentIcon,
  UploadIcon,
} from "@/components/IconlyIcons";
import { ModalIcon } from "@/components/ModalIcon";
import { SelectionCheckbox } from "@/components/SelectionCheckbox";
import { formatDate } from "@/lib/appFormat";
import { currencyInputToNumber, formatCurrencyInput, formatCurrencyValue } from "@/lib/currency";
import { trpc } from "@/lib/trpc";
import type {
  OrganizationOptions,
  Transaction,
  TransactionInput,
  TransactionType,
} from "@/lib/transactionTypes";
import { FormEvent, useState } from "react";
import { toast } from "@/lib/toast";

/*
 * O modal de lançamento.
 *
 * Saiu da página de lançamentos porque o painel também precisa dele: quem
 * clica em "Novo lançamento" na visão geral quer lançar, não trocar de tela.
 * O modal não sabe onde está — recebe as opções da organização e devolve o
 * lançamento pronto em `onSave`; salvar (e o que fazer com séries) continua
 * sendo problema de quem o abriu.
 */

const TYPE_OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: "entrada", label: "Entrada" },
  { value: "saida", label: "Saída" },
  { value: "transferencia", label: "Transferência" },
];

/** O rótulo de "pago" muda com o tipo; o valor gravado continua Pago/Pendente. */
const SETTLED_LABEL: Record<TransactionType, string> = {
  entrada: "Recebido",
  saida: "Pago",
  transferencia: "Concluída",
};

const AMOUNT_COLOR: Record<TransactionType, string> = {
  entrada: "text-[#0A7A42]",
  saida: "text-[#B3261E]",
  transferencia: "text-[#0B1F14]",
};

/**
 * Mesma regra de âncora do servidor (server/recurrence.ts): o dia vem sempre da
 * data original e encolhe só quando o mês de destino é mais curto. Aqui serve
 * apenas para mostrar as datas ao usuário antes de salvar.
 */
function addMonthAnchored(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const targetYear = month === 12 ? year + 1 : year;
  const targetMonth = month === 12 ? 1 : month + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

const ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const ATTACHMENT_CONTENT_TYPES: Record<string, "application/pdf" | "image/png" | "image/jpeg" | "image/webp"> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Base64 puro, sem o prefixo "data:...;base64," que o FileReader devolve. */
function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.onload = () => {
      const result = String(reader.result);
      const separator = result.indexOf(",");
      if (separator === -1) reject(new Error("Arquivo inválido"));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

const fieldClass = "h-[46px] w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[14px] outline-none focus:border-[#12B85C]";
const fieldLabelClass = "mb-[7px] block text-[12.5px] font-semibold text-[#4C6355]";

export function TransactionModal({ transaction, defaultType, defaultDate, pending, options, onManageOrganization, onClose, onSave }: { transaction?: Transaction | null; /** Natureza já escolhida por quem abriu — "nova despesa" não deveria abrir em entrada. */ defaultType?: TransactionType; defaultDate: string; pending: boolean; options: OrganizationOptions; onManageOrganization: () => void; onClose: () => void; onSave: (transaction: TransactionInput) => Promise<void> }) {
  const [type, setType] = useState<TransactionType>(transaction?.type ?? defaultType ?? "entrada");
  const [transactionDate, setTransactionDate] = useState(transaction?.transactionDate ?? defaultDate);
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [contact, setContact] = useState(transaction?.contact ?? "");
  const [category, setCategory] = useState(transaction?.category ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(transaction?.categoryId ?? null);
  const [amount, setAmount] = useState(transaction ? formatCurrencyValue(Math.abs(transaction.amount)) : "0,00");
  const [account, setAccount] = useState(transaction?.account ?? "");
  const [accountId, setAccountId] = useState<number | null>(transaction?.accountId ?? null);
  const [destinationAccountId, setDestinationAccountId] = useState<number | null>(null);
  const [costCenter, setCostCenter] = useState(transaction?.costCenter ?? "");
  const [costCenterId, setCostCenterId] = useState<number | null>(transaction?.costCenterId ?? null);
  const [status, setStatus] = useState<Transaction["status"]>(transaction?.status ?? "Pendente");
  /*
   * A data em que o dinheiro se moveu.
   *
   * Fica em branco por padrão: marcar como pago e salvar assume hoje, que é o
   * caminho de um clique. Quem quita com atraso informa a data aqui, e é isso
   * que dá sentido ao prazo médio da tela de pagas e recebidas.
   */
  const [settledAt, setSettledAt] = useState(transaction?.settledAt ?? "");
  const [recurring, setRecurring] = useState(transaction?.recurring ?? false);
  const [recurringMonths, setRecurringMonths] = useState(transaction?.recurringMonths ?? 12);
  const [recurrenceStart, setRecurrenceStart] = useState<"este_mes" | "proximo_mes">("este_mes");
  const [attachmentKey, setAttachmentKey] = useState(transaction?.attachmentKey ?? null);
  const [attachmentName, setAttachmentName] = useState(transaction?.attachmentName ?? null);
  const uploadAttachment = trpc.transactions.uploadAttachment.useMutation();

  const isTransfer = type === "transferencia";
  const editingTransfer = Boolean(transaction?.transferGroupId);
  // Uma série já criada tem datas próprias; recriá-la exigiria apagar e lançar de novo.
  const editingSeries = Boolean(transaction?.recurrenceGroupId);
  const firstInstallmentDate = recurrenceStart === "proximo_mes" ? addMonthAnchored(transactionDate) : transactionDate;
  const lastInstallmentDate = Array.from({ length: Math.max(0, recurringMonths - 1) })
    .reduce<string>(date => addMonthAnchored(date), firstInstallmentDate);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })
    .format(new Date(`${transactionDate}T00:00:00Z`));

  const changeType = (next: TransactionType) => {
    if (editingTransfer && next !== "transferencia") {
      toast.info("Uma transferência não vira entrada ou saída. Exclua e lance de novo.");
      return;
    }
    setType(next);
    if (next === "transferencia") {
      setCategory("");
      setCategoryId(null);
    } else {
      setDestinationAccountId(null);
    }
  };

  const pickAttachment = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("O anexo deve ter no máximo 8 MB");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const contentType = ATTACHMENT_CONTENT_TYPES[extension];
    if (!contentType) {
      toast.error("Anexe um PDF ou uma imagem PNG, JPG ou WEBP");
      return;
    }
    try {
      const stored = await uploadAttachment.mutateAsync({
        fileName: file.name,
        contentType,
        dataBase64: await fileToBase64(file),
      });
      setAttachmentKey(stored.key);
      setAttachmentName(stored.name);
      toast.success("Anexo enviado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o anexo");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = currencyInputToNumber(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return toast.error("Informe um valor válido");
    if (!accountId) return toast.error(isTransfer ? "Selecione a conta de origem" : "Selecione uma conta");
    if (isTransfer) {
      if (!destinationAccountId) return toast.error("Selecione a conta de destino");
      if (destinationAccountId === accountId) return toast.error("A conta de destino precisa ser diferente da origem");
    } else if (!categoryId) {
      return toast.error("Selecione uma categoria");
    }

    await onSave({
      type,
      transactionDate,
      description,
      contact,
      category: isTransfer ? "" : category,
      categoryId: isTransfer ? null : categoryId,
      amount: parsed,
      account,
      accountId,
      destinationAccountId: isTransfer ? destinationAccountId : null,
      costCenter,
      costCenterId,
      status,
      settledAt: status === "Pago" ? settledAt || null : null,
      recurring,
      recurringMonths: recurring ? recurringMonths : null,
      recurrenceStart,
      attachmentKey,
      attachmentName,
    });
  };

  const selectAccount = (value: string, apply: (id: number | null, name: string) => void) => {
    const id = Number(value) || null;
    apply(id, options.accounts.find(item => item.id === id)?.name ?? "");
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="launch-title" className="drawer-backdrop-enter fixed inset-0 z-[80] flex justify-end bg-[#07150d]/45 p-3 backdrop-blur-[3px] sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="drawer-enter flex h-full w-full max-w-[452px] flex-col overflow-hidden rounded-[20px] bg-white text-[#0B1F14] shadow-[0_24px_60px_rgba(11,31,20,.22)]">
        <div className="flex shrink-0 items-center gap-3 border-b border-[#EDF1EE] px-6 py-5">
          <ModalIcon icon={DocumentIcon} />
          <div className="min-w-0">
            <h2 id="launch-title" className="text-[18px] font-bold tracking-[-.01em]">
              {transaction ? "Editar lançamento" : "Novo lançamento"}
            </h2>
            <p className="text-[12.5px] text-[#8A968D]">Entra no extrato de {monthLabel}</p>
          </div>
          <button type="button" aria-label="Fechar modal" onClick={onClose} className="ml-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F2] text-[#28382E] hover:bg-[#E7ECE9]">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="flex gap-2">
          {TYPE_OPTIONS.map(option => {
            const active = type === option.value;
            const Icon = option.value === "entrada" ? ArrowUpIcon : option.value === "saida" ? ArrowDownIcon : null;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => changeType(option.value)}
                aria-pressed={active}
                className={`flex h-[42px] flex-1 items-center justify-center gap-[7px] rounded-xl text-[13px] transition ${
                  active
                    ? "bg-[#12B85C] font-bold text-white"
                    : "border border-[#E3EAE5] text-[#4C6355] hover:bg-[#F8FAF9]"
                }`}
              >
                {Icon && <Icon size={14} />}
                {option.label}
              </button>
            );
          })}
        </div>

        <label className="block">
          <span className={fieldLabelClass}>Valor</span>
          <div className="flex h-14 items-center gap-[9px] rounded-xl border-[1.5px] border-[#E3EAE5] px-4 focus-within:border-[#12B85C]">
            <span className="text-[14px] font-semibold text-[#8A968D]">R$</span>
            <input
              required
              autoFocus
              inputMode="decimal"
              value={amount}
              onFocus={event => event.currentTarget.select()}
              onChange={event => setAmount(formatCurrencyInput(event.target.value))}
              placeholder="0,00"
              className={`min-w-0 flex-1 bg-transparent text-[26px] font-bold tracking-[-.02em] outline-none ${AMOUNT_COLOR[type]}`}
            />
          </div>
        </label>

        <label className="block">
          <span className={fieldLabelClass}>Descrição</span>
          <input required minLength={2} maxLength={180} value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: Plano API · Loja Oneclick" className={fieldClass} />
        </label>

        <div className="flex gap-3">
          <label className="min-w-0 flex-1">
            <span className={fieldLabelClass}>Data</span>
            <input required type="date" value={transactionDate} onChange={event => setTransactionDate(event.target.value)} className={fieldClass} />
          </label>
          <label className="min-w-0 flex-1">
            <span className={fieldLabelClass}>{isTransfer ? "Conta de origem" : "Conta"}</span>
            <select required value={accountId ?? ""} onChange={event => selectAccount(event.target.value, (id, name) => { setAccountId(id); setAccount(name); })} className={fieldClass}>
              <option value="">Selecione</option>
              {options.accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>

        <div className="flex gap-3">
          <label className="min-w-0 flex-1">
            <span className={fieldLabelClass}>{isTransfer ? "Conta de destino" : "Categoria"}</span>
            {isTransfer ? (
              <select required value={destinationAccountId ?? ""} onChange={event => setDestinationAccountId(Number(event.target.value) || null)} className={fieldClass}>
                <option value="">Selecione</option>
                {options.accounts.filter(item => item.id !== accountId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            ) : (
              <select required value={categoryId ?? ""} onChange={event => { const id = Number(event.target.value) || null; setCategoryId(id); setCategory(options.categories.find(item => item.id === id)?.name ?? ""); }} className={fieldClass}>
                <option value="">Selecione</option>
                {options.categories.filter(item => item.type === "ambos" || item.type === type).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
          </label>
          <label className="min-w-0 flex-1">
            <span className={fieldLabelClass}>Centro de custo</span>
            <select value={costCenterId ?? ""} onChange={event => { const id = Number(event.target.value) || null; setCostCenterId(id); setCostCenter(options.costCenters.find(item => item.id === id)?.name ?? ""); }} className={fieldClass}>
              <option value="">Nenhum</option>
              {options.costCenters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>

        <label className="block">
          <span className={fieldLabelClass}>Contato</span>
          <input maxLength={120} value={contact} onChange={event => setContact(event.target.value)} placeholder="Fornecedor ou cliente" className={fieldClass} />
        </label>

        <div>
          <span className={fieldLabelClass}>Situação</span>
          <div className="flex gap-2">
            {([["Pago", SETTLED_LABEL[type]], ["Pendente", "Em aberto"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
                className={`h-10 flex-1 rounded-xl text-[12.5px] transition ${
                  status === value
                    ? "bg-[#DFF6EA] font-bold text-[#0A7A42]"
                    : "border border-[#E3EAE5] text-[#4C6355] hover:bg-[#F8FAF9]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Só aparece com o título quitado: data de liquidação de algo em
              aberto seria uma contradição na própria tela. */}
          {status === "Pago" && (
            <label className="mt-2.5 block">
              <span className={fieldLabelClass}>Data da liquidação</span>
              <input
                type="date"
                value={settledAt}
                onChange={event => setSettledAt(event.target.value)}
                className={fieldClass}
              />
              <span className="mt-1 block text-[11.5px] text-[#8A968D]">
                Em branco, assume hoje. Preencha quando o pagamento saiu em outro dia.
              </span>
            </label>
          )}
        </div>

        <div className="rounded-[14px] bg-[#F1FBF6] p-3.5">
          <div className="flex items-center gap-[11px]">
            {/* Checkbox nativo não segue o tema escuro; este é o mesmo do painel de colunas. */}
            <SelectionCheckbox checked={recurring} label="Repetir todo mês" onChange={() => setRecurring(value => !value)} />
            <span className="flex-1 text-[12.5px] font-semibold text-[#0A7A42]">Repetir todo mês</span>
            {recurring && (
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0A7A42]">
                por
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={recurringMonths}
                  onChange={event => setRecurringMonths(Math.min(120, Math.max(1, Number(event.target.value) || 1)))}
                  aria-label="Meses de recorrência"
                  className="h-8 w-[62px] rounded-lg border border-[#E3EAE5] bg-white px-2 text-center text-[12.5px] font-bold outline-none focus:border-[#12B85C]"
                />
                meses
              </span>
            )}
          </div>
          {recurring && !transaction && (
            <>
              <div className="mt-3 flex gap-2">
                {([["este_mes", "Começar neste mês"], ["proximo_mes", "Só no mês que vem"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRecurrenceStart(value)}
                    aria-pressed={recurrenceStart === value}
                    className={`h-9 flex-1 rounded-[10px] text-[12px] transition ${
                      recurrenceStart === value
                        ? "bg-white font-bold text-[#0A7A42] ring-1 ring-[#CFE2D7]"
                        : "text-[#4C6355] hover:bg-white/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[#4C6355]">
                {recurringMonths === 1
                  ? `Uma parcela só, em ${formatDate(firstInstallmentDate)}.`
                  : `${recurringMonths} lançamentos, de ${formatDate(firstInstallmentDate)} até ${formatDate(lastInstallmentDate)}. Só o primeiro segue a situação escolhida acima; os demais nascem em aberto.`}
              </p>
            </>
          )}
          {recurring && transaction && (
            <p className="mt-2 text-[11px] leading-relaxed text-[#4C6355]">
              {editingSeries
                ? `Parcela ${transaction.recurrenceIndex ?? 1} de ${transaction.recurringMonths ?? recurringMonths}. Ao salvar, você escolhe se a mudança vale só para esta ou também para as próximas em aberto.`
                : `${recurringMonths} lançamentos serão criados, de ${formatDate(firstInstallmentDate)} até ${formatDate(lastInstallmentDate)}. O mês atual mantém a situação escolhida; os próximos ficam em aberto.`}
            </p>
          )}
        </div>

        {attachmentName ? (
          <div className="flex h-[46px] items-center gap-[9px] rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5">
            <DocumentIcon size={15} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#0A7A42]">{attachmentName}</span>
            <button type="button" aria-label="Remover anexo" onClick={() => { setAttachmentKey(null); setAttachmentName(null); }} className="shrink-0 rounded-lg p-1 text-[#8A968D] hover:bg-[#E7ECE9]">
              <CloseIcon size={14} />
            </button>
          </div>
        ) : (
          <label className={`flex h-[46px] cursor-pointer items-center gap-[9px] rounded-xl border border-dashed border-[#C9D5CD] px-3.5 ${uploadAttachment.isPending ? "opacity-60" : "hover:bg-[#F8FAF9]"}`}>
            <UploadIcon size={15} />
            <span className="text-[13px] font-semibold text-[#0A7A42]">
              {uploadAttachment.isPending ? "Enviando anexo..." : "Anexar comprovante ou nota"}
            </span>
            <input type="file" accept={ATTACHMENT_ACCEPT} disabled={uploadAttachment.isPending} onChange={event => { void pickAttachment(event.target.files?.[0]); event.target.value = ""; }} className="hidden" />
          </label>
        )}

        {(options.accounts.length === 0 || (!isTransfer && options.categories.length === 0)) && (
          <button type="button" onClick={onManageOrganization} className="rounded-xl bg-[#FFF8E8] px-3 py-2.5 text-left text-[11px] font-bold text-[#725517]">
            Cadastre uma conta e uma categoria para continuar
          </button>
        )}
        {isTransfer && options.accounts.length < 2 && (
          <p className="rounded-xl bg-[#FFF8E8] px-3 py-2.5 text-[11px] font-bold text-[#725517]">
            Uma transferência precisa de duas contas cadastradas.
          </p>
        )}

        </div>

        <div className="flex shrink-0 gap-3 border-t border-[#EDF1EE] px-6 py-4">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-xl border border-[#E3EAE5] text-[14px] font-semibold text-[#28382E] hover:bg-[#F8FAF9]">Cancelar</button>
          <button type="submit" disabled={pending || uploadAttachment.isPending} className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-[#12B85C] text-[14px] font-bold text-white hover:bg-[#0F9E4E] disabled:cursor-wait disabled:opacity-60">
            {pending ? "Salvando..." : "Salvar lançamento"}
          </button>
        </div>
      </form>
    </div>
  );
}
