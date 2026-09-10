import type { Connection, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPatrimonialItem,
  deleteBalanceSheetSnapshot,
  deletePatrimonialItem,
  esquecerBancoDeTeste,
  getPatrimonialItem,
  getPatrimonialItemByName,
  listBalanceSheetSnapshots,
  listPatrimonialItems,
  updatePatrimonialItem,
  upsertBalanceSheetSnapshot,
  usarBancoDeTesteEm,
} from "./db";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * O patrimônio em duas dimensões.
 *
 * É a menor das cinco sub-levas em número de guardas e a mais direta em
 * consequência: um bem que aparece na empresa errada entra no ativo dela, e o
 * ativo é metade do balanço. O fechamento é pior ainda — é a foto do mês, e uma
 * foto trocada não se percebe olhando, só comparando com a anterior.
 *
 * Mesma regra dos outros arreios:
 *
 *   DUAS CONTAS DIFERENTES PROVAM A GUARDA DE USUÁRIO.
 *   SÓ DUAS EMPRESAS DO MESMO DONO PROVAM A GUARDA DE EMPRESA.
 *
 * A semeadura tem uma peculiaridade que NÃO é escolha minha, e vale explicar
 * porque ela é o achado desta leva: os nomes dos bens e as datas dos
 * fechamentos precisam ser diferentes entre as duas empresas da Ana. Não por
 * desenho do teste — por imposição de dois índices únicos que não incluem
 * `companyId`. Veja o último teste deste arquivo.
 */

const ANA = 6_400_001;
const BRUNO = 6_400_002;
const EMPRESA_A = 6401; // da Ana, com linha em companyProfiles
const EMPRESA_B = 6402; // da Ana também — sem linha, pelo único da Fase 5
const EMPRESA_C = 6403; // do Bruno

const anaA = { userId: ANA, companyId: EMPRESA_A };
const anaB = { userId: ANA, companyId: EMPRESA_B };
const brunoC = { userId: BRUNO, companyId: EMPRESA_C };

const TABELAS = ["balanceSheetSnapshots", "patrimonialItems", "companyProfiles", "users"] as const;
/** A faixa desta suíte. Nada fora dela é lido nem apagado por este arquivo. */
const DONOS = [ANA, BRUNO] as const;

const EMPRESAS = [
  { userId: ANA, companyId: EMPRESA_A, sufixo: "A", fator: 1, fechamento: "2026-09-30" },
  { userId: ANA, companyId: EMPRESA_B, sufixo: "B", fator: 100, fechamento: "2026-08-31" },
  { userId: BRUNO, companyId: EMPRESA_C, sufixo: "C", fator: 7, fechamento: "2026-09-30" },
] as const;

type Semeado = { bem: number; fechamento: number };
let porEmpresa: Map<number, Semeado>;
const empresaA = () => porEmpresa.get(EMPRESA_A)!;
const empresaB = () => porEmpresa.get(EMPRESA_B)!;

const marcas = (linhas: number, colunas: number) =>
  Array.from({ length: linhas }, () => `(${Array(colunas).fill("?").join(", ")})`).join(", ");

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

  const v = (valor: number, fator: number) => (valor * fator).toFixed(2);

  await c.query(
    `INSERT INTO patrimonialItems (userId, companyId, name, itemType, balanceGroup, acquisitionDate, acquisitionValue, currentValue, isActive)
       VALUES ${marcas(EMPRESAS.length, 9)}`,
    EMPRESAS.flatMap(e => [
      e.userId, e.companyId, `Bem ${e.sufixo}`, "bem", "ativo_nao_circulante",
      "2026-01-15", v(1000, e.fator), v(900, e.fator), true,
    ]),
  );
  await c.query(
    `INSERT INTO balanceSheetSnapshots (userId, companyId, referenceDate, totalAssets, netWorth, itemCount)
       VALUES ${marcas(EMPRESAS.length, 6)}`,
    EMPRESAS.flatMap(e => [e.userId, e.companyId, e.fechamento, v(5000, e.fator), v(5000, e.fator), 1]),
  );

  porEmpresa = new Map(EMPRESAS.map(e => [e.companyId, { bem: 0, fechamento: 0 }]));
  for (const [tabela, campo] of [["patrimonialItems", "bem"], ["balanceSheetSnapshots", "fechamento"]] as const) {
    const [linhas] = await c.query<(RowDataPacket & { id: number; companyId: number })[]>(
      `SELECT id, companyId FROM \`${tabela}\` WHERE userId IN (?, ?)`, [ANA, BRUNO],
    );
    for (const linha of linhas) porEmpresa.get(linha.companyId)![campo] = linha.id;
  }
}

