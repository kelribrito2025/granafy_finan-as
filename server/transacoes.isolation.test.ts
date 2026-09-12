import type { Connection, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  countOpenTitles,
  createTransaction,
  createTransactionSeries,
  createTransferPair,
  deleteTransaction,
  deleteTransactions,
  deleteTransferGroup,
  esquecerBancoDeTeste,
  getAccountBalances,
  getAccountTransactionCounts,
  getOnboardingCounts,
  getRecurrenceGroup,
  getSettledTotals,
  getTransactionById,
  getTransactionsByFingerprints,
  getTransactionsByIds,
  getTransactionStatsByAccount,
  getTransactionStatsByCategory,
  getTransactionStatsByCostCenter,
  getTransferGroup,
  getUncategorizedSummary,
  listAllTransactions,
  listLedgerWindow,
  listRecentTransactions,
  listSettledInMonth,
  listTransactionsBefore,
  listTransactionsByPeriod,
  listUnlinkedTransactions,
  materializeTransactionSeries,
  sumMonthlyTotals,
  sumOpenTitles,
  sumPaidBefore,
  sumPaidTransactions,
  sumTransactionsBefore,
  sumWindowTotals,
  temAlgumLancamento,
  topRevenueCategories,
  updateTransaction,
  updateTransactions,
  updateTransferPair,
  usarBancoDeTesteEm,
} from "./db";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * Os lançamentos em duas dimensões — e aqui a segunda pesa mais que nos
 * cadastros.
 *
 * Cadastro errado aparece numa lista e alguém estranha o nome. Lançamento
 * errado entra numa SOMA: o saldo, o resultado do mês, o total a pagar. Ninguém
 * estranha um número — só descobre semanas depois, conferindo extrato. Por isso
 * quase todo teste deste arquivo compara um número exato em vez de contar
 * linhas: se a guarda de empresa cair, a soma da empresa A passa a incluir a B
 * e o número muda.
 *
 * A regra do arreio dos cadastros vale igual, e é ela que dá sentido à
 * semeadura abaixo:
 *
 *   DUAS CONTAS DIFERENTES PROVAM A GUARDA DE USUÁRIO.
 *   SÓ DUAS EMPRESAS DO MESMO DONO PROVAM A GUARDA DE EMPRESA.
 *
 * A Ana tem os mesmos nove lançamentos em duas empresas, com os valores da
 * segunda multiplicados por cem. Cem, e não dois, de propósito: qualquer
 * vazamento estoura a asserção por ordem de grandeza, e nenhuma soma da empresa
 * A pode coincidir por acaso com uma soma contaminada.
 *
 * O Bruno fica com uma empresa só, para a guarda de usuário não sumir sem
 * ninguém notar.
 */

const ANA = 6_200_001;
const BRUNO = 6_200_002;
const EMPRESA_A = 6201; // da Ana, com linha em companyProfiles
const EMPRESA_B = 6202; // da Ana também — sem linha, pelo único da Fase 5
const EMPRESA_C = 6203; // do Bruno
const EMPRESA_VAZIA = 6204; // da Ana, sem nenhuma linha — o "ainda não lançou nada"

const anaA = { userId: ANA, companyId: EMPRESA_A };
const anaB = { userId: ANA, companyId: EMPRESA_B };
const brunoC = { userId: BRUNO, companyId: EMPRESA_C };

const HOJE = "2026-09-09";
const MES = { de: "2026-09-01", ate: "2026-10-01" };

const TABELAS = ["transactions", "costCenters", "transactionCategories", "financialAccounts", "companyProfiles", "users"] as const;
/** A faixa desta suíte. Nada fora dela é lido nem apagado por este arquivo. */
const DONOS = [ANA, BRUNO] as const;

type Semeado = { conta: number; categoria: number; centro: number };

type LinhaSemeada = {
  tipo: "entrada" | "saida" | "transferencia";
  data: string;
  liquidada: string | null;
  descricao: string;
  valor: string;
  grupo?: string;
  serie?: string;
  indice?: number;
  semCategoria?: boolean;
  impressao?: string;
};

