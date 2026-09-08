import type { IconlyIcon } from "@/components/IconlyIcons";

/**
 * O selo à esquerda do título de um modal.
 *
 * Existe num arquivo só porque são treze modais: o quadrado verde, o tamanho
 * do ícone e o raio precisam ser os mesmos em todos, e copiados um a um eles
 * já tinham começado a divergir.
 */
export function ModalIcon({ icon: Icon }: { icon: IconlyIcon }) {
  return (
    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[#DFF6EA] text-[#0A7A42]">
      <Icon size={19} />
    </span>
  );
}
