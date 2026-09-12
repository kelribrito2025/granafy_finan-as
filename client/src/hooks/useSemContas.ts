import { trpc } from "@/lib/trpc";

/*
 * O panorama da conta, sem pagar consulta por isso.
 *
 * Cada tela só sabia que estava vazia depois que a PRÓPRIA consulta voltava, e
 * até lá mostrava o esqueleto — que então era trocado pelo estado vazio, num
 * pisca que parecia erro. Mas a barra lateral busca os saldos em toda página, e
 * o resultado fica no cache do react-query: ao navegar dentro do produto a
 * resposta já está aqui, e a tela abre direto no destino certo.
 *
 * Por isso a consulta dos saldos também traz `temLancamentos`. Sem ele, "tem
 * conta mas nunca lançou" exigia uma segunda ida ao servidor, disparada só
 * depois que a primeira voltava — e era esse o segundo esqueleto.
 *
 * `pronto` é o que separa "ainda não sei" de "sei que está vazio". Enquanto for
 * falso, nenhuma decisão de vazio pode ser tomada: a tela fica no esqueleto.
 */
export function usePanoramaDaConta() {
  const consulta = trpc.organization.accountBalances.useQuery();
  return {
    pronto: consulta.isSuccess,
    contas: consulta.data?.contas ?? [],
    /** Nenhuma conta bancária: nada pode existir, porque lançamento nasce dentro de uma. */
    semContas: consulta.isSuccess && consulta.data.contas.length === 0,
    /** Tem conta, mas a empresa nunca registrou nem importou um lançamento. */
    semLancamentos: consulta.isSuccess && !consulta.data.temLancamentos,
  };
}

/** Só a primeira pergunta, para quem não precisa do resto. */
export function useSemContas() {
  return usePanoramaDaConta().semContas;
}
