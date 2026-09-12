import { trpc } from "@/lib/trpc";

/*
 * O sinal mais rápido de conta vazia.
 *
 * Cada tela só sabia que estava vazia depois que a PRÓPRIA consulta voltava, e
 * até lá mostrava o esqueleto — que então era trocado pelo estado vazio, num
 * pisca que parecia erro. Mas a lista de contas é buscada pela barra lateral em
 * toda página e fica no cache do react-query: quando ela diz "nenhuma conta",
 * nada pode existir (lançamento nasce dentro de uma conta), e a tela pode abrir
 * direto no vazio, sem esperar consulta nenhuma.
 *
 * Só responde `true` com certeza: enquanto a lista não chegou, é `false`, e a
 * tela segue o caminho normal. Conta que existe mas está vazia continua sendo
 * decidida por cada tela, pelo dado dela.
 */
export function useSemContas() {
  const accountsQuery = trpc.organization.accountBalances.useQuery();
  return accountsQuery.isSuccess && accountsQuery.data.length === 0;
}
