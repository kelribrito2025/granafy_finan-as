export type TransactionSortKey = "amount" | "category" | "account" | "status";
export type TransactionSortDirection = "asc" | "desc";

export type SortableTransaction = {
  id: number;
  amount: number;
  category: string;
  account: string;
  status: "Pago" | "Pendente";
};

export function sortTransactions<T extends SortableTransaction>(
  transactions: T[],
  key: TransactionSortKey,
  direction: TransactionSortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...transactions].sort((left, right) => {
    const comparison = key === "amount"
      ? Math.abs(left.amount) - Math.abs(right.amount)
      : left[key].localeCompare(right[key], "pt-BR", { sensitivity: "base" });
    return comparison === 0 ? left.id - right.id : comparison * multiplier;
  });
}
