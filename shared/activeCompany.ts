import { sortCompanies, type CompanyLike } from "./companies";

/*
 * Qual empresa está ativa neste request.
 *
 * É a decisão mais sensível do modelo multiempresa, e por isso mora fora de
 * qualquer conexão: dá para ler as quatro regras abaixo inteiras, sem banco,
 * sem contexto de tRPC, sem tela.
 *
 * A regra que importa é a terceira. Um pedido por empresa que não é do dono
 * NUNCA é atendido — e a resposta não é um erro, é a empresa padrão dele
 * próprio. Errar para o lado do dono é o que faz o pior caso ser "vi a minha
 * empresa errada" em vez de "vi a empresa de outro".
 */

export type EscolhaDeEmpresa = CompanyLike;

export type EmpresaAtiva =
  | {
      status: "ok";
      companyId: number;
      /**
       * `false` quando veio um pedido e ele foi ignorado.
       *
       * Não é detalhe de log: é o que permite a tela apagar uma seleção velha.
       * Sem esse sinal, quem tivesse guardado a empresa de um login anterior
       * ficaria vendo outra empresa sem entender por quê, e sem nada para
       * clicar.
       */
      pedidoAtendido: boolean;
    }
  | { status: "sem-empresa" };

/**
 * A empresa padrão: a primeira da lista ordenada.
 *
 * `sortCompanies` põe as ativas na frente, então a padrão só é uma arquivada
 * quando todas são — caso em que mostrar a arquivada ainda é melhor do que não
 * mostrar nada.
 */
export function defaultCompanyId(empresas: readonly EscolhaDeEmpresa[]) {
  return sortCompanies(empresas)[0]?.id ?? null;
}

export function pickActiveCompany({ empresas, pedida }: {
  empresas: readonly EscolhaDeEmpresa[];
  /** O que o request pediu, se pediu. Nunca confiável — vem do cliente. */
  pedida: number | null;
}): EmpresaAtiva {
  const padrao = defaultCompanyId(empresas);

  /*
   * Sem empresa nenhuma é violação de invariante, não estado normal: desde a
   * Fase 2 todo login tem pelo menos uma, e o cadastro cria a sua. Devolver um
   * status próprio — em vez de null — obriga quem chama a decidir o que fazer,
   * em vez de deixar o nulo escorrer para uma consulta.
   */
  if (padrao === null) return { status: "sem-empresa" };

  if (pedida === null) return { status: "ok", companyId: padrao, pedidoAtendido: true };

  /*
   * AQUI. O pedido é confrontado com a lista do próprio dono, e a lista é a
   * única fonte. Não existe caminho em que `pedida` seja devolvida sem estar
   * nesta lista — nem por atalho, nem por otimização.
   */
  const daPessoa = empresas.some(empresa => empresa.id === pedida);
  if (daPessoa) return { status: "ok", companyId: pedida, pedidoAtendido: true };

  return { status: "ok", companyId: padrao, pedidoAtendido: false };
}
