/*
 * As regras da lista de empresas.
 *
 * Primeira peça do modelo multiempresa, e de propósito a parte que não toca no
 * banco: nomear, abreviar e ordenar são decisões de apresentação, e é onde
 * moram os casos chatos — o login sem razão social, a empresa arquivada, o
 * empate de ordem. Aqui elas ficam testáveis sem subir nada.
 *
 * O que NÃO mora aqui: qual empresa está ativa. Essa decisão é de segurança,
 * não de apresentação, e vem na fase em que o contexto passa a resolvê-la.
 */

export type CompanyLike = {
  id: number;
  legalName: string;
  tradeName: string;
  isActive: boolean;
  sortOrder: number;
};

/**
 * O nome que a empresa mostra.
 *
 * Razão social primeiro, porque é o nome que sai em relatório. Nome fantasia
 * quando não há razão. E, quando não há nenhum dos dois, o nome do usuário —
 * que é o caso de quem usou o sistema antes de existir cadastro de empresa.
 *
 * Esse último caso é o motivo de a regra viver aqui e não no banco: o login
 * sem razão social não ganha uma razão social inventada gravada numa linha, ele
 * ganha um rótulo na tela. Inventar dado para preencher tela é como um "Sem
 * nome" vira, seis meses depois, a razão social de alguém num PDF.
 */
export function companyDisplayName(
  empresa: Pick<CompanyLike, "legalName" | "tradeName">,
  nomeDoUsuario: string,
) {
  const razao = empresa.legalName.trim();
  if (razao) return razao;
  const fantasia = empresa.tradeName.trim();
  if (fantasia) return fantasia;
  const pessoa = nomeDoUsuario.trim();
  return pessoa || "Empresa sem nome";
}

/**
 * As duas letras do quadradinho.
 *
 * Estava dentro do menu do perfil, sem teste. Duas palavras dão a inicial de
 * cada uma; uma palavra dá as duas primeiras letras dela.
 */
export function companyInitials(nome: string) {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return "—";
  if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
  return `${palavras[0][0]}${palavras[1][0]}`.toUpperCase();
}

/**
 * A ordem da lista: ativas primeiro, depois a ordem escolhida, depois o id.
 *
 * As arquivadas descem em vez de sumir — quem arquivou ainda precisa achá-las
 * para reativar, e uma lista que esconde o que existe faz a pessoa duvidar do
 * que apagou.
 *
 * O id como último desempate não é detalhe: sem ele, duas empresas com o mesmo
 * `sortOrder` trocam de lugar entre uma leitura e outra, e a lista pisca sem
 * nada ter mudado.
 */
export function sortCompanies<T extends CompanyLike>(empresas: readonly T[]) {
  return [...empresas].sort((esquerda, direita) => {
    if (esquerda.isActive !== direita.isActive) return esquerda.isActive ? -1 : 1;
    if (esquerda.sortOrder !== direita.sortOrder) return esquerda.sortOrder - direita.sortOrder;
    return esquerda.id - direita.id;
  });
}
