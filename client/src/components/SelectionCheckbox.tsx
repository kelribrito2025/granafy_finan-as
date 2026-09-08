import { CheckIcon } from "@/components/IconlyIcons";

/*
 * A caixinha de seleção da lista de lançamentos.
 *
 * Fica fora da página porque o modal de lançamento também a usa, e o modal
 * agora abre do painel. O estado "misto" existe para a seleção parcial: um
 * traço em vez do tique, que é o que o `aria-checked="mixed"` anuncia.
 */
export function ColumnCheckState({ checked, mixed = false }: { checked: boolean; mixed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold transition-colors ${
        checked || mixed
          ? "bg-[#DFF6EA] text-[#0A7A42]"
          : "bg-[#F1F4F2] text-[#AAB4AD]"
      }`}
    >
      {checked ? <CheckIcon size={13} /> : "—"}
    </span>
  );
}

export function SelectionCheckbox({ checked, mixed = false, label, onChange }: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      onClick={onChange}
      className="inline-flex h-6 w-6 items-center justify-center rounded-lg outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-[#12B85C]/35"
    >
      <ColumnCheckState checked={checked} mixed={mixed} />
    </button>
  );
}
