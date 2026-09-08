/**
 * A DRE derivada dos lançamentos.
 *
 * O plano de contas padrão do GranaFy já é uma DRE: as raízes ("Receitas
 * Operacionais", "Impostos sobre Vendas", "Custos Operacionais"…) correspondem
 * uma a uma às linhas da demonstração. Este módulo lê essa convenção de nomes e
 * monta o relatório — não existe campo de classificação no banco, e criar um
 * exigiria recadastrar as 51 categorias que já estão em uso.
 */

export type DreRegime = "competencia" | "caixa";

export type DreRow = {
  category: string;
  type: "entrada" | "saida" | "transferencia";
  /** Assinado: entrada positiva, saída negativa — como o banco guarda. */
  amount: number;
  status: "Pago" | "Pendente";
};

export type DreBucket =
  | "receita_bruta"
  | "deducoes"
  | "custos"
  | "despesas_operacionais"
  | "depreciacao"
  | "financeiro"
  | "impostos_lucro"
  | "nao_operacional"
  | "fora_do_resultado";

/** Como cada raiz do plano de contas entra na demonstração. */
const BUCKET_BY_ROOT: Record<string, DreBucket> = {
  "receitas operacionais": "receita_bruta",
  "outras receitas": "receita_bruta",
  "impostos sobre vendas": "deducoes",
  "descontos e abatimentos": "deducoes",
  "custos operacionais": "custos",
  "despesas fixas": "despesas_operacionais",
  "despesas variaveis": "despesas_operacionais",
  "depreciacao e amortizacao": "depreciacao",
  "receitas financeiras": "financeiro",
  "despesas financeiras": "financeiro",
  "despesas de investimentos": "financeiro",
  "impostos sobre lucro": "impostos_lucro",
  "despesas nao operacionais": "nao_operacional",
  // Compra de bem vira ativo e distribuição de lucro sai do patrimônio: nenhum
  // dos dois é resultado do período, por mais que ambos movam o caixa.
  "despesas com de ativos imobilizados": "fora_do_resultado",
  "despesas com ativos imobilizados": "fora_do_resultado",
  "distribuicao de lucros": "fora_do_resultado",
};

/** Raiz do plano de contas usada como base de despesa fixa no ponto de equilíbrio. */
export const FIXED_COST_ROOT = "despesas fixas";

export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** "Custos Operacionais/Insumos" → "Custos Operacionais". */
export function rootOf(category: string) {
  const root = category.split("/")[0]?.trim();
  return root || "Sem categoria";
}

/**
 * Onde a categoria entra na DRE.
 *
 * Categoria fora do plano padrão cai pelo tipo do lançamento: entrada vira
 * receita, saída vira despesa operacional. É a leitura conservadora — o
 * contrário seria sumir com o dinheiro do relatório —, e a linha continua
 * aparecendo com o nome que o usuário deu.
 */
export function dreBucketOf(category: string, type: DreRow["type"]): DreBucket {
  const mapped = BUCKET_BY_ROOT[normalizeName(rootOf(category))];
  if (mapped) return mapped;
  return type === "entrada" ? "receita_bruta" : "despesas_operacionais";
}

export type DreLineKind = "grupo" | "item" | "subitem" | "subtotal" | "resultado";

export type DreLine = {
  /** Identidade estável entre períodos, para comparar mês a mês. */
  key: string;
  label: string;
  kind: DreLineKind;
  /** Assinado do jeito que entra no lucro: receita positiva, despesa negativa. */
  value: number;
};

export type DreTotals = {
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custos: number;
  margemContribuicao: number;
  despesasOperacionais: number;
  ebitda: number;
  depreciacao: number;
  financeiro: number;
  impostosLucro: number;
  naoOperacional: number;
  lucroLiquido: number;
  /** Só a raiz "Despesas Fixas", para o ponto de equilíbrio. */
  despesasFixas: number;
  /** Compra de ativo e distribuição de lucro: movem caixa, não o resultado. */
  foraDoResultado: number;
};

export type DreStatement = { lines: DreLine[]; totals: DreTotals };

const GROUP_LABELS: Record<string, string> = {
  receita_bruta: "Receita bruta",
  deducoes: "(−) Deduções e impostos",
  custos: "(−) Custos diretos",
  despesas_operacionais: "(−) Despesas operacionais",
};

