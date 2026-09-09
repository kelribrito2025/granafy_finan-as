import { describe, expect, it } from "vitest";
import { defaultCompanyId, pickActiveCompany } from "../shared/activeCompany";

const empresa = (id: number, extra: Partial<{ isActive: boolean; sortOrder: number }> = {}) => ({
  id,
  legalName: "",
  tradeName: "",
  isActive: extra.isActive ?? true,
  sortOrder: extra.sortOrder ?? 0,
});

const DA_ANA = [empresa(10), empresa(11, { sortOrder: 1 })];

describe("empresa ativa do request", () => {
  it("sem pedido, usa a padrão", () => {
    expect(pickActiveCompany({ empresas: DA_ANA, pedida: null }))
      .toEqual({ status: "ok", companyId: 10, pedidoAtendido: true });
  });

  it("com pedido que é do próprio dono, atende", () => {
    expect(pickActiveCompany({ empresas: DA_ANA, pedida: 11 }))
      .toEqual({ status: "ok", companyId: 11, pedidoAtendido: true });
  });

  it("NUNCA devolve empresa que não está na lista do dono", () => {
    /*
     * A regra que o projeto inteiro existe para garantir. O pedido por uma
     * empresa alheia não vira erro nem vira a empresa alheia: vira a padrão do
     * próprio dono, com o pedido marcado como não atendido.
     */
    const resultado = pickActiveCompany({ empresas: DA_ANA, pedida: 99 });
    expect(resultado).toEqual({ status: "ok", companyId: 10, pedidoAtendido: false });
    if (resultado.status === "ok") {
      expect(resultado.companyId).not.toBe(99);
      expect(DA_ANA.map(e => e.id)).toContain(resultado.companyId);
    }
  });

  it("distingue pedido atendido de pedido ignorado", () => {
    /*
     * Sem essa distinção a tela não teria como saber que a seleção guardada
     * ficou velha, e a pessoa veria outra empresa sem nada para clicar.
     */
    const atendido = pickActiveCompany({ empresas: DA_ANA, pedida: 10 });
    const ignorado = pickActiveCompany({ empresas: DA_ANA, pedida: 99 });
    expect(atendido).toHaveProperty("pedidoAtendido", true);
    expect(ignorado).toHaveProperty("pedidoAtendido", false);
    // E os dois chegam ao mesmo id: só o sinal os separa.
    expect((atendido as { companyId: number }).companyId).toBe((ignorado as { companyId: number }).companyId);
  });

  it("lista vazia é violação de invariante, com status próprio", () => {
    expect(pickActiveCompany({ empresas: [], pedida: null })).toEqual({ status: "sem-empresa" });
    // Nem mesmo pedindo: sem lista, não há o que atender.
    expect(pickActiveCompany({ empresas: [], pedida: 10 })).toEqual({ status: "sem-empresa" });
  });

  it("a padrão respeita a ordem: ativa antes de arquivada", () => {
    const lista = [empresa(10, { isActive: false, sortOrder: 0 }), empresa(11, { sortOrder: 5 })];
    expect(defaultCompanyId(lista)).toBe(11);
    expect(pickActiveCompany({ empresas: lista, pedida: null }))
      .toEqual({ status: "ok", companyId: 11, pedidoAtendido: true });
  });

  it("a arquivada continua acessível quando pedida de propósito", () => {
    const lista = [empresa(10, { isActive: false }), empresa(11, { sortOrder: 5 })];
    expect(pickActiveCompany({ empresas: lista, pedida: 10 }))
      .toEqual({ status: "ok", companyId: 10, pedidoAtendido: true });
  });

  it("todas arquivadas ainda dão uma padrão", () => {
    const lista = [empresa(10, { isActive: false, sortOrder: 2 }), empresa(11, { isActive: false, sortOrder: 1 })];
    expect(defaultCompanyId(lista)).toBe(11);
  });
});
