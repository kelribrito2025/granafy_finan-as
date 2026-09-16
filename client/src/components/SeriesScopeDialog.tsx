import { DeleteIcon, DocumentIcon } from "@/components/IconlyIcons";
import { ModalIcon } from "@/components/ModalIcon";
import type { SeriesScope, Transaction } from "@/lib/transactionTypes";

export function SeriesScopeDialog({ action, transaction, pending, onCancel, onConfirm }: {
  action: "save" | "delete";
  transaction: Transaction;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (scope: SeriesScope) => void;
}) {
  const total = transaction.recurringMonths ?? 0;
  const position = transaction.recurrenceIndex ?? 1;
  const verb = action === "delete" ? "Excluir" : "Salvar";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="series-scope-title"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]"
      onMouseDown={event => event.target === event.currentTarget && onCancel()}
    >
      <div className="modal-enter w-full max-w-[420px] rounded-[20px] bg-white p-6 text-[#0B1F14] shadow-[0_20px_50px_rgba(11,31,20,.16)]">
        <div className="flex items-start gap-3">
          <ModalIcon icon={action === "delete" ? DeleteIcon : DocumentIcon} tom={action === "delete" ? "perigo" : "normal"} />
          <div className="min-w-0">
            <h2 id="series-scope-title" className="text-[18px] font-bold tracking-[-.01em]">
              {action === "delete" ? "Excluir lançamento recorrente" : "Salvar lançamento recorrente"}
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A968D]">
              Esta é a parcela {position} de {total}. Escolha o alcance da mudança.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("single")}
            className="rounded-[12px] border border-[#E3EAE5] px-4 py-3 text-left text-[13px] font-semibold hover:bg-[#F8FAF9] disabled:opacity-50"
          >
            {verb} só esta parcela
            <span className="mt-0.5 block text-[11px] font-normal text-[#8A968D]">As outras ficam como estão.</span>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => onConfirm("following")}
            className="rounded-[12px] bg-[#12B85C] px-4 py-3 text-left text-[13px] font-bold text-white hover:bg-[#0F9E4E] disabled:opacity-50"
          >
            {verb} esta e as próximas
            <span className="mt-0.5 block text-[11px] font-normal text-white/85">
              A nova data reorganiza os próximos meses; parcelas anteriores e já pagas não mudam.
            </span>
          </button>
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="mt-3 h-11 w-full rounded-[12px] bg-[#F1F4F2] text-[13px] font-bold text-[#4C6355] hover:bg-[#E7ECE9] disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