function round(value: number) {
  const rounded = Math.round(value * 100) / 100;
  // Sem isto, somar uma lista vazia de saídas devolve -0 e a tela escreve "− R$ 0,00".
  return rounded === 0 ? 0 : rounded;
}

function keepsRow(row: DreRow, regime: DreRegime) {
  if (row.type === "transferencia") return false;
  return regime === "competencia" || row.status === "Pago";
}

type Tree = Map<string, { total: number; leaves: Map<string, number> }>;

function collect(rows: readonly DreRow[], regime: DreRegime) {
  const buckets = new Map<DreBucket, Tree>();
  const totals = new Map<DreBucket, number>();
  let despesasFixas = 0;

  for (const row of rows) {
    if (!keepsRow(row, regime)) continue;
    const category = row.category.trim() || "Sem categoria";
    const bucket = dreBucketOf(category, row.type);
    totals.set(bucket, (totals.get(bucket) ?? 0) + row.amount);

    const root = rootOf(category);
    if (bucket === "despesas_operacionais" && normalizeName(root) === FIXED_COST_ROOT) {
      despesasFixas += row.amount;
    }

    const tree = buckets.get(bucket) ?? new Map();
    buckets.set(bucket, tree);
    const node = tree.get(root) ?? { total: 0, leaves: new Map<string, number>() };
    node.total += row.amount;
    const leaf = category.slice(root.length + 1).trim();
    if (leaf) node.leaves.set(leaf, (node.leaves.get(leaf) ?? 0) + row.amount);
    tree.set(root, node);
  }

  return { buckets, totals, despesasFixas };
}

/**
 * Detalhe das linhas que não têm grupo próprio (depreciação, financeiro): as
 * raízes viram subitens. Com uma raiz só o subitem repetiria o rótulo da linha,
 * então nesse caso não há detalhe nenhum.
 */
function rootSubitems(bucket: DreBucket, tree: Tree | undefined): DreLine[] {
  if (!tree || tree.size < 2) return [];
  return Array.from(tree.entries())
    .sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total))
    .map(([root, node]) => ({
      key: `${bucket}/${root}`,
      label: root,
      kind: "subitem" as const,
      value: round(node.total),
    }));
}

/** As linhas de um grupo: a raiz como item e o que vem depois da "/" como subitem. */
function groupLines(bucket: DreBucket, tree: Tree | undefined): DreLine[] {
  if (!tree) return [];
  const roots = Array.from(tree.entries()).sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total));
  const lines: DreLine[] = [];

  for (const [root, node] of roots) {
    lines.push({ key: `${bucket}/${root}`, label: root, kind: "item", value: round(node.total) });
    const leaves = Array.from(node.leaves.entries()).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    for (const [leaf, value] of leaves) {
      lines.push({ key: `${bucket}/${root}/${leaf}`, label: leaf, kind: "subitem", value: round(value) });
    }
  }

  return lines;
}

/**
 * Monta a demonstração.
 *
 * `assetDepreciation` é a depreciação dos bens do balanço no período, positiva.
 * Ela entra ao lado dos lançamentos da categoria "Depreciação e Amortização":
 * são origens diferentes do mesmo custo e somar as duas às cegas esconderia
 * uma delas.
 */
