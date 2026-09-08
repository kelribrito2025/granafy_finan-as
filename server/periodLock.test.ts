import { describe, expect, it, vi } from "vitest";

const listClosedReconciliationPeriods = vi.fn();
const getFinancialAccount = vi.fn();

vi.mock("./db", () => ({
  listClosedReconciliationPeriods: (...args: unknown[]) => listClosedReconciliationPeriods(...args),
  getFinancialAccount: (...args: unknown[]) => getFinancialAccount(...args),
}));

const { assertPeriodsOpen } = await import("./periodLock");

function fechado(accountId: number, year: number, month: number) {
  listClosedReconciliationPeriods.mockResolvedValue([{ accountId, year, month }]);
  getFinancialAccount.mockResolvedValue({ id: accountId, name: "Efi Bank" });
}

describe("assertPeriodsOpen", () => {
  it("deixa passar quando nenhum mês está fechado", async () => {
    listClosedReconciliationPeriods.mockResolvedValue([]);
    await expect(
      assertPeriodsOpen(1, [{ accountId: 7, date: "2026-09-10" }])
    ).resolves.toBeUndefined();
  });

  it("recusa escrita no mês fechado da conta", async () => {
    fechado(7, 2026, 9);
    await expect(
      assertPeriodsOpen(1, [{ accountId: 7, date: "2026-09-10" }])
    ).rejects.toThrow(/setembro de 2026 está fechado/i);
  });

  it("diz qual conta e onde reabrir, para a pessoa não procurar no lugar errado", async () => {
    fechado(7, 2026, 9);
    await expect(
      assertPeriodsOpen(1, [{ accountId: 7, date: "2026-09-10" }])
    ).rejects.toThrow(/na conta Efi Bank[\s\S]*Reabrir o mês/);
  });

  it("não confunde o mês fechado de uma conta com o mesmo mês de outra", async () => {
    fechado(7, 2026, 9);
    await expect(
      assertPeriodsOpen(1, [{ accountId: 8, date: "2026-09-10" }])
    ).resolves.toBeUndefined();
  });

  it("olha o mês, não o dia", async () => {
    fechado(7, 2026, 9);
    await expect(assertPeriodsOpen(1, [{ accountId: 7, date: "2026-09-30" }])).rejects.toThrow();
    await expect(assertPeriodsOpen(1, [{ accountId: 7, date: "2026-10-01" }])).resolves.toBeUndefined();
  });

  it("basta uma linha do lote cair no mês fechado", async () => {
    fechado(7, 2026, 9);
    await expect(
      assertPeriodsOpen(1, [
        { accountId: 7, date: "2026-10-05" },
        { accountId: 7, date: "2026-11-05" },
        { accountId: 7, date: "2026-09-28" },
      ])
    ).rejects.toThrow(/setembro de 2026/i);
  });

  it("lançamento sem conta passa — o fechamento é por conta", async () => {
    fechado(7, 2026, 9);
    await expect(
      assertPeriodsOpen(1, [{ accountId: null, date: "2026-09-10" }])
    ).resolves.toBeUndefined();
  });

  it("não consulta o banco quando não há alvo com conta", async () => {
    listClosedReconciliationPeriods.mockClear();
    await assertPeriodsOpen(1, [{ accountId: null, date: "2026-09-10" }]);
    expect(listClosedReconciliationPeriods).not.toHaveBeenCalled();
  });
});
