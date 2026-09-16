import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { empresaDoAnexo, esquecerBancoDeTeste, usarBancoDeTesteEm } from "./db";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * `empresaDoAnexo` no banco: a chave leva à linha, a linha diz a empresa.
 */
const ANA = 9_960_001;
const PADARIA = 9961;
const CONSULTORIA = 9962;
const CHAVE = `lancamentos/${ANA}/1700000000_nota-9960001.pdf`;
const CHAVE_DO_BEM = `bens/${ANA}/1700000001_escritura-9960001.pdf`;

describe.runIf(temBancoDeTeste())("empresaDoAnexo", () => {
  let c: Connection;
  beforeAll(async () => { c = await conectarNoBancoDeTeste(); await prepararSchemaDeTeste(c); await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!); }, 60_000);
  afterAll(async () => { await limparTabelas(c, ["patrimonialItems", "transactions", "companyProfiles", "users"] as const, [ANA]); await esquecerBancoDeTeste(); await c?.end(); });

  beforeEach(async () => {
    await limparTabelas(c, ["patrimonialItems", "transactions", "companyProfiles", "users"] as const, [ANA]);
    await c.query("INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)", usuarioDeTeste(ANA, "Ana"));
    await c.query("INSERT INTO companyProfiles (id, userId, legalName) VALUES (?, ?, 'Padaria'), (?, ?, 'Consultoria')", [PADARIA, ANA, CONSULTORIA, ANA]);
    await c.query(
      `INSERT INTO transactions (userId, companyId, type, transactionDate, description, category, account, amount, status, attachmentKey, attachmentName)
         VALUES (?, ?, 'saida', '2026-09-10', 'Nota', 'Categoria', 'Conta', -10, 'Pago', ?, 'nota.pdf')`,
      [ANA, CONSULTORIA, CHAVE],
    );
    await c.query(
      `INSERT INTO patrimonialItems (userId, companyId, name, itemType, balanceGroup, acquisitionDate, acquisitionValue, currentValue, attachmentKey, attachmentName)
         VALUES (?, ?, 'Sala', 'bem', 'ativo_nao_circulante', '2026-01-01', '1000.00', '1000.00', ?, 'escritura.pdf')`,
      [ANA, PADARIA, CHAVE_DO_BEM],
    );
  });

  it("acha a empresa pela linha do lançamento — e é a da LINHA, não a do prefixo", async () => {
    // A chave tem o id da Ana, que é dona das duas; a linha diz Consultoria.
    expect(await empresaDoAnexo(CHAVE)).toBe(CONSULTORIA);
  });

  it("acha a empresa pela linha do bem", async () => {
    expect(await empresaDoAnexo(CHAVE_DO_BEM)).toBe(PADARIA);
  });

  it("chave que nenhuma linha aponta é null", async () => {
    expect(await empresaDoAnexo(`lancamentos/${ANA}/inexistente.pdf`)).toBeNull();
  });
});
