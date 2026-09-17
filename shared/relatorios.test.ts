import { describe, expect, it } from "vitest";
import {
  categoriasDoRelatorio,
  centrosDoRelatorio,
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

describe("relatórios por dimensão", () => {
  const meses = mesesDaJanela("6m", { year: 2026, month: 9 });

  it("categorias juntam por id, caem no nome sem id, e o vazio vira Outras", () => {
    const categorias = categoriasDoRelatorio([
      { id: 7, nome: "Mensalidades", mes: "2026-04", entradas: 1000, saidas: 0, lancamentos: 2 },
      { id: 7, nome: "Mensalidades (renomeada)", mes: "2026-05", entradas: 500, saidas: 0, lancamentos: 1 },
      { id: null, nome: "Folha", mes: "2026-04", entradas: 0, saidas: 900, lancamentos: 3 },
      { id: null, nome: "folha ", mes: "2026-06", entradas: 0, saidas: 100, lancamentos: 1 },
      { id: null, nome: "", mes: "2026-06", entradas: 0, saidas: 40, lancamentos: 1 },
      { id: 9, nome: "Parada", mes: "2026-06", entradas: 0, saidas: 0, lancamentos: 0 },
    ]);
    expect(categorias.map(c => [c.nome, c.entradas, c.saidas, c.lancamentos])).toEqual([
      ["Mensalidades", 1500, 0, 3],
      ["Folha", 0, 1000, 4],
      ["Outras", 0, 40, 1],
    ]);
  });

  it("centros de custo: cadastrados ativos entram mesmo parados, inativos só com movimento, sem centro fica de fora", () => {
    const centros = centrosDoRelatorio(
      meses,
      [
        { id: 1, nome: "Operação", mes: "2026-04", entradas: 1000, saidas: 400, lancamentos: 2 },
        { id: 1, nome: "Operação", mes: "2026-05", entradas: 0, saidas: 100, lancamentos: 1 },
        { id: null, nome: "Importado", mes: "2026-09", entradas: 0, saidas: 50, lancamentos: 1 },
        { id: 3, nome: "Antigo", mes: "2026-09", entradas: 10, saidas: 0, lancamentos: 1 },
        { id: null, nome: "", mes: "2026-09", entradas: 0, saidas: 9999, lancamentos: 9 },
      ],
      [{ id: 1, nome: "Operação", total: 250 }, { id: null, nome: "", total: 777 }],
      [
        { id: 1, name: "Operação", color: "#4C6355", isActive: true },
        { id: 2, name: "Parado", color: "#123456", isActive: true },
        { id: 3, name: "Antigo", color: "#4C6355", isActive: false },
        { id: 4, name: "Inativo sem nada", color: "#4C6355", isActive: false },
      ],
    );
    expect(centros.map(c => c.nome)).toEqual(["Operação", "Importado", "Parado", "Antigo"]);
    const [operacao, importado, parado] = centros;
    expect(operacao).toMatchObject({ saldoInicial: 250, entradas: 1000, saidas: 500, lancamentos: 3, cor: "#12B85C" });
    expect(operacao!.saidasPorMes).toEqual([400, 100, 0, 0, 0, 0]);
    expect(operacao!.curva).toEqual([850, 750, 750, 750, 750, 750]);
    expect(importado).toMatchObject({ saldoInicial: 0, saidas: 50, cor: "#0A7A42" });
    expect(parado).toMatchObject({ saldoInicial: 0, entradas: 0, saidas: 0, cor: "#123456" });
  });
});
