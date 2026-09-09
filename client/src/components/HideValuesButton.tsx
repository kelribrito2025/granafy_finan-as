import { Hint } from "@/components/Hint";
import { usePrivacy } from "@/contexts/PrivacyContext";

/** O olhinho do topo: esconde e mostra os valores da tela. */
export function HideValuesButton({ className = "" }: { className?: string }) {
  const { hidden, toggle } = usePrivacy();
  const label = hidden ? "Mostrar valores" : "Ocultar valores";

  return (
    <Hint label={label} className={className}>
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={hidden}
      className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {hidden ? (
          <>
            <path d="M9.9 4.24A9.1 9.1 0 0112 4c7 0 10 8 10 8a18.5 18.5 0 01-2.16 3.19" />
            <path d="M6.61 6.61A18.2 18.2 0 002 12s3 8 10 8a9.7 9.7 0 005.39-1.61" />
            <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
            <path d="M2 2l20 20" />
          </>
        ) : (
          <>
            <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
    </Hint>
  );
}