const EMPRESAS = [
  { userId: ANA, companyId: EMPRESA_A, sufixo: "A", fator: 1 },
  { userId: ANA, companyId: EMPRESA_B, sufixo: "B", fator: 100 },
  { userId: BRUNO, companyId: EMPRESA_C, sufixo: "C", fator: 7 },
] as const;

/**
 * Os nove lançamentos de uma empresa, com os valores multiplicados por `fator`.
 *
 * Os nove existem porque as consultas recortam por coisas diferentes — data,
 * status, `settledAt`, tipo, série, categoria nula — e um lançamento só não
 * exercita nenhuma delas. Cada linha aqui existe para um recorte:
 *
 *   1 entrada paga no mês        soma de pago, liquidadas do mês, receita
 *   2 saída pendente no mês      títulos em aberto
 *   3 saída pendente vencida     atraso, e o "antes de" das aberturas
 *   4 entrada paga antes do mês  saldo anterior
 *   5+6 as duas pernas de uma transferência   o que não é receita nem despesa
 *   7+8 duas parcelas de uma série            recorrência
 *   9 entrada paga sem categoria              o aviso de "sem categoria"
 */
function lancamentosDe(sufixo: string, fator: number): LinhaSemeada[] {
  const v = (valor: number) => (valor * fator).toFixed(2);
  return [
    { tipo: "entrada", data: "2026-09-05", liquidada: "2026-09-05", descricao: "Paga no mês", valor: v(100) },
    { tipo: "saida", data: "2026-09-20", liquidada: null, descricao: "Pendente no mês", valor: v(-40) },
    { tipo: "saida", data: "2026-08-10", liquidada: null, descricao: "Pendente vencida", valor: v(-25) },
    { tipo: "entrada", data: "2026-07-01", liquidada: "2026-07-01", descricao: "Paga antes", valor: v(10) },
    { tipo: "transferencia", data: "2026-09-06", liquidada: "2026-09-06", descricao: "Transferência saída", valor: v(-30), grupo: `transf-${sufixo}` },
    { tipo: "transferencia", data: "2026-09-06", liquidada: "2026-09-06", descricao: "Transferência entrada", valor: v(30), grupo: `transf-${sufixo}` },
    { tipo: "saida", data: "2026-09-15", liquidada: null, descricao: "Parcela 1", valor: v(-12), serie: `serie-${sufixo}`, indice: 1 },
    { tipo: "saida", data: "2026-10-15", liquidada: null, descricao: "Parcela 2", valor: v(-12), serie: `serie-${sufixo}`, indice: 2 },
    { tipo: "entrada", data: "2026-09-07", liquidada: "2026-09-07", descricao: "Sem categoria", valor: v(5), semCategoria: true, impressao: `fp-${sufixo}` },
  ];
}

/**
 * `?` repetidos, em bloco.
 *
 * A semeadura é a conta mais cara deste arreio: são 33 linhas em 6 tabelas, e o
 * `beforeEach` a refaz para cada teste. Uma linha por comando custava 147 s por
 * rodada — e a varredura de mutação roda o arquivo inteiro uma vez por guarda.
 * Em bloco, o mesmo dado atravessa a rede em dez idas e voltas.
 */
const marcas = (linhas: number, colunas: number) =>
  Array.from({ length: linhas }, () => `(${Array(colunas).fill("?").join(", ")})`).join(", ");

/** Os ids dos cadastros da empresa A, que as estatísticas por conta devolvem. */
let empresaA: Semeado;

