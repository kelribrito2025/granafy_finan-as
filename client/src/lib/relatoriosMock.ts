/*
 * Dados de amostra dos Relatórios — só para ver a tela.
 *
 * São os mesmos números dos protótipos aprovados. Quando o back entrar, este
 * arquivo sai e as três telas passam a ler do tRPC; a forma dos objetos aqui é
 * a forma que o servidor vai devolver, para a troca ser só a fonte.
 */

export type MesDoRelatorio = {
  /** "2026-04" */
  chave: string;
  rotulo: string;
  rotuloCurto: string;
  entradas: number;
  saidas: number;
};

export const MESES_MOCK: MesDoRelatorio[] = [
  { chave: "2026-04", rotulo: "Abril de 2026", rotuloCurto: "Abr", entradas: 96_400, saidas: 82_500 },
  { chave: "2026-05", rotulo: "Maio de 2026", rotuloCurto: "Mai", entradas: 104_200, saidas: 95_400 },
  { chave: "2026-06", rotulo: "Junho de 2026", rotuloCurto: "Jun", entradas: 112_800, saidas: 88_100 },
  { chave: "2026-07", rotulo: "Julho de 2026", rotuloCurto: "Jul", entradas: 108_600, saidas: 101_300 },
  { chave: "2026-08", rotulo: "Agosto de 2026", rotuloCurto: "Ago", entradas: 126_900, saidas: 94_700 },
  { chave: "2026-09", rotulo: "Setembro de 2026", rotuloCurto: "Set", entradas: 134_300, saidas: 92_900 },
];

export const SALDO_INICIAL_MOCK = 108_040;
export const PERIODO_MOCK = { de: "abril", ate: "setembro de 2026", inicio: "01/04/2026", fim: "30/09/2026" };

export type ContaDoRelatorio = {
  id: number;
  nome: string;
  detalhe: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  /** Seis pontos, um por mês, para a linha pequena do cartão. */
  curva: number[];
};

export const CONTAS_MOCK: ContaDoRelatorio[] = [
  { id: 1, nome: "Banco do Brasil", detalhe: "Conta corrente 4471-2", saldoInicial: 54_120, entradas: 62_480, saidas: 41_930, curva: [54, 58, 62, 60, 68, 75] },
  { id: 2, nome: "Itaú", detalhe: "Conta corrente 0092-8", saldoInicial: 28_740, entradas: 38_210, saidas: 36_480, curva: [29, 27, 31, 26, 29, 30] },
  { id: 3, nome: "Nubank PJ", detalhe: "Conta corrente 7788-1", saldoInicial: 17_960, entradas: 24_660, saidas: 28_140, curva: [18, 17, 16, 15, 15, 14] },
  { id: 4, nome: "Caixa", detalhe: "Aplicação CDB", saldoInicial: 8_400, entradas: 9_000, saidas: 8_590, curva: [8.4, 8.5, 8.6, 8.5, 8.7, 8.8] },
];

export function totais(meses: readonly MesDoRelatorio[]) {
  const entradas = meses.reduce((s, m) => s + m.entradas, 0);
  const saidas = meses.reduce((s, m) => s + m.saidas, 0);
  const resultado = entradas - saidas;
  return { entradas, saidas, resultado, margem: entradas > 0 ? (resultado / entradas) * 100 : 0 };
}

/** O saldo ao fim de cada mês, partindo do saldo inicial. */
export function curvaDoSaldo(meses: readonly MesDoRelatorio[], saldoInicial: number) {
  let saldo = saldoInicial;
  return meses.map(m => {
    const inicial = saldo;
    saldo = saldo + m.entradas - m.saidas;
    return { ...m, saldoInicial: inicial, saldoFinal: saldo };
  });
}
