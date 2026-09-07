type Comparable = { referenceDate: string; totalAssets: number; netWorth: number };

/**
 * O fechamento mais recente salvo até a data-base. `history` chega em ordem crescente
 * de data. Sem nenhum fechamento até ali o retorno é null — e a tela não mostra
 * variação nenhuma, em vez de comparar com uma base inventada.
 */
export function findBaseline<T extends { referenceDate: string }>(
  history: readonly T[],
  baselineDate: string
): T | null {
  let found: T | null = null;
  for (const snapshot of history) {
    if (snapshot.referenceDate <= baselineDate) found = snapshot;
  }
  return found;
}

/** Variação percentual do ativo. Null sem base, ou se a base tinha ativo zero. */
export function assetsChangePercent(current: number, baseline: Comparable | null) {
  if (!baseline || baseline.totalAssets <= 0) return null;
  return ((current - baseline.totalAssets) / baseline.totalAssets) * 100;
}

/** Variação do patrimônio líquido em reais. Null sem base. */
export function netWorthChange(current: number, baseline: Comparable | null) {
  return baseline ? current - baseline.netWorth : null;
}
