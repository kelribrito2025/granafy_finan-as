import { describe, expect, it } from "vitest";
import {
  chaveDoMes,
  contasDoRelatorio,
  curvaDoSaldo,
  diaAnterior,
  fimExclusivoDoMes,
  mesesAnteriores,
  mesesConsolidados,
  mesesDaJanela,
  rotuloDoPeriodo,
  tetoDoEixo,
  totais,
  type LinhaMensal,
} from "./relatorios";

describe("janela dos relatórios", () => {
  it("6 e 12 meses terminam no mês pedido e atravessam o ano", () => {
    const seis = mesesDaJanela("6m", { year: 2026, month: 2 });
    expect(seis.map(chaveDoMes)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(mesesDaJanela("12m", { year: 2026, month: 9 })).toHaveLength(12);
  });

  it("'ano' é o ano civil até o mês pedido, não doze meses corridos", () => {
    expect(mesesDaJanela("ano", { year: 2026, month: 3 }).map(chaveDoMes)).toEqual(["2026-01", "2026-02", "2026-03"]);
  });

  it("a janela anterior tem o mesmo tamanho e termina onde a atual começa", () => {
    const atual = mesesDaJanela("6m", { year: 2026, month: 9 });
    expect(mesesAnteriores(atual).map(chaveDoMes)).toEqual(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
  });

  it("datas de borda: fim exclusivo, véspera e rótulo do período", () => {
    expect(fimExclusivoDoMes({ year: 2026, month: 12 })).toBe("2027-01-01");
    expect(diaAnterior("2026-04-01")).toBe("2026-03-31");
    expect(rotuloDoPeriodo(mesesDaJanela("6m", { year: 2026, month: 9 }))).toEqual({ de: "abril", ate: "setembro de 2026", inicio: "01/04/2026", fim: "30/09/2026" });
    expect(rotuloDoPeriodo(mesesDaJanela("6m", { year: 2026, month: 2 })).de).toBe("setembro de 2025");
  });
});

describe("séries dos relatórios", () => {
  const meses = mesesDaJanela("6m", { year: 2026, month: 9 });
  const linhas: LinhaMensal[] = [
    { accountId: 1, mes: "2026-04", transferencia: false, entradas: 1000, saidas: 400 },
    { accountId: 2, mes: "2026-04", transferencia: false, entradas: 0, saidas: 100 },
    // Transferência de 300 da conta 1 para a 2, em maio: soma nas contas, não no consolidado.
    { accountId: 1, mes: "2026-05", transferencia: true, entradas: 0, saidas: 300 },
    { accountId: 2, mes: "2026-05", transferencia: true, entradas: 300, saidas: 0 },
    // Sem conta: entra no consolidado, não aparece em conta nenhuma.
    { accountId: null, mes: "2026-09", transferencia: false, entradas: 50, saidas: 0 },
    // Fora da janela: ignorada.
    { accountId: 1, mes: "2026-03", transferencia: false, entradas: 9999, saidas: 0 },
  ];

  it("o consolidado ignora transferência e aceita lançamento sem conta", () => {
    const serie = mesesConsolidados(meses, linhas);
    expect(serie.map(m => [m.chave, m.entradas, m.saidas])).toEqual([
      ["2026-04", 1000, 500], ["2026-05", 0, 0], ["2026-06", 0, 0], ["2026-07", 0, 0], ["2026-08", 0, 0], ["2026-09", 50, 0],
    ]);
    expect(serie[0]!.rotulo).toBe("Abril de 2026");
    expect(totais(serie)).toEqual({ entradas: 1050, saidas: 500, resultado: 550, margem: (550 / 1050) * 100 });
  });

  it("por conta a transferência conta, o saldo inicial soma o que veio antes, e a curva é mês a mês", () => {
    const contas = contasDoRelatorio(meses, [
      { id: 1, name: "BB", institution: "Banco do Brasil", accountType: "corrente", isActive: true, initialBalance: 100, pagoAntes: 9999 },
      { id: 2, name: "Nu", institution: "", accountType: "carteira", isActive: true, initialBalance: 0, pagoAntes: 0 },
      { id: 3, name: "Velha", institution: "", accountType: "outro", isActive: false, initialBalance: 5, pagoAntes: 0 },
    ], linhas);
    expect(contas.map(c => c.nome)).toEqual(["BB", "Nu"]);
    const [bb, nu] = contas;
    expect(bb).toMatchObject({ saldoInicial: 10099, entradas: 1000, saidas: 700, detalhe: "Conta corrente · Banco do Brasil" });
    expect(bb!.curva).toEqual([10699, 10399, 10399, 10399, 10399, 10399]);
    expect(nu).toMatchObject({ saldoInicial: 0, entradas: 300, saidas: 100, detalhe: "Carteira" });
    expect(nu!.curva).toEqual([-100, 200, 200, 200, 200, 200]);
  });

  it("a curva do consolidado encadeia saldo final em saldo inicial", () => {
    const curva = curvaDoSaldo(mesesConsolidados(meses, linhas), 1000);
    expect(curva[0]).toMatchObject({ saldoInicial: 1000, saldoFinal: 1500 });
    expect(curva[5]).toMatchObject({ saldoInicial: 1500, saldoFinal: 1550 });
  });

  it("o teto do eixo é o número redondo logo acima do maior valor", () => {
    expect(tetoDoEixo(134_300)).toBe(200_000);
    expect(tetoDoEixo(96_400)).toBe(100_000);
    expect(tetoDoEixo(2_100)).toBe(2_500);
    expect(tetoDoEixo(0)).toBe(1000);
  });
});