async function semear(c: Connection) {
  for (const [id, nome] of [[ANA, "Ana"], [BRUNO, "Bruno"]] as const) {
    await c.query(
      "INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)",
      usuarioDeTeste(id, nome),
    );
  }
  await c.query(
    `INSERT INTO companyProfiles (id, userId, legalName) VALUES (?, ?, 'Gêmea'), (?, ?, 'Gêmea')`,
    [EMPRESA_A, ANA, EMPRESA_C, BRUNO],
  );

  await c.query(
    `INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, color, initialBalance)
       VALUES ${marcas(EMPRESAS.length, 7)}`,
    EMPRESAS.flatMap(e => [e.userId, e.companyId, `Conta ${e.sufixo}`, "Banco", "corrente", "#12B85C", "0"]),
  );
  await c.query(
    `INSERT INTO transactionCategories (userId, companyId, name, type, isActive) VALUES ${marcas(EMPRESAS.length, 5)}`,
    EMPRESAS.flatMap(e => [e.userId, e.companyId, `Categoria ${e.sufixo}`, "ambos", true]),
  );
  await c.query(
    `INSERT INTO costCenters (userId, companyId, name, isActive) VALUES ${marcas(EMPRESAS.length, 4)}`,
    EMPRESAS.flatMap(e => [e.userId, e.companyId, `Centro ${e.sufixo}`, true]),
  );

  /*
   * Os ids voltam por consulta, e não pelo `insertId` do bloco: o
   * auto_increment do TiDB não promete ids contíguos, e ler o que o banco
   * realmente gravou custa uma ida e volta a menos do que descobrir isso errado.
   */
  const porEmpresa = new Map<number, Semeado>();
  for (const [tabela, campo] of [["financialAccounts", "conta"], ["transactionCategories", "categoria"], ["costCenters", "centro"]] as const) {
    const [linhas] = await c.query<(RowDataPacket & { id: number; companyId: number })[]>(
      `SELECT id, companyId FROM \`${tabela}\` WHERE userId IN (?, ?)`,
      [ANA, BRUNO],
    );
    for (const linha of linhas) {
      const atual = porEmpresa.get(linha.companyId) ?? { conta: 0, categoria: 0, centro: 0 };
      porEmpresa.set(linha.companyId, { ...atual, [campo]: linha.id });
    }
  }
  empresaA = porEmpresa.get(EMPRESA_A)!;

  const valores = EMPRESAS.flatMap(e => {
    const ids = porEmpresa.get(e.companyId)!;
    return lancamentosDe(e.sufixo, e.fator).flatMap(linha => [
      e.userId, e.companyId, linha.tipo, linha.data, linha.liquidada, linha.descricao,
      linha.semCategoria ? `Avulso ${e.sufixo}` : `Categoria ${e.sufixo}`,
      linha.semCategoria ? null : ids.categoria,
      `Centro ${e.sufixo}`, ids.centro,
      linha.valor, `Conta ${e.sufixo}`, ids.conta,
      linha.liquidada ? "Pago" : "Pendente", false,
      linha.grupo ?? null,
      linha.serie ?? null,
      linha.indice ?? null,
      linha.impressao ?? null,
    ]);
  });
  await c.query(
    `INSERT INTO transactions
       (userId, companyId, type, transactionDate, settledAt, description, category, categoryId, costCenter, costCenterId,
        amount, account, accountId, status, recurring, transferGroupId, recurrenceGroupId, recurrenceIndex, fingerprint)
     VALUES ${marcas(EMPRESAS.length * 9, 19)}`,
    valores,
  );
}

/** Os ids da empresa B, que é o que a empresa A nunca pode alcançar. */
async function idsDeB() {
  const linhas = await listAllTransactions(anaB);
  return linhas.map(linha => linha.id);
}