describe.runIf(temBancoDeTeste())("isolamento do patrimônio entre empresas", () => {
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

  // ── leitura ───────────────────────────────────────────────────────────────

  it("listar bens no escopo de uma empresa não traz os da outra do MESMO dono", async () => {
    const daA = await listPatrimonialItems(anaA);
    expect(daA).toHaveLength(1);
    expect(daA[0]!.companyId).toBe(EMPRESA_A);
    expect(daA[0]!.currentValue).toBe("900.00");

    expect((await listPatrimonialItems(anaB))[0]!.currentValue).toBe("90000.00");
  });

  it("buscar bem por id e por nome não atravessa a empresa", async () => {
    expect(await getPatrimonialItem(anaA, empresaB().bem)).toBeUndefined();
    expect((await getPatrimonialItem(anaA, empresaA().bem))!.companyId).toBe(EMPRESA_A);

    /*
     * A busca por nome é o caminho que decide se um bem é "novo" ou "repetido"
     * na tela de patrimônio. Sem a guarda, cadastrar um bem na empresa A com o
     * nome de um bem da B seria recusado como duplicata de algo que a pessoa
     * não vê na tela em que está.
     */
    expect(await getPatrimonialItemByName(anaA, "Bem B")).toBeUndefined();
    expect((await getPatrimonialItemByName(anaA, "Bem A"))!.companyId).toBe(EMPRESA_A);
  });

  it("os fechamentos listados são os da empresa pedida", async () => {
    const daA = await listBalanceSheetSnapshots(anaA);
    expect(daA).toHaveLength(1);
    expect(daA[0]!.referenceDate).toBe("2026-09-30");
    expect(daA[0]!.totalAssets).toBe("5000.00");

    expect((await listBalanceSheetSnapshots(anaB))[0]!.referenceDate).toBe("2026-08-31");
  });

  // ── escrita ───────────────────────────────────────────────────────────────

  it("editar e apagar o bem da outra empresa do mesmo dono não mexe em nada", async () => {
    await updatePatrimonialItem(anaA, empresaB().bem, { currentValue: "1.00", isActive: false });
    await deletePatrimonialItem(anaA, empresaB().bem);

    const daB = await listPatrimonialItems(anaB);
    expect(daB).toHaveLength(1);
    expect(daB[0]!.currentValue).toBe("90000.00");
    expect(daB[0]!.isActive).toBe(true);
  });

  it("apagar o fechamento da outra empresa do mesmo dono não apaga nada", async () => {
    await deleteBalanceSheetSnapshot(anaA, empresaB().fechamento);
    expect(await listBalanceSheetSnapshots(anaB)).toHaveLength(1);
  });

  it("tudo que é criado nasce com o companyId do escopo", async () => {
    const bem = await createPatrimonialItem(anaA, {
      name: "Bem novo", itemType: "bem", balanceGroup: "ativo_nao_circulante",
      acquisitionDate: "2026-02-01", acquisitionValue: "500.00", currentValue: "500.00",
    });
    expect(bem!.companyId).toBe(EMPRESA_A);

    const fechamento = await upsertBalanceSheetSnapshot(anaA, {
      referenceDate: "2026-10-31", totalAssets: "10.00", netWorth: "10.00", itemCount: 1,
    });
    expect(fechamento!.companyId).toBe(EMPRESA_A);
  });

  // ── a dimensão de sempre: donos diferentes ────────────────────────────────

  it("nada do Bruno aparece para a Ana, e o escopo cruzado não devolve nada", async () => {
    const dele = porEmpresa.get(EMPRESA_C)!;
    expect(await getPatrimonialItem(anaA, dele.bem)).toBeUndefined();
    expect(await listPatrimonialItems(brunoC)).toHaveLength(1);

    /* Empresa do Bruno com o userId da Ana: prova que a guarda de dono continua de pé. */
    const cruzado = { userId: ANA, companyId: EMPRESA_C };
    expect(await listPatrimonialItems(cruzado)).toEqual([]);
    expect(await listBalanceSheetSnapshots(cruzado)).toEqual([]);
  });

  // ── o achado da leva ──────────────────────────────────────────────────────

  it("cada empresa fecha o mesmo mês, e a leitura devolve o fechamento certo", async () => {
    /*
     * A terceira guarda que o aperto ressuscitou, e a que cobria o defeito
     * destrutivo: até a Fase 5, `balance_sheet_snapshots_user_date_uidx` era
     * único em (userId, referenceDate), então fechar setembro na segunda
     * empresa REESCREVIA o fechamento da primeira — o `onDuplicateKeyUpdate`
     * batia na mesma chave.
     *
     * Agora cada empresa tem o seu, e é a guarda de empresa dentro do
     * `upsertBalanceSheetSnapshot` que faz a leitura de volta devolver o certo.
     */
    const naA = await upsertBalanceSheetSnapshot(anaA, {
      referenceDate: "2026-11-30", totalAssets: "111.00", netWorth: "111.00", itemCount: 1,
    });
    const naB = await upsertBalanceSheetSnapshot(anaB, {
      referenceDate: "2026-11-30", totalAssets: "222.00", netWorth: "222.00", itemCount: 1,
    });

    expect(naA!.companyId).toBe(EMPRESA_A);
    expect(naA!.totalAssets).toBe("111.00");
    expect(naB!.companyId).toBe(EMPRESA_B);
    expect(naB!.totalAssets).toBe("222.00");

    // E o da A continua lá depois de a B fechar o mesmo mês — que era o defeito.
    const daA = (await listBalanceSheetSnapshots(anaA)).find(f => f.referenceDate === "2026-11-30");
    expect(daA!.totalAssets).toBe("111.00");
  });

  it("os índices do patrimônio incluem a empresa — o aperto da Fase 5", () => {
    /*
     * Este teste nasceu ao contrário: até a Fase 5 ele travava a definição
     * ERRADA, para avisar no dia em que ela mudasse. O dia chegou, e a versão
     * anterior deste arquivo é o registro de por que a migration existiu:
     *
     *   `balance_sheet_snapshots_user_date_uidx` era único em
     *   (userId, referenceDate), e o fechamento é gravado com
     *   `onDuplicateKeyUpdate` nessa chave — então fechar setembro na segunda
     *   empresa APAGAVA o fechamento de setembro da primeira, sem erro nenhum.
     *
     * Agora ele trava a definição certa, e o motivo é o mesmo: ninguém volta a
     * mexer nesses índices sem passar por aqui.
     */
    const unicos = async (tabela: string) => {
      const [linhas] = await c.query<(RowDataPacket & { Key_name: string; Column_name: string; Non_unique: number })[]>(
        `SHOW INDEX FROM \`${tabela}\``,
      );
      const porNome = new Map<string, string[]>();
      for (const linha of linhas.filter(l => Number(l.Non_unique) === 0)) {
        porNome.set(linha.Key_name, [...(porNome.get(linha.Key_name) ?? []), linha.Column_name]);
      }
      return porNome;
    };

    return Promise.all([unicos("patrimonialItems"), unicos("balanceSheetSnapshots")]).then(([bens, fechamentos]) => {
      expect(bens.get("patrimonial_items_company_name_uidx")).toEqual(["userId", "companyId", "name"]);
      expect(bens.has("patrimonial_items_user_name_uidx")).toBe(false);
      expect(fechamentos.get("balance_sheet_snapshots_company_date_uidx")).toEqual(["userId", "companyId", "referenceDate"]);
      expect(fechamentos.has("balance_sheet_snapshots_user_date_uidx")).toBe(false);
    });
  });
});
