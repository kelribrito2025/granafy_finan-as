import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { desfazerEnvioDeAlerta, esquecerBancoDeTeste, listarContasAtrasadas, listarDestinatariosDeAlerta, registrarEnvioDeAlerta, usarBancoDeTesteEm } from "./db";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

const ANA = 9_980_001;
const BRUNO = 9_980_002;
const PADARIA_DA_ANA = 9981;
const PADARIA_DO_BRUNO = 9982;
const TABELAS = ["alertDispatches", "transactions", "userPreferences", "companyProfiles", "users"] as const;
const DONOS = [ANA, BRUNO] as const;

describe.runIf(temBancoDeTeste())("alertas no banco", () => {
  let c: Connection;
  beforeAll(async () => { c = await conectarNoBancoDeTeste(); await prepararSchemaDeTeste(c); await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!); }, 60_000);
  afterAll(async () => { await limparTabelas(c, TABELAS, DONOS); await esquecerBancoDeTeste(); await c?.end(); });
  beforeEach(async () => {
    await limparTabelas(c, TABELAS, DONOS);
    for (const [id, nome] of [[ANA, "Ana"], [BRUNO, "Bruno"]] as const) {
      await c.query("INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)", usuarioDeTeste(id, nome));
    }
    await c.query("INSERT INTO companyProfiles (id, userId, legalName) VALUES (?, ?, 'Padaria'), (?, ?, 'Padaria')", [PADARIA_DA_ANA, ANA, PADARIA_DO_BRUNO, BRUNO]);
    const linhas: Array<[number, number, string, string, number, string]> = [
      [ANA, PADARIA_DA_ANA, "saida", "2026-09-10", -150, "Pendente"],   // atrasada
      [ANA, PADARIA_DA_ANA, "saida", "2026-09-16", -20, "Pendente"],    // vence hoje: não é atraso
      [ANA, PADARIA_DA_ANA, "saida", "2026-09-05", -99, "Pago"],        // paga: não conta
      [ANA, PADARIA_DA_ANA, "entrada", "2026-09-01", 500, "Pendente"],  // a receber: não conta
      [ANA, PADARIA_DA_ANA, "transferencia", "2026-09-01", -70, "Pendente"], // transferência: não conta
      [BRUNO, PADARIA_DO_BRUNO, "saida", "2026-09-10", -150, "Pendente"], // do Bruno: idêntica, não vaza
    ];
    for (const [u, e, tipo, data, valor, status] of linhas) {
      await c.query(
        `INSERT INTO transactions (userId, companyId, type, transactionDate, description, category, account, amount, status)
           VALUES (?, ?, ?, ?, 'Conta', 'Categoria', 'Banco', ?, ?)`,
        [u, e, tipo, data, valor, status],
      );
    }
  });

  it("lista só as saídas pendentes vencidas da empresa pedida — e nada da Padaria idêntica do Bruno", async () => {
    const atrasadas = await listarContasAtrasadas({ userId: ANA, companyId: PADARIA_DA_ANA }, "2026-09-16");
    expect(atrasadas.map(l => [l.transactionDate, Number(l.amount)])).toEqual([["2026-09-10", -150]]);
  });

  it("o carimbo do dia entra uma vez só, e volta quando desfeito", async () => {
    const carimbo = { companyId: PADARIA_DA_ANA, kind: "contas_atrasadas" as const, sentOn: "2026-09-16" };
    expect(await registrarEnvioDeAlerta(ANA, carimbo)).toBe(true);
    expect(await registrarEnvioDeAlerta(ANA, carimbo)).toBe(false);
    // Outro dia, outra empresa, outra pessoa: cada um tem o seu.
    expect(await registrarEnvioDeAlerta(ANA, { ...carimbo, sentOn: "2026-09-17" })).toBe(true);
    expect(await registrarEnvioDeAlerta(BRUNO, { ...carimbo, companyId: PADARIA_DO_BRUNO })).toBe(true);
    await desfazerEnvioDeAlerta(ANA, carimbo);
    expect(await registrarEnvioDeAlerta(ANA, carimbo)).toBe(true);
  });

  it("quem desligou o alerta sai da lista; quem nunca abriu Preferências fica", async () => {
    await c.query("INSERT INTO userPreferences (userId, alertaContasAtrasadas) VALUES (?, 0)", [BRUNO]);
    const ids = (await listarDestinatariosDeAlerta()).map(d => d.userId);
    expect(ids).toContain(ANA);
    expect(ids).not.toContain(BRUNO);
  });
});
