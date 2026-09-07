export type TransactionSortKey = "amount" | "category" | "account" | "status";
export type TransactionSortDirection = "asc" | "desc";
export type TransactionSortState = { key: TransactionSortKey; direction: TransactionSortDirection } | null;

export type SortableTransaction = {
  id: number;
  amount: number;
  category: string;
  account: string;
  status: "Pago" | "Pendente";
};

export type DatedSortableTransaction = SortableTransaction & {
  transactionDate: string;
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

export function buildTransactionDisplayGroups<T extends DatedSortableTransaction>(
  transactions: T[],
  sort: TransactionSortState,
) {
  if (sort) {
    return [{
      date: null,
      items: sortTransactions(transactions, sort.key, sort.direction),
      total: transactions.reduce((sum, transaction) => sum + transaction.amount, 0),
    }];
  }

  const groups = new Map<string, T[]>();
  transactions.forEach(transaction => {
    groups.set(transaction.transactionDate, [...(groups.get(transaction.transactionDate) ?? []), transaction]);
  });
  return Array.from(groups, ([date, items]) => ({
    date,
    items,
    total: items.reduce((sum, transaction) => sum + transaction.amount, 0),
  }));
}
