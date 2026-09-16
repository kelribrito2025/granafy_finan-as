import { describe, expect, it, vi } from "vitest";

/*
 * O mês fechado no MEIO do lote.
 *
 * A guarda de mês fechado existia em dois lugares: `assertPeriodsOpen`, que
 * recebe a lista inteira, e uma cópia local na conciliação que recebia UMA data
 * por chamada. A cópia não tinha como cobrir os dois caminhos em lote:
 *
 *   - `confirmBatch` conferia a primeira e a última data do lote ordenado;
 *   - `group` conferia só a primeira das até 50 movimentações.
 *
 * Um lote com janeiro aberto, fevereiro FECHADO e março aberto passava, e as
 * movimentações de fevereiro entravam num mês já assinado. Sem erro na tela,
 * sem linha no histórico, e o saldo fechado deixando de bater — que é o
 * sintoma mais caro deste projeto.
 *
 * Estes testes chamam as procedures de verdade, com o banco simulado: a
 * pergunta não é o que o banco responde, é QUAIS MESES a procedure chega a
 * perguntar. Por isso valem sem `TEST_DATABASE_URL` e rodam em qualquer lugar.
 */

const listClosedReconciliationPeriods = vi.fn();
const getFinancialAccount = vi.fn();
const getBankMovement = vi.fn();
const listReconciliationLinks = vi.fn();
const listUnlinkedTransactions = vi.fn();
const listCategoryRules = vi.fn();
const getTransactionsByIds = vi.fn();
const groupMovements = vi.fn();
const confirmSuggestions = vi.fn();

vi.mock("./db", () => ({
  listClosedReconciliationPeriods: (...a: unknown[]) => listClosedReconciliationPeriods(...a),
  getFinancialAccount: (...a: unknown[]) => getFinancialAccount(...a),
  getBankMovement: (...a: unknown[]) => getBankMovement(...a),
  listReconciliationLinks: (...a: unknown[]) => listReconciliationLinks(...a),
  listUnlinkedTransactions: (...a: unknown[]) => listUnlinkedTransactions(...a),
  listCategoryRules: (...a: unknown[]) => listCategoryRules(...a),
  getTransactionsByIds: (...a: unknown[]) => getTransactionsByIds(...a),
  groupMovements: (...a: unknown[]) => groupMovements(...a),
  confirmSuggestions: (...a: unknown[]) => confirmSuggestions(...a),
}));

const { reconciliationRouter } = await import("./routers/reconciliation");

const CONTA = 7;
const USUARIO = 1;
const EMPRESA = 60;

/*
 * Desde a Fase A o escopo tira o DONO de `ctx.companies`, não de `ctx.user`.
 * Um contexto sem a lista não é mais um contexto válido — a empresa ativa tem
 * que estar nela, e é dela que sai o `userId` das guardas.
 */
const ctx = {
  user: { id: USUARIO },
  activeCompanyId: EMPRESA,
  companies: [{ id: EMPRESA, userId: USUARIO }],
  ator: USUARIO,
  papel: "dono",
} as unknown as Parameters<typeof reconciliationRouter.createCaller>[0];

const chamador = () => reconciliationRouter.createCaller(ctx);

/** Uma movimentação daquele dia, com o mínimo que as procedures leem. */
function movimentacao(id: number, date: string, amount = "10.00") {
  return {
    id,
    userId: USUARIO,
    companyId: EMPRESA,
    accountId: CONTA,
    movementDate: date,
    description: `Movimento ${id}`,
    contact: "",
    amount,
    status: "sem_par" as const,
    classification: null,
    fingerprint: `fp-${id}`,
    externalId: null,
  };
}

/** Fevereiro de 2026 fechado naquela conta; o resto aberto. */
function fevereiroFechado() {
  listClosedReconciliationPeriods.mockResolvedValue([{ accountId: CONTA, year: 2026, month: 2 }]);
  getFinancialAccount.mockResolvedValue({ id: CONTA, name: "Efi Bank" });
}

function nadaFechado() {
  listClosedReconciliationPeriods.mockResolvedValue([]);
  getFinancialAccount.mockResolvedValue({ id: CONTA, name: "Efi Bank" });
}

