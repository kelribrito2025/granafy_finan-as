import { describe, expect, it } from "vitest";
import { sortTransactions } from "../client/src/lib/transactionSort";

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
});
