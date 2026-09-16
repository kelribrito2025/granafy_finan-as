import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";

/*
 * As quatro mutações que ficaram FORA da tranca — e por que isso não é um furo.
 *
 * `escritaProcedure` decide pelo papel na empresa ABERTA. As mutações deste
 * router recebem OUTRA empresa por parâmetro, então a tranca genérica
 * responderia a pergunta errada: uma contadora com a própria empresa aberta
 * (papel "dono") passaria por ela e chegaria em `rename` com o id da empresa do
 * cliente. A guarda certa é por alvo, e mora em `escopoDoAlvo`.
 *
 * Antes da Fase A o alvo alheio simplesmente não achava linha e o UPDATE não
 * pegava nada — seguro e SILENCIOSO, com a tela dizendo "salvo". Estes testes
 * fixam a recusa explícita no lugar do no-op.
 */

const saveCompanyProfile = vi.fn();
const setCompanyArchived = vi.fn();

vi.mock("./db", () => ({
  saveCompanyProfile: (...a: unknown[]) => saveCompanyProfile(...a),
  setCompanyArchived: (...a: unknown[]) => setCompanyArchived(...a),
  createCompany: vi.fn(),
  listCompanies: vi.fn(),
  somarSaldosDasEmpresas: vi.fn(),
  contarUsoDaEmpresa: vi.fn(),
  LimiteDeEmpresas: class extends Error {},
  UltimaEmpresaAtiva: class extends Error {},
}));

const { companiesRouter } = await import("./routers/companies");
const { umaEmpresa, umContexto, umUsuario } = await import("./fixtures");

const ANA = umUsuario({ id: 1, name: "Ana" });
const CLARA = umUsuario({ id: 2, name: "Clara" });

const PADARIA_DA_ANA = umaEmpresa({ id: 10, userId: ANA.id });
const ESCRITORIO_DA_CLARA = umaEmpresa({ id: 20, userId: CLARA.id });

/**
 * A Clara com a PRÓPRIA empresa aberta: papel "dono", tranca genérica aberta.
 * É exatamente o contexto em que uma guarda por empresa ativa não protegeria
 * nada — e é por isso que o teste usa este, e não o contexto óbvio.
 */
function claraNaPropriaEmpresa() {
  return umContexto({
    user: CLARA,
    activeCompanyId: ESCRITORIO_DA_CLARA.id,
    companies: [PADARIA_DA_ANA, ESCRITORIO_DA_CLARA],
    res: { cookie: vi.fn() } as unknown as ReturnType<typeof umContexto>["res"],
  });
}

function anaNaPropriaEmpresa() {
  return umContexto({
    user: ANA,
    activeCompanyId: PADARIA_DA_ANA.id,
    companies: [PADARIA_DA_ANA],
    res: { cookie: vi.fn() } as unknown as ReturnType<typeof umContexto>["res"],
  });
}

describe("escopoDoAlvo: só o dono renomeia e arquiva", () => {
  it("a dona renomeia a própria empresa — nada aqui atrapalha quem sempre pôde", async () => {
    saveCompanyProfile.mockClear().mockResolvedValue(undefined);
    const ctx = anaNaPropriaEmpresa();

    await expect(companiesRouter.createCaller(ctx).rename({
      companyId: PADARIA_DA_ANA.id, legalName: "Padaria Nova", tradeName: "", taxId: "",
    })).resolves.toEqual({ success: true });

    expect(saveCompanyProfile).toHaveBeenCalledOnce();
    expect(saveCompanyProfile.mock.calls[0]![0]).toEqual({ userId: ANA.id, companyId: PADARIA_DA_ANA.id });
  });

  it("a contadora NÃO renomeia a empresa do cliente, mesmo passando pela tranca", async () => {
    saveCompanyProfile.mockClear();
    const ctx = claraNaPropriaEmpresa();
    expect(ctx.papel).toBe("dono"); // na empresa dela — a tranca genérica deixaria passar

    const erro = await companiesRouter.createCaller(ctx).rename({
      companyId: PADARIA_DA_ANA.id, legalName: "Sequestrada", tradeName: "", taxId: "",
    }).catch(e => e as TRPCError);

    expect(erro.code).toBe("FORBIDDEN");
    expect(erro.message).toMatch(/somente leitura/i);
    // E o mais importante: recusou ANTES de gravar, não depois.
    expect(saveCompanyProfile).not.toHaveBeenCalled();
  });

  it("a contadora NÃO arquiva a empresa do cliente", async () => {
    setCompanyArchived.mockClear();
    const erro = await companiesRouter.createCaller(claraNaPropriaEmpresa())
      .setArchived({ companyId: PADARIA_DA_ANA.id, archived: true })
      .catch(e => e as TRPCError);

    expect(erro.code).toBe("FORBIDDEN");
    expect(setCompanyArchived).not.toHaveBeenCalled();
  });

  it("empresa fora da lista do request é NOT_FOUND, não FORBIDDEN", async () => {
    /*
     * A distinção é de vazamento: FORBIDDEN para um id qualquer confirmaria que
     * a empresa existe. Quem não tem acesso nenhum ouve que não existe.
     */
    const erro = await companiesRouter.createCaller(anaNaPropriaEmpresa()).rename({
      companyId: 9999, legalName: "x", tradeName: "", taxId: "",
    }).catch(e => e as TRPCError);

    expect(erro.code).toBe("NOT_FOUND");
  });

  it("a contadora ABRE a empresa do cliente — trocar de empresa não é escrita", async () => {
    /*
     * O contraponto necessário: se `open` também recusasse, o vínculo não
     * serviria para nada, porque o contador nunca chegaria a ver a empresa.
     */
    const ctx = claraNaPropriaEmpresa();
    await expect(companiesRouter.createCaller(ctx).open({ companyId: PADARIA_DA_ANA.id }))
      .resolves.toEqual({ success: true });
    expect(ctx.res.cookie).toHaveBeenCalled();
  });
});
