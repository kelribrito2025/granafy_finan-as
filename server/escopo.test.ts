import { describe, expect, it } from "vitest";
import { escopoDe, papelDaEmpresa } from "./escopo";

/*
 * O escopo, sem banco.
 *
 * `escopoDe` era uma linha — `{ userId: ctx.user.id, companyId }` — e uma linha
 * não precisa de teste. Na Fase A ela passa a decidir QUEM É O DONO a partir
 * da lista visível, e essa decisão é a base de todas as guardas: errá-la não
 * dá erro em lugar nenhum, dá o dado do dono errado. Então ela ganha teste
 * puro, com lista em memória, para a prova não depender de banco nem de
 * variável de ambiente.
 */

const ANA = 1;
const CLARA = 2;
const PADARIA = { id: 10, userId: ANA };
const CONSULTORIA = { id: 11, userId: ANA };

describe("papelDaEmpresa", () => {
  it("quem consta como dono é dono; qualquer outro é contador", () => {
    expect(papelDaEmpresa(ANA, PADARIA)).toBe("dono");
    expect(papelDaEmpresa(CLARA, PADARIA)).toBe("contador");
  });
});

describe("escopoDe", () => {
  it("para a dona, devolve o próprio id — o número de sempre", () => {
    expect(escopoDe({ user: { id: ANA }, activeCompanyId: PADARIA.id, companies: [PADARIA, CONSULTORIA] }))
      .toEqual({ userId: ANA, companyId: PADARIA.id });
  });

  /*
   * O teste da fase. A Clara está logada, mas o escopo aponta para a Ana: as
   * guardas filtram pelo dono, e o dono não mudou. O ator fica fora do WHERE.
   */
  it("para a contadora, devolve o id da DONA, não o dela", () => {
    const escopo = escopoDe({ user: { id: CLARA }, activeCompanyId: PADARIA.id, companies: [PADARIA] });
    expect(escopo.userId).toBe(ANA);
    expect(escopo.companyId).toBe(PADARIA.id);
  });

  it("com duas empresas do mesmo dono, usa a que está ativa", () => {
    expect(escopoDe({ user: { id: ANA }, activeCompanyId: CONSULTORIA.id, companies: [PADARIA, CONSULTORIA] }).companyId)
      .toBe(CONSULTORIA.id);
  });

  it("recusa sem usuário ou sem empresa ativa — o cinto além do suspensório", () => {
    expect(() => escopoDe({ user: null, activeCompanyId: PADARIA.id, companies: [PADARIA] })).toThrow(/fora de uma procedure/);
    expect(() => escopoDe({ user: { id: ANA }, activeCompanyId: null, companies: [PADARIA] })).toThrow(/fora de uma procedure/);
  });

  /*
   * A recusa nova, e a mais importante de fixar: a ativa fora da lista NÃO cai
   * de volta para `user.id`. Cair seria reintroduzir ator = dono em silêncio,
   * o exato furo que a fase fecha — e um contador com um contexto assim
   * passaria a ler os próprios dados como se fossem os do cliente.
   */
  it("recusa quando a empresa ativa não está na lista visível, em vez de cair para o ator", () => {
    expect(() => escopoDe({ user: { id: CLARA }, activeCompanyId: PADARIA.id, companies: [] }))
      .toThrow(/não está na lista/);
    expect(() => escopoDe({ user: { id: CLARA }, activeCompanyId: 999, companies: [PADARIA] }))
      .toThrow(/não está na lista/);
  });
});
