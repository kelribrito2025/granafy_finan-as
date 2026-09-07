export const ASSET_CATEGORIES = [
  "equipamento",
  "veiculo",
  "imovel",
  "software",
  "movel",
  "estoque",
  "investimento",
  "direito",
  "outro",
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export type AssetItemType = "bem" | "estoque" | "investimento" | "direito" | "outro";

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  equipamento: "Equipamentos",
  veiculo: "Veículos",
  imovel: "Imóveis",
  software: "Software e licenças",
  movel: "Móveis e utensílios",
  estoque: "Estoque",
  investimento: "Investimentos",
  direito: "Direitos a receber",
  outro: "Outros",
};

/** Categorias que costumam depreciar. Só muda o padrão sugerido no formulário. */
export const DEPRECIABLE_CATEGORIES: readonly AssetCategory[] = [
  "equipamento",
  "veiculo",
  "imovel",
  "software",
  "movel",
];

/**
 * `itemType` é a classificação contábil e continua existindo no banco; a
 * categoria é a taxonomia que o usuário escolhe na tela. Derivar uma da outra
 * impede que as duas divirjam — um item categorizado como Estoque mas gravado
 * com itemType "bem" sairia errado nos relatórios sem nenhum aviso.
 */
export function assetItemType(category: AssetCategory): AssetItemType {
  switch (category) {
    case "estoque":
      return "estoque";
    case "investimento":
      return "investimento";
    case "direito":
      return "direito";
    case "outro":
      return "outro";
    default:
      return "bem";
  }
}
