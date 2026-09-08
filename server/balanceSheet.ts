import type {
  FinancialAccountRecord,
  PatrimonialItemRecord,
  TransactionRecord,
} from "../drizzle/schema";

export const BALANCE_GROUPS = [
  "ativo_circulante",
  "ativo_nao_circulante",
  "passivo_circulante",
  "passivo_nao_circulante",
  "patrimonio_liquido",
] as const;

export type BalanceGroup = (typeof BALANCE_GROUPS)[number];

export type CalculatedPatrimonialItem = PatrimonialItemRecord & {
  acquisitionValueNumber: number;
  currentValueNumber: number;
  residualValueNumber: number;
  bookValue: number;
  accumulatedDepreciation: number;
};

export type BalanceSheetSummary = {
  cashAndEquivalents: number;
  financialCurrentLiabilities: number;
  manualCurrentAssets: number;
  currentAssets: number;
  nonCurrentAssets: number;
  currentLiabilities: number;
  nonCurrentLiabilities: number;
  declaredEquity: number;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  balanceDifference: number;
  liquidityRatio: number | null;
  debtRatio: number | null;
};

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function elapsedMonths(fromDate: string, toDate: string) {
  if (toDate <= fromDate) return 0;
  const [fromYear, fromMonth, fromDay] = fromDate.split("-").map(Number);
  const [toYear, toMonth, toDay] = toDate.split("-").map(Number);
  const raw = (toYear - fromYear) * 12 + toMonth - fromMonth;
  return Math.max(0, raw - (toDay < fromDay ? 1 : 0));
}

export function calculateItemBookValue(
  item: Pick<
    PatrimonialItemRecord,
    | "isActive"
    | "acquisitionDate"
    | "acquisitionValue"
    | "currentValue"
    | "valuationMethod"
    | "usefulLifeMonths"
    | "residualValue"
  >,
  referenceDate: string
) {
  if (!item.isActive) return 0;
  if (item.acquisitionDate && item.acquisitionDate > referenceDate) return 0;

  const currentValue = Math.max(0, Number(item.currentValue));
  if (item.valuationMethod !== "depreciacao_linear") {
    return roundCurrency(currentValue);
  }

  const acquisitionValue = Math.max(0, Number(item.acquisitionValue));
  const residualValue = Math.min(
    acquisitionValue,
    Math.max(0, Number(item.residualValue))
  );
  const usefulLifeMonths = item.usefulLifeMonths ?? 0;
  if (!item.acquisitionDate || usefulLifeMonths <= 0) {
    return roundCurrency(currentValue);
  }

  const months = Math.min(
    usefulLifeMonths,
    elapsedMonths(item.acquisitionDate, referenceDate)
  );
  const monthlyDepreciation = (acquisitionValue - residualValue) / usefulLifeMonths;
  return roundCurrency(
    Math.max(residualValue, acquisitionValue - monthlyDepreciation * months)
  );
}

export function calculatePatrimonialItems(
  items: PatrimonialItemRecord[],
  referenceDate: string
): CalculatedPatrimonialItem[] {
  return items.map(item => {
    const bookValue = calculateItemBookValue(item, referenceDate);
    const acquisitionValueNumber = Number(item.acquisitionValue);
    return {
      ...item,
      acquisitionValueNumber,
      currentValueNumber: Number(item.currentValue),
      residualValueNumber: Number(item.residualValue),
      bookValue,
      accumulatedDepreciation: item.valuationMethod === "depreciacao_linear"
        ? roundCurrency(Math.max(0, acquisitionValueNumber - bookValue))
        : 0,
    };
  });
}

export function calculateCashAndEquivalents(
  accounts: FinancialAccountRecord[],
  transactions: TransactionRecord[],
  referenceDate: string
) {
  return calculateFinancialPositions(accounts, transactions, referenceDate).cashAndEquivalents;
}

export function calculateFinancialPositions(
  accounts: FinancialAccountRecord[],
  transactions: TransactionRecord[],
  referenceDate: string
) {
  const moved = new Map<number, number>();
  transactions.forEach(transaction => {
    if (
      transaction.status !== "Pago" ||
      !transaction.accountId ||
      transaction.transactionDate > referenceDate
    ) return;
    moved.set(transaction.accountId, (moved.get(transaction.accountId) ?? 0) + Number(transaction.amount));
  });
  return summarizeAccountPositions(accounts, moved);
}

/**
 * Caixa e obrigações a partir do movimento já somado por conta.
 *
 * Separado do laço acima porque o mesmo cálculo agora recebe o SUM do banco:
 * baixar o razão inteiro para somar uma coluna custava 380 ms e 5.850 linhas
 * de rede no maior usuário.
 */
export function summarizeAccountPositions(
  accounts: FinancialAccountRecord[],
  movementByAccount: Map<number, number>
) {
  const balances = new Map<number, number>();
  accounts.forEach(account =>
    balances.set(account.id, Number(account.initialBalance) + (movementByAccount.get(account.id) ?? 0))
  );

  let cashAndEquivalents = 0;
  let currentLiabilities = 0;
  accounts.forEach(account => {
    const balance = balances.get(account.id) ?? 0;
    if (balance < 0) currentLiabilities += Math.abs(balance);
    else if (account.accountType !== "cartao") cashAndEquivalents += balance;
  });

  return {
    cashAndEquivalents: roundCurrency(cashAndEquivalents),
    currentLiabilities: roundCurrency(currentLiabilities),
  };
}

export function summarizeBalanceSheet(
  calculatedItems: CalculatedPatrimonialItem[],
  cashAndEquivalents: number,
  financialCurrentLiabilities = 0
): BalanceSheetSummary {
  const activeItems = calculatedItems.filter(item => item.isActive);
  const totalFor = (group: BalanceGroup) => roundCurrency(
    activeItems
      .filter(item => item.balanceGroup === group)
      .reduce((sum, item) => sum + item.bookValue, 0)
  );

  const manualCurrentAssets = totalFor("ativo_circulante");
  const currentAssets = roundCurrency(cashAndEquivalents + manualCurrentAssets);
  const nonCurrentAssets = totalFor("ativo_nao_circulante");
  const currentLiabilities = roundCurrency(
    totalFor("passivo_circulante") + financialCurrentLiabilities
  );
  const nonCurrentLiabilities = totalFor("passivo_nao_circulante");
  const declaredEquity = totalFor("patrimonio_liquido");
  const totalAssets = roundCurrency(currentAssets + nonCurrentAssets);
  const totalLiabilities = roundCurrency(currentLiabilities + nonCurrentLiabilities);
  const netWorth = roundCurrency(totalAssets - totalLiabilities);

  return {
    cashAndEquivalents,
    financialCurrentLiabilities,
    manualCurrentAssets,
    currentAssets,
    nonCurrentAssets,
    currentLiabilities,
    nonCurrentLiabilities,
    declaredEquity,
    totalAssets,
    totalLiabilities,
    netWorth,
    balanceDifference: roundCurrency(netWorth - declaredEquity),
    liquidityRatio: currentLiabilities > 0
      ? roundCurrency(currentAssets / currentLiabilities)
      : null,
    debtRatio: totalAssets > 0
      ? roundCurrency((totalLiabilities / totalAssets) * 100)
      : null,
  };
}
