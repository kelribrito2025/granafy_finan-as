import type { IconlyIcon } from "@/components/IconlyIcons";

/**
 * O selo à esquerda do título de um modal.
 *
 * Existe num arquivo só porque são treze modais: o quadrado verde, o tamanho
 * do ícone e o raio precisam ser os mesmos em todos, e copiados um a um eles
 * já tinham começado a divergir.
 *
 * O tom `perigo` é do modal que apaga. O selo verde ali dizia "tudo certo"
 * ao lado de um texto perguntando se pode excluir — e a cor é a primeira
 * coisa que se lê, antes do título.
 */
export function ModalIcon({ icon: Icon, tom = "normal" }: { icon: IconlyIcon; tom?: "normal" | "perigo" }) {
  const cor = tom === "perigo" ? "bg-[#FDECEA] text-[#B3261E]" : "bg-[#DFF6EA] text-[#0A7A42]";
  return (
    <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl ${cor}`}>
      <Icon size={19} />
    </span>
  );
}
