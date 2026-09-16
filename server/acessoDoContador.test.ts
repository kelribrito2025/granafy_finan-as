import { describe, expect, it, vi } from "vitest";
import { podeLerAnexo } from "./attachments";

/*
 * Fase D — o contador entra e vê. Sem banco.
 *
 * Três decisões do servidor que a tela do contador depende:
 *   1. o anexo abre pela EMPRESA da linha, não pelo prefixo do dono;
 *   2. o seletor lista as liberadas com o papel certo e o saldo só delas;
 *   3. o primeiro acesso da empresa do cliente nunca aparece para o contador.
 */

const DONA = 1;
const CLARA = 2;
const PADARIA = 10;
const CONSULTORIA = 11;
const CHAVE_DA_DONA = `lancamentos/${DONA}/1700000000_nota.pdf`;

describe("podeLerAnexo", () => {
  it("o dono abre pelo prefixo, sem precisar de linha nenhuma", () => {
    expect(podeLerAnexo({ atorId: DONA, key: CHAVE_DA_DONA, empresaDoAnexo: null, empresasVisiveis: [] })).toBe(true);
  });

  it("a contadora abre o anexo de uma empresa que ela pode ver", () => {
    expect(podeLerAnexo({ atorId: CLARA, key: CHAVE_DA_DONA, empresaDoAnexo: PADARIA, empresasVisiveis: [PADARIA] })).toBe(true);
  });

  /*
   * O risco 1 do plano: as duas empresas da dona moram na mesma pasta. Liberada
   * só para a Padaria, a Clara não alcança o comprovante da Consultoria — a
   * chave até começa igual, mas a LINHA aponta para outra empresa.
   */
  it("a contadora NÃO abre o anexo da outra empresa do mesmo dono", () => {
    expect(podeLerAnexo({ atorId: CLARA, key: CHAVE_DA_DONA, empresaDoAnexo: CONSULTORIA, empresasVisiveis: [PADARIA] })).toBe(false);
  });

  it("anexo que nenhuma linha aponta só o dono alcança", () => {
    expect(podeLerAnexo({ atorId: CLARA, key: CHAVE_DA_DONA, empresaDoAnexo: null, empresasVisiveis: [PADARIA, CONSULTORIA] })).toBe(false);
  });
});

/* ── Os routers, com o banco simulado ─────────────────────────────────────── */

const saldosDeCaixaPorEmpresa = vi.fn();
const getUserPreferences = vi.fn().mockResolvedValue(null);
const getUserRecordById = vi.fn();
const getOnboardingCounts = vi.fn();

vi.mock("./db", () => ({
  saldosDeCaixaPorEmpresa: (...a: unknown[]) => saldosDeCaixaPorEmpresa(...a),
  getUserPreferences: (...a: unknown[]) => getUserPreferences(...a),
  getUserRecordById: (...a: unknown[]) => getUserRecordById(...a),
  getOnboardingCounts: (...a: unknown[]) => getOnboardingCounts(...a),
  listCompanies: vi.fn(),
  createCompany: vi.fn(),
  saveCompanyProfile: vi.fn(),
  setCompanyArchived: vi.fn(),
  markOnboardingCompleted: vi.fn(),
  LimiteDeEmpresas: class extends Error {},
  UltimaEmpresaAtiva: class extends Error {},
}));

const { companiesRouter } = await import("./routers/companies");
const { onboardingRouter } = await import("./routers/onboarding");
const { umaEmpresa, umContexto, umUsuario } = await import("./fixtures");

const ana = umUsuario({ id: DONA, name: "Ana" });
const clara = umUsuario({ id: CLARA, name: "Clara" });
const padaria = umaEmpresa({ id: PADARIA, userId: DONA, legalName: "Padaria" });
const consultoria = umaEmpresa({ id: CONSULTORIA, userId: DONA, legalName: "Consultoria" });
const escritorio = umaEmpresa({ id: 20, userId: CLARA, legalName: "Escritório" });

describe("companies.list para a contadora", () => {
  it("lista a própria e a liberada, com o papel de cada uma e o saldo só das que vê", async () => {
    saldosDeCaixaPorEmpresa.mockImplementation(async (dono: number) =>
      dono === DONA
        ? new Map([[PADARIA, 1000], [CONSULTORIA, 999_999]])
        : new Map([[20, 50]]),
    );
    // A Clara vê a Padaria (vínculo) e o Escritório (dela). A Consultoria NÃO está na lista.
    const ctx = umContexto({ user: clara, activeCompanyId: PADARIA, companies: [padaria, escritorio] });
    const lista = await companiesRouter.createCaller(ctx).list();

    expect(lista.map(e => [e.id, e.papel, e.podeGerir, e.saldo])).toEqual([
      [PADARIA, "Somente leitura", false, 1000],
      [20, "Administradora", true, 50],
    ]);
    // O caixa da Consultoria não vaza mesmo tendo vindo na agregação da dona.
    expect(lista.some(e => e.id === CONSULTORIA)).toBe(false);
  });

  it("para a dona nada muda: tudo Administradora, tudo gerível", async () => {
    saldosDeCaixaPorEmpresa.mockResolvedValue(new Map([[PADARIA, 1000], [CONSULTORIA, 2000]]));
    const ctx = umContexto({ user: ana, activeCompanyId: PADARIA, companies: [padaria, consultoria] });
    const lista = await companiesRouter.createCaller(ctx).list();
    expect(lista.every(e => e.papel === "Administradora" && e.podeGerir)).toBe(true);
    expect(saldosDeCaixaPorEmpresa).toHaveBeenLastCalledWith(DONA, expect.any(String));
  });
});

describe("onboarding.status para a contadora", () => {
  it("a empresa vazia do cliente pediria o primeiro acesso à dona — e nunca à contadora", async () => {
    getUserRecordById.mockResolvedValue({ ...clara, onboardingCompletedAt: null, createdAt: new Date() });
    getOnboardingCounts.mockResolvedValue({ accountCount: 0, transactionCount: 0 });
    const vazia = umaEmpresa({ id: PADARIA, userId: DONA, onboardingCompletedAt: null });

    const comoDona = umContexto({ user: ana, activeCompanyId: PADARIA, companies: [vazia] });
    expect((await onboardingRouter.createCaller(comoDona).status()).show).toBe(true);

    const comoContadora = umContexto({ user: clara, activeCompanyId: PADARIA, companies: [vazia] });
    expect((await onboardingRouter.createCaller(comoContadora).status()).show).toBe(false);
  });
});
