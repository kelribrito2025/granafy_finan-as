import { describe, expect, it } from "vitest";
import { companyDisplayName, companyInitials, sortCompanies } from "../shared/companies";

const base = { id: 1, legalName: "", tradeName: "", isActive: true, sortOrder: 0 };

describe("nome de exibição da empresa", () => {
  it("prefere a razão social", () => {
    expect(companyDisplayName({ legalName: "Numero Virtual LTDA", tradeName: "GranaFy" }, "Graziele"))
      .toBe("Numero Virtual LTDA");
  });

  it("cai no nome fantasia quando não há razão social", () => {
    expect(companyDisplayName({ legalName: "   ", tradeName: "Bigteck" }, "Graziele")).toBe("Bigteck");
  });

  it("cai no nome do usuário quando a empresa não tem nome nenhum", () => {
    /*
     * É o caso real do login que usava o sistema antes de existir cadastro de
     * empresa: duas contas e milhares de lançamentos, e nenhuma linha em
     * companyProfiles. O rótulo é de tela — nada disso vira dado gravado.
     */
    expect(companyDisplayName({ legalName: "", tradeName: "" }, "Financeiro Bigteck"))
      .toBe("Financeiro Bigteck");
  });

  it("tem um último recurso quando nem o usuário tem nome", () => {
    expect(companyDisplayName({ legalName: "", tradeName: "" }, "  ")).toBe("Empresa sem nome");
  });
});

describe("iniciais", () => {
  it("usa a inicial das duas primeiras palavras", () => {
    expect(companyInitials("Numero Virtual LTDA")).toBe("NV");
  });

  it("usa as duas primeiras letras quando é uma palavra só", () => {
    expect(companyInitials("Bigteck")).toBe("BI");
  });

  it("não quebra com nome vazio", () => {
    expect(companyInitials("   ")).toBe("—");
  });
});

describe("ordem da lista de empresas", () => {
  it("põe as ativas antes das arquivadas", () => {
    const lista = [
      { ...base, id: 1, isActive: false, sortOrder: 0 },
      { ...base, id: 2, isActive: true, sortOrder: 9 },
    ];
    expect(sortCompanies(lista).map(e => e.id)).toEqual([2, 1]);
  });

  it("respeita a ordem escolhida dentro do mesmo estado", () => {
    const lista = [
      { ...base, id: 1, sortOrder: 2 },
      { ...base, id: 2, sortOrder: 0 },
      { ...base, id: 3, sortOrder: 1 },
    ];
    expect(sortCompanies(lista).map(e => e.id)).toEqual([2, 3, 1]);
  });

  it("desempata pelo id para a lista não piscar entre duas leituras", () => {
    const lista = [
      { ...base, id: 7, sortOrder: 0 },
      { ...base, id: 3, sortOrder: 0 },
    ];
    expect(sortCompanies(lista).map(e => e.id)).toEqual([3, 7]);
    // A mesma entrada em outra ordem tem de sair igual.
    expect(sortCompanies([lista[1], lista[0]]).map(e => e.id)).toEqual([3, 7]);
  });

  it("não mexe no array recebido", () => {
    const lista = [{ ...base, id: 2 }, { ...base, id: 1 }];
    const copia = [...lista];
    sortCompanies(lista);
    expect(lista).toEqual(copia);
  });
});
