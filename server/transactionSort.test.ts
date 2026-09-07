import { describe, expect, it } from "vitest";
import { buildTransactionDisplayGroups, sortTransactions } from "../client/src/lib/transactionSort";

const rows = [
  { id: 1, amount: -4, category: "Tarifas", account: "Efi Bank", status: "Pago" as const },
  { id: 2, amount: 100, category: "Receitas", account: "Nubank", status: "Pendente" as const },
  { id: 3, amount: -50, category: "Aluguel", account: "Bradesco", status: "Pago" as const },
];

describe("transaction table sorting", () => {
  it("sorts financial values by magnitude in both directions", () => {
    expect(sortTransactions(rows, "amount", "desc").map(row => row.id)).toEqual([2, 3, 1]);
    expect(sortTransactions(rows, "amount", "asc").map(row => row.id)).toEqual([1, 3, 2]);
  });

  it.each(["category", "account", "status"] as const)("sorts %s alphabetically in both directions", key => {
    const ascending = sortTransactions(rows, key, "asc").map(row => row[key]);
    const descending = sortTransactions(rows, key, "desc").map(row => row[key]);
    expect(descending).toEqual([...ascending].reverse());
  });

  it("sorts all dates in one global list while preserving each row date", () => {
    const datedRows = [
      { ...rows[0], transactionDate: "2026-09-06" },
      { ...rows[1], transactionDate: "2026-09-02" },
      { ...rows[2], transactionDate: "2026-09-05" },
    ];
    const groups = buildTransactionDisplayGroups(datedRows, { key: "amount", direction: "desc" });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.date).toBeNull();
    expect(groups[0]?.items.map(row => [row.id, row.transactionDate])).toEqual([
      [2, "2026-09-02"],
      [3, "2026-09-05"],
      [1, "2026-09-06"],
    ]);
  });

  it("keeps daily groups when no column ordering is active", () => {
    const datedRows = [
      { ...rows[0], transactionDate: "2026-09-06" },
      { ...rows[1], transactionDate: "2026-09-02" },
      { ...rows[2], transactionDate: "2026-09-06" },
    ];
    const groups = buildTransactionDisplayGroups(datedRows, null);
    expect(groups.map(group => [group.date, group.items.length])).toEqual([
      ["2026-09-06", 2],
      ["2026-09-02", 1],
    ]);
  });
});
