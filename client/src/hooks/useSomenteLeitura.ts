import { useAuth } from "@/_core/hooks/useAuth";

/*
 * O que a tela pode oferecer — Fase D do acesso do contador.
 *
 * `true` quando quem está logado abriu uma empresa como CONTADOR: vê tudo,
 * não muda nada. As telas escondem botão de escrita com isto. É cortesia, não
 * segurança: a recusa de verdade é a `escritaProcedure` no servidor, e uma
 * chamada pelo console do navegador recebe o mesmo FORBIDDEN. O que este
 * hook evita é a pessoa clicar num botão que só existe para falhar.
 *
 * Enquanto a sessão carrega, `false`: a tela não pisca botões que vão sumir,
 * porque nenhuma tela protegida desenha antes de `useAuth` resolver.
 */
export function useSomenteLeitura() {
  const { somenteLeitura } = useAuth();
  return somenteLeitura;
}
