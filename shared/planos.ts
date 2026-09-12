/*
 * Os planos do GranaFy, em um lugar só.
 *
 * Os preços são decisão tomada (15/27/47) e já valem para o que a tela do
 * admin mostra; a tabela de assinaturas que vai LIGAR isso a uma empresa
 * chega na sentada das assinaturas. Quando ela chegar, é daqui que ela lê —
 * preço repetido em dois lugares vira preço diferente em dois lugares.
 */
export type Plano = {
  chave: "essencial" | "controle" | "grupo";
  nome: string;
  /** Em reais por mês, na cobrança mensal. */
  preco: number;
  descricao: string;
};

export const PLANOS: Plano[] = [
  { chave: "essencial", nome: "Essencial", preco: 15, descricao: "uma empresa, o básico do dia a dia" },
  { chave: "controle", nome: "Controle", preco: 27, descricao: "conciliação, DRE e balanço" },
  { chave: "grupo", nome: "Grupo", preco: 47, descricao: "várias empresas no mesmo login" },
];

/** O plano em que todo cadastro novo entra, e por quantos dias sem cobrança. */
export const PLANO_DO_TESTE = "controle" as const;
export const DIAS_DE_TESTE = 14;

/** Desconto da cobrança anual, em fração. */
export const DESCONTO_ANUAL = 0.17;