describe.runIf(temBancoDeTeste())("isolamento dos lançamentos entre empresas", () => {
  let c: Connection;

  beforeAll(async () => {
    c = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(c);
    await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!);
  }, 60_000);

  afterAll(async () => {
    await limparTabelas(c, TABELAS, DONOS);
    await esquecerBancoDeTeste();
    await c?.end();
  });

  beforeEach(async () => {
    await limparTabelas(c, TABELAS, DONOS);
    await semear(c);
  });

  // ── leitura: listas ───────────────────────────────────────────────────────

  it("as listas do período, do passado e do total ficam na empresa pedida", async () => {
    const noMes = await listTransactionsByPeriod(anaA, MES.de, MES.ate);
    const antes = await listTransactionsBefore(anaA, MES.de);
    const tudo = await listAllTransactions(anaA);

    expect(noMes).toHaveLength(6);
    expect(antes).toHaveLength(2);
    expect(tudo).toHaveLength(9);
    for (const linha of [...noMes, ...antes, ...tudo]) {
      expect(linha.companyId).toBe(EMPRESA_A);
    }
  });

  it("os recentes e a janela do razão não trazem linha da outra empresa", async () => {
    const recentes = await listRecentTransactions(anaA, HOJE, 5);
    expect(recentes).toHaveLength(5);
    for (const linha of recentes) {
      expect(linha.companyId).toBe(EMPRESA_A);
      expect(linha.transactionDate <= HOJE).toBe(true);
    }

    // Pendente de qualquer data + tudo dentro da janela: 8 das 9 (a de julho fica fora).
    const janela = await listLedgerWindow(anaA, MES.de, MES.ate);
    expect(janela).toHaveLength(8);
    expect(janela.map(linha => linha.amount)).not.toContain("10000.00");
  });

  it("buscar por id a linha da outra empresa do mesmo dono devolve nada", async () => {
    const deB = await idsDeB();
    expect(await getTransactionById(anaA, deB[0]!)).toBeUndefined();
    expect(await getTransactionsByIds(anaA, deB)).toEqual([]);
  });

  it("buscar por impressão digital não atravessa a empresa", async () => {
    /* O caminho da importação: é isto que decide se uma linha é duplicata. */
    const achados = await getTransactionsByFingerprints(anaA, ["fp-A", "fp-B"]);
    expect(achados.map(linha => linha.fingerprint)).toEqual(["fp-A"]);
  });

  // ── leitura: as somas, que é onde o vazamento não aparece ─────────────────

  it("as somas do painel são as da empresa pedida, e não a mistura das duas", async () => {
    expect(await sumTransactionsBefore(anaA, MES.de)).toBe(-15);
    expect(await sumPaidTransactions(anaA)).toBe(115);
    expect(await sumPaidBefore(anaA, MES.de)).toBe(10);
    expect(await sumWindowTotals(anaA, MES.de, MES.ate)).toEqual({ incoming: 105, outgoing: 52 });
  });

  it("os títulos em aberto contam só os da empresa pedida", async () => {
    const abertos = await sumOpenTitles(anaA, MES.de, MES.ate, HOJE);
    expect(abertos.payable).toEqual({ count: 3, amount: 77 });
    expect(abertos.overdue).toEqual({ count: 1, amount: 25 });
    expect(abertos.receivable).toEqual({ count: 0, amount: 0 });

    expect(await countOpenTitles(anaA, HOJE, "2026-09-30")).toEqual({ open: 3, overdue: 1 });
  });

  it("o gráfico mensal e as categorias de receita não somam a outra empresa", async () => {
    const meses = await sumMonthlyTotals(anaA, "2026-07-01", "2026-11-01");
    expect(meses.get("2026-09")).toEqual({ incoming: 105, outgoing: 52 });
    expect(meses.get("2026-07")).toEqual({ incoming: 10, outgoing: 0 });

    const receitas = await topRevenueCategories(anaA, MES.de, MES.ate, 4);
    expect(receitas).toEqual([{ label: "Categoria A", amount: 100 }, { label: "Avulso A", amount: 5 }]);
  });

  it("os saldos e as estatísticas por cadastro ficam na empresa pedida", async () => {
    const saldos = await getAccountBalances(anaA);
    expect([...saldos.entries()]).toEqual([[empresaA.conta, 115]]);

    expect([...(await getTransactionStatsByAccount(anaA)).entries()]).toEqual([[empresaA.conta, { count: 9, total: 115 }]]);
    expect([...(await getTransactionStatsByCategory(anaA)).entries()]).toEqual([[empresaA.categoria, { count: 8, total: 21 }]]);
    expect([...(await getTransactionStatsByCostCenter(anaA)).entries()]).toEqual([[empresaA.centro, { count: 9, total: 26 }]]);

    expect([...(await getAccountTransactionCounts(anaA, MES.de, MES.ate)).entries()]).toEqual([[empresaA.conta, 6]]);
    expect(await getUncategorizedSummary(anaA)).toEqual({ count: 1, amount: 5 });
  });

  it("as liquidadas do mês são as da empresa pedida", async () => {
    const totais = await getSettledTotals(anaA, MES.de, MES.ate);
    expect(totais.received).toBe(105);
    expect(totais.receivedCount).toBe(2);
    expect(totais.paid).toBe(0);

    const linhas = await listSettledInMonth(anaA, MES.de, MES.ate);
    expect(linhas).toHaveLength(2);
  });

  it("o primeiro acesso conta só a empresa pedida", async () => {
    expect(await getOnboardingCounts(anaA)).toEqual({ accountCount: 1, transactionCount: 9 });
  });

  it("\"já lançou alguma coisa?\" responde pela empresa pedida, e não pela vizinha", async () => {
    /*
     * É esta resposta que decide entre a tela de trabalho e a de primeiro
     * acesso. Um "sim" vazado da empresa ao lado esconderia o primeiro acesso
     * de quem ainda não tem nada; um "não" vazado mandaria alguém com razão
     * cheio para a tela de quem nunca começou.
     */
    expect(await temAlgumLancamento(anaA)).toBe(true);
    expect(await temAlgumLancamento(anaB)).toBe(true);

    /* Empresa sem nenhuma linha: não. */
    expect(await temAlgumLancamento({ userId: ANA, companyId: EMPRESA_VAZIA })).toBe(false);

    /* O Bruno perguntando pela empresa da Ana não enxerga os nove dela. */
    expect(await temAlgumLancamento({ userId: BRUNO, companyId: EMPRESA_A })).toBe(false);
    expect(await temAlgumLancamento({ userId: ANA, companyId: EMPRESA_C })).toBe(false);
  });

  // ── defesa em profundidade: a referência cruzada ──────────────────────────

  it("os não conciliados não trazem lançamento de outra empresa apontando para a conta", async () => {
    /*
     * Defesa em profundidade, e esta guarda só é falsificável com a corrupção
     * semeada — mesmo caso das seis dos cadastros.
     *
     * O filtro é `(userId, companyId, accountId)`, e o id da conta é chave
     * global: sozinho ele já exclui a outra empresa. A guarda de empresa só
     * entra em ação se existir um lançamento de uma empresa apontando para a
     * conta de outra. O app não produz esse estado hoje — mas "o app não
     * produz" não é garantia, é a suposição que a Fase 6 pode invalidar quando
     * mover coisa entre empresas virar assunto.
     */
    await c.query(
      `INSERT INTO transactions (userId, companyId, type, transactionDate, description, category, account, amount, status, accountId)
         VALUES (?, ?, 'entrada', '2026-09-08', 'Cruzado', 'Categoria B', 'Conta A', 999, 'Pendente', ?)`,
      [ANA, EMPRESA_B, empresaA.conta],
    );

    const soltos = await listUnlinkedTransactions(anaA, empresaA.conta, MES.de, MES.ate);
    expect(soltos.map(linha => linha.description)).not.toContain("Cruzado");
    expect(soltos).toHaveLength(6);
  });

  // ── escrita: o que não pode alcançar a outra empresa ──────────────────────

  it("editar e apagar a linha da outra empresa do mesmo dono não mexe em nada", async () => {
    const deB = await idsDeB();

    await updateTransaction(anaA, deB[0]!, {
      type: "entrada", transactionDate: "1999-01-01", description: "Sequestrada",
      category: "Sequestrada", amount: "1.00", account: "Sequestrada", status: "Pago", recurring: false,
    });
    await deleteTransaction(anaA, deB[1]!);
    expect(await updateTransactions(anaA, deB, { status: "Pago" })).toBe(0);
    expect(await deleteTransactions(anaA, deB)).toBe(0);

    const depois = await listAllTransactions(anaB);
    expect(depois).toHaveLength(9);
    expect(depois.map(linha => linha.description)).not.toContain("Sequestrada");
    expect(depois.filter(linha => linha.status === "Pendente")).toHaveLength(4);
  });

  it("a transferência da outra empresa não é lida, editada nem apagada", async () => {
    expect(await getTransferGroup(anaA, "transf-B")).toEqual([]);
    expect(await updateTransferPair(
      anaA, "transf-B",
      { type: "transferencia", transactionDate: "1999-01-01", description: "Sequestrada", category: "x", amount: "-1.00", account: "x", status: "Pago", recurring: false },
      { type: "transferencia", transactionDate: "1999-01-01", description: "Sequestrada", category: "x", amount: "1.00", account: "x", status: "Pago", recurring: false },
    )).toBeNull();
    expect(await deleteTransferGroup(anaA, "transf-B")).toBe(0);

    // A da própria empresa continua achando as duas pernas.
    expect(await getTransferGroup(anaA, "transf-A")).toHaveLength(2);
    expect(await listAllTransactions(anaB)).toHaveLength(9);
  });

  it("a série da outra empresa não é lida nem materializada em cima", async () => {
    expect(await getRecurrenceGroup(anaA, "serie-B")).toEqual([]);
    expect(await getRecurrenceGroup(anaA, "serie-A")).toHaveLength(2);

    /*
     * `materializeTransactionSeries` reescreve uma linha existente para virar a
     * primeira parcela. Sem a guarda de empresa, o `UPDATE` acertaria a linha da
     * empresa B — e o erro só apareceria como uma recorrência que ninguém criou.
     */
    const alvoDeB = (await listAllTransactions(anaB)).find(linha => linha.description === "Pendente no mês")!;
    await expect(materializeTransactionSeries(anaA, alvoDeB.id, [
      { type: "saida", transactionDate: "2026-09-20", description: "Sequestrada", category: "x", amount: "-1.00", account: "x", status: "Pendente", recurring: true, recurrenceGroupId: "serie-invasora", recurrenceIndex: 1 },
    ])).rejects.toThrow(/already part of a recurrence series/);
    expect((await listAllTransactions(anaB)).find(linha => linha.id === alvoDeB.id)!.description).toBe("Pendente no mês");
  });

  // ── escrita: a linha nasce com a empresa ──────────────────────────────────

  it("tudo que é criado nasce com o companyId do escopo", async () => {
    const avulso = await createTransaction(anaA, {
      type: "entrada", transactionDate: "2026-09-09", description: "Nova", category: "Categoria A",
      amount: "1.00", account: "Conta A", status: "Pago", recurring: false,
    });
    expect(avulso!.companyId).toBe(EMPRESA_A);

    const par = await createTransferPair(
      anaA,
      { type: "transferencia", transactionDate: "2026-09-09", description: "Ida", category: "x", amount: "-2.00", account: "Conta A", status: "Pago", recurring: false, transferGroupId: "novo-par" },
      { type: "transferencia", transactionDate: "2026-09-09", description: "Volta", category: "x", amount: "2.00", account: "Conta A", status: "Pago", recurring: false, transferGroupId: "novo-par" },
    );
    expect(par.map(linha => linha.companyId)).toEqual([EMPRESA_A, EMPRESA_A]);

    const serie = await createTransactionSeries(anaA, [
      { type: "saida", transactionDate: "2026-11-01", description: "P1", category: "x", amount: "-3.00", account: "Conta A", status: "Pendente", recurring: true, recurrenceGroupId: "nova-serie", recurrenceIndex: 1 },
      { type: "saida", transactionDate: "2026-12-01", description: "P2", category: "x", amount: "-3.00", account: "Conta A", status: "Pendente", recurring: true, recurrenceGroupId: "nova-serie", recurrenceIndex: 2 },
    ]);
    expect(serie.map(linha => linha.companyId)).toEqual([EMPRESA_A, EMPRESA_A]);
  });

  // ── a dimensão de sempre: donos diferentes ────────────────────────────────

  it("nada do Bruno aparece para a Ana, e o escopo cruzado não devolve nada", async () => {
    expect(await listAllTransactions(brunoC)).toHaveLength(9);
    expect(await sumPaidTransactions(brunoC)).toBe(115 * 7);

    /* Empresa do Bruno com o userId da Ana: prova que a guarda de dono continua de pé. */
    const cruzado = { userId: ANA, companyId: EMPRESA_C };
    expect(await listAllTransactions(cruzado)).toEqual([]);
    expect(await sumPaidTransactions(cruzado)).toBe(0);
    expect(await getOnboardingCounts(cruzado)).toEqual({ accountCount: 0, transactionCount: 0 });
  });
});
