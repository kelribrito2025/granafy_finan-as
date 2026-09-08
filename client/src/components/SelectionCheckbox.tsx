import { CheckIcon } from "@/components/IconlyIcons";

/*
 * A caixinha de seleção da lista de lançamentos.
 *
 * Fica fora da página porque o modal de lançamento também a usa, e o modal
 * abre do painel.
 *
 * Marcada e desmarcada são o mesmo desenho — o tique dentro do círculo —, e o
 * que muda é a cor: verde quando marcada, cinza apagado quando não. Trocar o
 * desenho junto com a cor fazia a caixinha vazia parecer um botão de outra
 * coisa. O estado "misto" da seleção parcial continua sendo o traço, que é o
 * que o `aria-checked="mixed"` anuncia.
 */

/** `onDark` é a barra de seleção, quase preta: lá o verde claro é o legível. */
type Tom = "light" | "onDark";

export function ColumnCheckState({ checked, mixed = false, tone = "light" }: {
  checked: boolean;
  mixed?: boolean;
  tone?: Tom;
}) {
  const aceso = checked || mixed;
  const escuro = tone === "onDark";
  const cor = aceso
    ? escuro
      ? "bg-[#1F3D2B] text-[#7EE2A8]"
      : "bg-[#DFF6EA] text-[#0A7A42]"
    : escuro
      ? "text-[#5C7A68]"
      : "text-[#C2CDC6]";

  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold transition-colors ${cor}`}
    >
      {checked || !mixed ? <CheckIcon size={15} /> : "—"}
    </span>
  );
}

export function SelectionCheckbox({ checked, mixed = false, label, tone = "light", onChange }: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  tone?: Tom;
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
      <ColumnCheckState checked={checked} mixed={mixed} tone={tone} />
    </button>
  );
}
