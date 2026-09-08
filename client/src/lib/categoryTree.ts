export type FlatCategory = {
  id: number;
  name: string;
  type: "entrada" | "saida" | "ambos";
  color: string;
  transactionCount: number;
  total: number;
  isActive: boolean;
};

export type CategoryNode = {
  /** Null quando o pai não está cadastrado e o nó existe só para agrupar. */
  category: FlatCategory | null;
  /** Nome completo, com o caminho: "Custos Operacionais/Insumos". */
  path: string;
  /** Só o último trecho, que é o que aparece na linha. */
  label: string;
  children: CategoryNode[];
  /** Soma própria mais a dos filhos. */
  subtotal: number;
  subtotalCount: number;
};

/**
 * As categorias são planas no banco, mas o nome carrega a hierarquia com "/" —
 * é a convenção que os 51 cadastros do usuário já usam. Esta função lê esse
 * caminho e devolve a árvore.
 *
 * Um filho pode existir sem o pai cadastrado ("A/B" sem "A"). Nesse caso o pai
 * vira um nó só de agrupamento, com `category: null`: descartar o filho o
 * esconderia da tela, e promovê-lo à raiz mentiria sobre a hierarquia que o
 * próprio nome declara.
 */
export function buildCategoryTree(categories: readonly FlatCategory[]): CategoryNode[] {
  const byPath = new Map<string, CategoryNode>();
  const roots: CategoryNode[] = [];

  const ensure = (path: string): CategoryNode => {
    const existing = byPath.get(path);
    if (existing) return existing;

    const segments = path.split("/");
    const node: CategoryNode = {
      category: null,
      path,
      label: segments[segments.length - 1].trim(),
      children: [],
      subtotal: 0,
      subtotalCount: 0,
    };
    byPath.set(path, node);

    if (segments.length === 1) {
      roots.push(node);
    } else {
      ensure(segments.slice(0, -1).join("/")).children.push(node);
    }
    return node;
  };

  for (const category of categories) {
    const path = category.name.split("/").map(part => part.trim()).filter(Boolean).join("/");
    if (!path) continue;
    const node = ensure(path);
    // Nomes repetidos: o primeiro cadastro fica com o nó, os demais somam nele.
    if (node.category) {
      node.category = {
        ...node.category,
        transactionCount: node.category.transactionCount + category.transactionCount,
        total: node.category.total + category.total,
      };
    } else {
      node.category = category;
    }
  }

  const accumulate = (node: CategoryNode) => {
    let total = node.category?.total ?? 0;
    let count = node.category?.transactionCount ?? 0;
    for (const child of node.children) {
      accumulate(child);
      total += child.subtotal;
      count += child.subtotalCount;
    }
    node.subtotal = total;
    node.subtotalCount = count;
    node.children.sort((left, right) => Math.abs(right.subtotal) - Math.abs(left.subtotal));
  };

  roots.forEach(accumulate);
  roots.sort((left, right) => Math.abs(right.subtotal) - Math.abs(left.subtotal));
  return roots;
}
