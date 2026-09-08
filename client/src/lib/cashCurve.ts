export type CashCurve = {
  width: number;
  height: number;
  linePoints: string;
  areaPoints: string;
  lastPoint: { x: number; y: number };
};

/**
 * Converte os saldos líquidos de cada período em uma curva acumulada.
 * Retorna null quando não há movimentação, preservando o estado vazio honesto.
 */
export function buildCashCurve(
  periodBalances: number[],
  width = 380,
  height = 80,
  paddingTop = 8,
  paddingBottom = 8,
): CashCurve | null {
  const values = periodBalances.map(value => (Number.isFinite(value) ? value : 0));
  if (values.length === 0 || values.every(value => value === 0)) return null;

  let running = 0;
  const balances = values.map(value => {
    running += value;
    return running;
  });

  const minimum = Math.min(...balances);
  const maximum = Math.max(...balances);
  const drawableHeight = Math.max(1, height - paddingTop - paddingBottom);
  const range = maximum - minimum;
  const round = (value: number) => Math.round(value * 100) / 100;
  const yFor = (value: number) => range === 0
    ? paddingTop + drawableHeight / 2
    : paddingTop + ((maximum - value) / range) * drawableHeight;

  const points = balances.length === 1
    ? [{ x: 0, y: round(yFor(balances[0])) }, { x: width, y: round(yFor(balances[0])) }]
    : balances.map((value, index) => ({
        x: round(index * (width / (balances.length - 1))),
        y: round(yFor(value)),
      }));

  const linePoints = points.map(point => `${point.x},${point.y}`).join(" ");
  const areaPoints = `${linePoints} ${width},${height} 0,${height}`;

  return {
    width,
    height,
    linePoints,
    areaPoints,
    lastPoint: points[points.length - 1],
  };
}
