import { trpc } from "@/lib/trpc";
import { CONFIGURACAO_PADRAO } from "@shared/sistema";

/*
 * O que o admin decidiu para o sistema inteiro, do lado do navegador.
 *
 * Isto morava em `admin/preferencias.ts`, sobre `localStorage`, e é por isso
 * que o interruptor não funcionava: `localStorage` é de UM navegador. O admin
 * desligava, o menu dele sumia, e o cliente — noutro computador, noutra conta
 * — continuava vendo Planos e Assinatura. Não havia como funcionar; nenhum
 * navegador consegue ler o `localStorage` de outro.
 *
 * Agora a fonte é o servidor. São dois ganchos e não um porque a resposta
 * certa enquanto a consulta não voltou DEPENDE de quem pergunta — e essa
 * diferença, escrita errada, é exatamente o bug de volta.
 */

/**
 * `staleTime` alto de propósito: a configuração muda quando um admin mexe no
 * interruptor, o que é raro, e quem mexe recebe a invalidação na hora. Não vale
 * pagar uma ida ao servidor por montagem de tela para vigiar algo que passa
 * meses igual.
 */
function useConfiguracaoDoSistema() {
  return trpc.configuracaoDoSistema.useQuery(undefined, { staleTime: 5 * 60_000 });
}

/**
 * Para as telas do ADMIN: na dúvida, mostra.
 *
 * Enquanto a consulta não volta — ou se ela falhar — a área de Assinaturas
 * continua no menu. Esconder por causa de uma falha de rede seria o pior
 * resultado: o admin procuraria um menu que ele nunca desligou. Ele é o dono
 * do interruptor; ver demais não lhe custa nada.
 */
export function useMostrarAssinaturas() {
  const { data } = useConfiguracaoDoSistema();
  return data?.mostrarAssinaturas ?? CONFIGURACAO_PADRAO.mostrarAssinaturas;
}

/**
 * Para as telas do CLIENTE: na dúvida, esconde.
 *
 * O contrário do de cima, e a assimetria é o ponto. Aqui só libera com
 * resposta do servidor na mão: um padrão "mostra enquanto carrega" faria a aba
 * Planos piscar na tela de quem não devia vê-la, e meio segundo de vazamento
 * ainda é vazamento — é exatamente o que o admin pediu para esconder.
 *
 * O custo é o inverso: no caso comum, com o interruptor ligado, as duas abas
 * entram um instante depois do resto. Fica barato porque a consulta é uma só
 * para a página inteira e o `staleTime` a mantém quente entre as telas.
 */
export function useAssinaturasLiberadas() {
  const { data } = useConfiguracaoDoSistema();
  return data?.mostrarAssinaturas === true;
}