describe("confirmBatch e o mês fechado no meio do lote", () => {
  /*
   * O caso que o código antigo deixava passar. As pontas — janeiro e março —
   * estão abertas, então as duas únicas checagens que existiam aprovavam o
   * lote inteiro, fevereiro incluído.
   */
  it("recusa quando um mês do MEIO está fechado, com as duas pontas abertas", async () => {
    fevereiroFechado();
    getBankMovement.mockImplementation((_escopo: unknown, id: number) =>
      Promise.resolve(({
        1: movimentacao(1, "2026-01-15"),
        2: movimentacao(2, "2026-02-15"),
        3: movimentacao(3, "2026-03-15"),
      } as Record<number, ReturnType<typeof movimentacao>>)[id] ?? null),
    );

    await expect(
      chamador().confirmBatch({ movementIds: [1, 2, 3] }),
    ).rejects.toThrow(/fevereiro de 2026 está fechado/i);

    // E nada foi gravado: a recusa vem antes de qualquer escrita.
    expect(confirmSuggestions).not.toHaveBeenCalled();
  });

  it("continua recusando quando a ponta é que está fechada", async () => {
    fevereiroFechado();
    getBankMovement.mockImplementation((_escopo: unknown, id: number) =>
      Promise.resolve(({
        1: movimentacao(1, "2026-02-10"),
        2: movimentacao(2, "2026-03-10"),
      } as Record<number, ReturnType<typeof movimentacao>>)[id] ?? null),
    );

    await expect(
      chamador().confirmBatch({ movementIds: [1, 2] }),
    ).rejects.toThrow(/fevereiro de 2026 está fechado/i);
  });

  /*
   * A mensagem importa tanto quanto a recusa: a versão antiga dizia só "este
   * mês está fechado", e quem recebia isso num lote de três meses não tinha
   * como saber qual reabrir.
   */
  it("diz QUAL mês e QUAL conta, para a pessoa saber o que reabrir", async () => {
    fevereiroFechado();
    getBankMovement.mockImplementation((_escopo: unknown, id: number) =>
      Promise.resolve(({ 1: movimentacao(1, "2026-02-15"), 2: movimentacao(2, "2026-03-15") } as Record<number, ReturnType<typeof movimentacao>>)[id] ?? null),
    );

    await expect(chamador().confirmBatch({ movementIds: [1, 2] }))
      .rejects.toThrow(/Efi Bank/);
  });
});

describe("group e o mês fechado depois da primeira movimentação", () => {
  /*
   * Pior que o lote: `group` conferia SÓ a primeira das até 50. Bastava a
   * primeira estar num mês aberto para as outras 49 entrarem onde quisessem.
   */
  it("recusa quando a segunda movimentação cai em mês fechado", async () => {
    fevereiroFechado();
    getBankMovement.mockImplementation((_escopo: unknown, id: number) =>
      Promise.resolve(({
        1: movimentacao(1, "2026-03-05", "40.00"),
        2: movimentacao(2, "2026-02-20", "60.00"),
      } as Record<number, ReturnType<typeof movimentacao>>)[id] ?? null),
    );
    listReconciliationLinks.mockResolvedValue([]);
    getTransactionsByIds.mockResolvedValue([
      { id: 99, accountId: CONTA, amount: "100.00", description: "Aluguel" },
    ]);

    await expect(
      chamador().group({ movementIds: [1, 2], transactionId: 99 }),
    ).rejects.toThrow(/fevereiro de 2026 está fechado/i);

    expect(groupMovements).not.toHaveBeenCalled();
  });

  it("deixa agrupar quando nenhum dos meses está fechado", async () => {
    nadaFechado();
    getBankMovement.mockImplementation((_escopo: unknown, id: number) =>
      Promise.resolve(({
        1: movimentacao(1, "2026-03-05", "40.00"),
        2: movimentacao(2, "2026-04-20", "60.00"),
      } as Record<number, ReturnType<typeof movimentacao>>)[id] ?? null),
    );
    listReconciliationLinks.mockResolvedValue([]);
    getTransactionsByIds.mockResolvedValue([
      { id: 99, accountId: CONTA, amount: "100.00", description: "Aluguel" },
    ]);
    groupMovements.mockResolvedValue(undefined);

    await expect(
      chamador().group({ movementIds: [1, 2], transactionId: 99 }),
    ).resolves.toEqual({ success: true });
    expect(groupMovements).toHaveBeenCalledOnce();
  });
});
