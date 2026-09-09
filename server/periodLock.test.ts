import { describe, expect, it, vi } from "vitest";

const listClosedReconciliationPeriods = vi.fn();
const getFinancialAccount = vi.fn();

vi.mock("./db", () => ({
  listClosedReconciliationPeriods: (...args: unknown[]) => listClosedReconciliationPeriods(...args),
  getFinancialAccount: (...args: unknown[]) => getFinancialAccount(...args),
}));

const { assertPeriodsOpen } = await import("./periodLock");

/*
 * O escopo, e não um número solto.
 *
 * Estes testes chamavam `assertPeriodsOpen(1, …)`. Com o `db` inteiro mockado,
 * `escopo.userId` virava `undefined` e o mock ignorava — os testes passavam
 * chamando a função de um jeito que a produção nunca chamaria. O compilador não
 * apitou porque os arquivos de teste estão fora do tsconfig; a dívida cobrou
 * aqui — e este comentário, na primeira versão, citava o padrão de exclusão
 * literalmente e fechou o próprio bloco antes da hora.
 */
const ESCOPO = { userId: 1, companyId: 60 } as const;

function fechado(accountId: number, year: number, month: number) {
  listClosedReconciliationPeriods.mockResolvedValue([{ accountId, year, month }]);
  getFinancialAccount.mockResolvedValue({ id: accountId, name: "Efi Bank" });
}

describe("assertPeriodsOpen", () => {
  it("deixa passar quando nenhum mês está fechado", async () => {
    listClosedReconciliationPeriods.mockResolvedValue([]);
    await expect(
      assertPeriodsOpen(ESCOPO, [{ accountId: 7, date: "2026-09-10" }])
    ).resolves.toBeUndefined();
  });

  it("recusa escrita no mês fechado da conta", async () => {
    fechado(7, 2026, 9);
    await expect(
      assertPeriodsOpen(ESCOPO, [{ accountId: 7, date: "2026-09-10" }])
    ).rejects.toThrow(/setembro de 2026 está fechado/i);
  });

  it("diz qual conta e onde reabrir, para a pessoa não procurar no lugar errado", async () => {
    fechado(7, 2026, 9);
    await expect(
      assertPeriodsOpen(ESCOPO, [{ accountId: 7, date: "2026-09-10" }])
    ).rejects.toThrow(/na conta Efi Bank[\s\S]*Reabrir o mês/);
  });

  it("não confunde o mês fechado de uma conta com o mesmo mês de outra", async () => {
    fechado(7, 2026, 9);
    await expect(
      assertPeriodsOpen(ESCOPO, [{ accountId: 8, date: "2026-09-10" }])
    ).resolves.toBeUndefined();
  });

  it("olha o mês, não o dia", async () => {
    fechado(7, 2026, 9);
    await expect(assertPeriodsOpen(ESCOPO, [{ accountId: 7, date: "2026-09-30" }])).rejects.toThrow();
    await expect(assertPeriodsOpen(ESCOPO, [{ accountId: 7, date: "2026-10-01" }])).resolves.toBeUndefined();
  });

  it("basta uma linha do lote cair no mês fechado", async () => {
    fechado(7, 2026, 9);
    await expect(
      assertPeriodsOpen(ESCOPO, [
        { accountId: 7, date: "2026-10-05" },
        { accountId: 7, date: "2026-11-05" },
        { accountId: 7, date: "2026-09-28" },
      ])
    ).rejects.toThrow(/setembro de 2026/i);
  });

  it("lançamento sem conta passa — o fechamento é por conta", async () => {
    fechado(7, 2026, 9);
    await expect(
      assertPeriodsOpen(ESCOPO, [{ accountId: null, date: "2026-09-10" }])
    ).resolves.toBeUndefined();
  });

  it("passa o escopo adiante — dono E empresa — para a consulta do banco", async () => {
    /*
     * O teste que a quebra de assinatura tornou possível escrever. Antes, com
     * um número no lugar do escopo, dava para trocar `escopo.userId` por
     * qualquer coisa e nada denunciava.
     */
    fechado(7, 2026, 9);
    await expect(assertPeriodsOpen(ESCOPO, [{ accountId: 7, date: "2026-09-10" }])).rejects.toThrow();
    /*
     * As DUAS consultas recebem o escopo inteiro. Até a sub-leva 3,
     * `listClosedReconciliationPeriods` recebia só o `userId` — e este teste,
     * que exigia exatamente isso, foi o que denunciou a mudança na suíte cheia.
     * É para isso que ele existe.
     */
    expect(listClosedReconciliationPeriods).toHaveBeenCalledWith(ESCOPO);
    expect(getFinancialAccount).toHaveBeenCalledWith(ESCOPO, 7);
  });

  it("não consulta o banco quando não há alvo com conta", async () => {
    listClosedReconciliationPeriods.mockClear();
    await assertPeriodsOpen(ESCOPO, [{ accountId: null, date: "2026-09-10" }]);
    expect(listClosedReconciliationPeriods).not.toHaveBeenCalled();
  });
});
