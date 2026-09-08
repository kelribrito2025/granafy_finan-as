import { useEffect, type RefObject } from "react";

/**
 * Fecha um popover ao clicar fora dele ou apertar Esc.
 *
 * Sem isto o menu só fecha no mesmo botão que o abriu, o que obriga a pessoa a
 * voltar até lá — e deixa dois popovers abertos ao mesmo tempo se ela clicar
 * direto no outro.
 *
 * O ouvinte é de `mousedown`, não de `click`: o `click` só dispara ao soltar o
 * botão, então arrastar de dentro do popover para fora fecharia o menu no meio
 * de uma seleção de texto.
 */
export function useDismissOnOutside(
  open: boolean,
  anchor: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (anchor.current && !anchor.current.contains(event.target as Node)) onDismiss();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, anchor, onDismiss]);
}
