import type { IconlyIcon } from "@/components/IconlyIcons";

/**
 * O selo à esquerda do título de uma página.
 *
 * É o mesmo ícone que a página tem na barra lateral: quem chega por um link
 * direto reconhece onde está sem precisar procurar o item aceso no menu.
 * Some para leitores de tela — o `h1` ao lado já diz o nome.
 */
export function PageIcon({ icon: Icon }: { icon: IconlyIcon }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#DFF6EA] text-[#0A7A42]"
    >
      <Icon size={21} />
    </span>
  );
}
