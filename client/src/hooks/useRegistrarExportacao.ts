import { trpc } from "@/lib/trpc";
import { useCallback } from "react";

/*
 * A tela declara ao servidor que exportou — Fase E.
 *
 * O CSV é montado aqui, no navegador; o servidor não participa. Então o que
 * ele registra é a declaração da tela, e a tela do dono diz isso com todas
 * as letras. Nunca atrasa nem impede o download: dispara e esquece.
 */
export function useRegistrarExportacao() {
  const registrar = trpc.acessos.registrarExportacao.useMutation();
  return useCallback((relatorio: string) => {
    registrar.mutate({ relatorio }, { onError: () => undefined });
  }, [registrar]);
}