export function buildDreStatement(
  rows: readonly DreRow[],
  options: { regime: DreRegime; assetDepreciation?: number } = { regime: "competencia" }
): DreStatement {
  const { buckets, totals, despesasFixas } = collect(rows, options.regime);
  const assetDepreciation = round(Math.max(0, options.assetDepreciation ?? 0));
  const at = (bucket: DreBucket) => round(totals.get(bucket) ?? 0);

  const receitaBruta = at("receita_bruta");
  const deducoes = at("deducoes");
  const receitaLiquida = round(receitaBruta + deducoes);
  const custos = at("custos");
  const margemContribuicao = round(receitaLiquida + custos);
  const despesasOperacionais = at("despesas_operacionais");
  const ebitda = round(margemContribuicao + despesasOperacionais);
  const depreciacaoLancada = at("depreciacao");
  const depreciacao = round(depreciacaoLancada - assetDepreciation);
  const financeiro = at("financeiro");
  const impostosLucro = at("impostos_lucro");
  const naoOperacional = at("nao_operacional");
  const lucroLiquido = round(
    ebitda + depreciacao + financeiro + impostosLucro + naoOperacional
  );

  const lines: DreLine[] = [];
  const pushGroup = (bucket: DreBucket, value: number) => {
    lines.push({ key: bucket, label: GROUP_LABELS[bucket], kind: "grupo", value });
    lines.push(...groupLines(bucket, buckets.get(bucket)));
  };

  pushGroup("receita_bruta", receitaBruta);
  pushGroup("deducoes", deducoes);
  lines.push({ key: "receita_liquida", label: "Receita líquida", kind: "subtotal", value: receitaLiquida });
  pushGroup("custos", custos);
  lines.push({ key: "margem_contribuicao", label: "Margem de contribuição", kind: "subtotal", value: margemContribuicao });
  pushGroup("despesas_operacionais", despesasOperacionais);
  lines.push({ key: "ebitda", label: "EBITDA", kind: "subtotal", value: ebitda });

  lines.push({ key: "depreciacao", label: "(−) Depreciação e amortização", kind: "item", value: depreciacao });
  if (assetDepreciation > 0) {
    lines.push({
      key: "depreciacao/bens",
      label: "Depreciação dos bens do balanço",
      kind: "subitem",
      value: -assetDepreciation,
    });
  }
  lines.push(...rootSubitems("depreciacao", buckets.get("depreciacao")));

  lines.push({ key: "financeiro", label: "(+/−) Resultado financeiro", kind: "item", value: financeiro });
  lines.push(...rootSubitems("financeiro", buckets.get("financeiro")));
  lines.push({ key: "impostos_lucro", label: "(−) IRPJ e CSLL", kind: "item", value: impostosLucro });
  if (naoOperacional !== 0) {
    lines.push({ key: "nao_operacional", label: "(+/−) Resultado não operacional", kind: "item", value: naoOperacional });
  }
  lines.push({ key: "lucro_liquido", label: "Lucro líquido", kind: "resultado", value: lucroLiquido });

  return {
    lines,
    totals: {
      receitaBruta,
      deducoes,
      receitaLiquida,
      custos,
      margemContribuicao,
      despesasOperacionais,
      ebitda,
      depreciacao,
      financeiro,
      impostosLucro,
      naoOperacional,
      lucroLiquido,
      despesasFixas: round(despesasFixas),
      foraDoResultado: at("fora_do_resultado"),
    },
  };
}

/** Margem sobre a receita líquida. Sem receita não existe margem — devolve null. */
export function marginOf(profit: number, netRevenue: number) {
  if (netRevenue <= 0) return null;
  return round((profit / netRevenue) * 100);
}

/**
 * Variação da linha contra o período anterior. Null quando não há base.
 *
 * Compara o tamanho da linha, não o sinal: despesa que sobe de 100 para 120
 * cresceu 20%, e é assim que se lê uma análise horizontal. Quando o sinal vira
 * — resultado financeiro que era positivo e ficou negativo — o tamanho mentiria,
 * então aí vale a diferença com sinal.
 */
export function variationOf(current: number, previous: number) {
  if (previous === 0) return null;
  const flipped = current !== 0 && Math.sign(current) !== Math.sign(previous);
  const delta = flipped
    ? current - previous
    : Math.abs(current) - Math.abs(previous);
  return round((delta / Math.abs(previous)) * 100);
}

/**
 * Se a mudança da linha ajudou ou atrapalhou o lucro.
 *
 * O valor já vem assinado do jeito que entra no resultado, então basta olhar a
 * direção: receita que sobe e despesa que cai empurram o lucro para cima.
 */
export function variationHelpsProfit(current: number, previous: number) {
  return current - previous > 0;
}

/**
 * Ponto de equilíbrio: a receita líquida que zera o resultado.
 *
 * Usa a raiz "Despesas Fixas" do plano padrão como custo fixo e o índice de
 * margem de contribuição do próprio período. Sem margem positiva não existe
 * ponto de equilíbrio — nenhum volume de venda cobre o custo fixo.
 */
export function breakEvenRevenue(totals: Pick<DreTotals, "despesasFixas" | "margemContribuicao" | "receitaLiquida">) {
  const fixed = Math.abs(totals.despesasFixas);
  if (fixed === 0 || totals.receitaLiquida <= 0) return null;
  const ratio = totals.margemContribuicao / totals.receitaLiquida;
  if (ratio <= 0) return null;
  return round(fixed / ratio);
}
