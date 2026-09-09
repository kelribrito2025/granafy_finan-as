export const DEFAULT_CATEGORY_CATALOG_VERSION = 3;

export type DefaultTransactionCategory = {
  name: string;
  type: "entrada" | "saida" | "ambos";
  color: string;
};

function expenseGroup(color: string, names: string[]): DefaultTransactionCategory[] {
  return names.map(name => ({ name, type: "saida", color }));
}

function incomeGroup(color: string, names: string[]): DefaultTransactionCategory[] {
  return names.map(name => ({ name, type: "entrada", color }));
}

/** Serve nos dois sentidos: receber o empréstimo e devolver o principal. */
function bothWaysGroup(color: string, names: string[]): DefaultTransactionCategory[] {
  return names.map(name => ({ name, type: "ambos", color }));
}

/*
 * Nem tudo que entra na conta é receita.
 *
 * Aporte de sócio vai para o patrimônio e empréstimo vai para o passivo. As
 * duas raízes existem para que a DRE consiga separá-las do faturamento — sem
 * elas, o dinheiro entrava como venda e inflava lucro e margem.
 */
export const DEFAULT_CAPITAL_CATEGORIES: readonly DefaultTransactionCategory[] = [
  ...incomeGroup("#0891B2", [
    "Aportes de Capital",
    "Aportes de Capital/Aporte de Sócio",
    "Aportes de Capital/Integralização de Capital Social",
  ]),
  ...bothWaysGroup("#635BFF", [
    "Empréstimos e Financiamentos",
    "Empréstimos e Financiamentos/Empréstimo Recebido",
    "Empréstimos e Financiamentos/Amortização de Principal",
  ]),
];

export const DEFAULT_INCOME_CATEGORIES: readonly DefaultTransactionCategory[] = incomeGroup("#12B85C", [
  "Receitas Operacionais",
  "Receitas Operacionais/Prestação de Serviços",
  "Receitas Operacionais/Venda de Produtos",
  "Receitas Financeiras",
  "Outras Receitas",
]);

export const DEFAULT_TRANSACTION_CATEGORIES: readonly DefaultTransactionCategory[] = [
  ...DEFAULT_INCOME_CATEGORIES,
  ...DEFAULT_CAPITAL_CATEGORIES,
  ...expenseGroup("#E06C47", [
    "Custos Operacionais",
    "Custos Operacionais/Custo do Serviço Prestado (CSP)",
    "Custos Operacionais/Matéria-Prima e Insumos",
    "Custos Operacionais/Mercadorias Compradas (CMV)",
  ]),
  ...expenseGroup("#8A968D", [
    "Depreciação e Amortização",
  ]),
  ...expenseGroup("#F59E0B", [
    "Descontos e Abatimentos",
    "Descontos e Abatimentos/Abatimentos",
    "Descontos e Abatimentos/Descontos comerciais",
  ]),
  ...expenseGroup("#6B7280", [
    "Despesas com de ativos imobilizados",
    "Despesas com de ativos imobilizados/Compra de Equipamentos",
    "Despesas com de ativos imobilizados/Compra de Móveis",
  ]),
  ...expenseGroup("#635BFF", [
    "Despesas de Investimentos",
    "Despesas de Investimentos/Custódia",
    "Despesas de Investimentos/Custos Operacionais",
    "Despesas de Investimentos/IOF",
    "Despesas de Investimentos/IR",
    "Despesas de Investimentos/Perdas",
  ]),
  ...expenseGroup("#B3261E", [
    "Despesas Financeiras",
    "Despesas Financeiras/Juros de Empréstimos e Financiamentos",
    "Despesas Financeiras/Tarifas Bancárias e de Cartão",
  ]),
  ...expenseGroup("#0E9F6E", [
    "Despesas Fixas",
    "Despesas Fixas/Aluguel e Condomínio",
    "Despesas Fixas/Benefícios (VR, VT, Saúde)",
    "Despesas Fixas/Contas de Consumo",
    "Despesas Fixas/Encargos Sociais",
    "Despesas Fixas/Honorários",
    "Despesas Fixas/Material de Escritório e Limpeza",
    "Despesas Fixas/Salários e Pró-labore",
  ]),
  ...expenseGroup("#7C3AED", [
    "Despesas não Operacionais",
    "Despesas não Operacionais/Perda na Venda de Ativo",
  ]),
  ...expenseGroup("#F97316", [
    "Despesas Variáveis",
    "Despesas Variáveis/Comissões de Vendas",
    "Despesas Variáveis/Fretes sobre Vendas",
    "Despesas Variáveis/Marketing e Publicidade",
  ]),
  ...expenseGroup("#D946EF", [
    "Distribuição de Lucros",
    "Distribuição de Lucros/Dividendos e Lucros Distribuídos",
  ]),
  ...expenseGroup("#2563EB", [
    "Impostos sobre Lucro",
    "Impostos sobre Lucro/CSLL",
    "Impostos sobre Lucro/IRPJ",
  ]),
  ...expenseGroup("#0891B2", [
    "Impostos sobre Vendas",
    "Impostos sobre Vendas/COFINS",
    "Impostos sobre Vendas/ICMS",
    "Impostos sobre Vendas/ISS",
    "Impostos sobre Vendas/PIS",
    "Impostos sobre Vendas/Simples Nacional (DAS)",
  ]),
];

export function defaultCategoryValues(userId: number, companyId: number) {
  return DEFAULT_TRANSACTION_CATEGORIES.map(category => ({
    userId,
    companyId,
    ...category,
    isActive: true,
  }));
}

export function defaultCategoryUpgradeValues(userId: number, companyId: number, currentVersion: number) {
  const categories = currentVersion < 1
    ? DEFAULT_TRANSACTION_CATEGORIES
    : currentVersion < 2
      ? [...DEFAULT_INCOME_CATEGORIES, ...DEFAULT_CAPITAL_CATEGORIES]
      : currentVersion < 3
        ? DEFAULT_CAPITAL_CATEGORIES
        : [];
  return categories.map(category => ({ userId, companyId, ...category, isActive: true }));
}
