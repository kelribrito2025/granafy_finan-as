import { describe, expect, it } from "vitest";
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABELS,
  assetItemType,
  DEPRECIABLE_CATEGORIES,
  type AssetItemType,
} from "./assetCategory";

const TIPOS_VALIDOS: AssetItemType[] = ["bem", "estoque", "investimento", "direito", "outro"];

describe("assetItemType", () => {
  it("mapeia os bens físicos e o software para 'bem'", () => {
    for (const categoria of ["equipamento", "veiculo", "imovel", "software", "movel"] as const) {
      expect(assetItemType(categoria)).toBe("bem");
    }
  });

  it("preserva as categorias que já são um tipo contábil", () => {
    expect(assetItemType("estoque")).toBe("estoque");
    expect(assetItemType("investimento")).toBe("investimento");
    expect(assetItemType("direito")).toBe("direito");
    expect(assetItemType("outro")).toBe("outro");
  });

  it("nunca devolve um tipo que o banco não aceita", () => {
    for (const categoria of ASSET_CATEGORIES) {
      expect(TIPOS_VALIDOS).toContain(assetItemType(categoria));
    }
  });
});

describe("catálogo de categorias", () => {
  it("tem rótulo para toda categoria", () => {
    for (const categoria of ASSET_CATEGORIES) {
      expect(ASSET_CATEGORY_LABELS[categoria]).toBeTruthy();
    }
    expect(Object.keys(ASSET_CATEGORY_LABELS)).toHaveLength(ASSET_CATEGORIES.length);
  });

  it("não repete rótulo", () => {
    const rotulos = Object.values(ASSET_CATEGORY_LABELS);
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });

  it("só marca como depreciável o que vira 'bem'", () => {
    for (const categoria of DEPRECIABLE_CATEGORIES) {
      expect(assetItemType(categoria)).toBe("bem");
    }
  });
});
