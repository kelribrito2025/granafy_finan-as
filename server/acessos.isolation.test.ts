import type { Connection, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  aceitarConvite,
  ConviteDeOutroEmail,
  ConviteInvalido,
  convitePorToken,
  criarConvite,
  EmpresaNaoEDoAtor,
  empresasVisiveisPara,
  esquecerBancoDeTeste,
  listarAcessos,
  listarConvitesPendentes,
  revogarAcesso,
  revogarConvite,
  usarBancoDeTesteEm,
} from "./db";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * O convite e o vínculo no banco de verdade — Fase C.
 *
 * Duas donas com empresas IDÊNTICAS de nome, uma contadora sem empresa. Se a
 * posse vazar em qualquer função, a Padaria do Bruno aparece onde só a da Ana
 * deveria — e o resultado dobra em vez de mudar de cara.
 *
 * Cada função de `db.ts` que recebe `atorId` e toca convite ou vínculo está
 * na lista fechada do `guardas.test.ts`; este arquivo é a prova de que a
 * posse que a lista promete existe mesmo.
 */

const ANA = 9_900_001;
const BRUNO = 9_900_002;
const CLARA = 9_900_003;
const EMAIL_DA_CLARA = "clara-9900003@example.com";

const PADARIA_DA_ANA = 9901;
const CONSULTORIA_DA_ANA = 9902;
const PADARIA_DO_BRUNO = 9903;

const TABELAS = ["companyAccess", "companyProfiles", "users"] as const;
const DONOS = [ANA, BRUNO, CLARA] as const;

const HASH = (n: number) => n.toString(16).padStart(64, "0");
const DAQUI_A_7_DIAS = () => new Date(Date.now() + 7 * 24 * 3600 * 1000);

describe.runIf(temBancoDeTeste())("acessos: convites e vínculos", () => {
  let c: Connection;

  const convite = (dono: number, companyIds: number[], n = 1, email = EMAIL_DA_CLARA) =>
    criarConvite(dono, { email, companyIds, lote: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, tokenHash: HASH(n), expiresAt: DAQUI_A_7_DIAS() });

  const linhasDeConvite = async (where = "1=1") => {
    const [linhas] = await c.query<RowDataPacket[]>(`SELECT * FROM companyInvites WHERE invitedBy IN (?) AND ${where} ORDER BY id`, [DONOS]);
    return linhas;
  };

  beforeAll(async () => {
    c = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(c);
    await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!);
  }, 60_000);

  afterAll(async () => {
    await c.query("DELETE FROM companyInvites WHERE invitedBy IN (?)", [DONOS]);
    await limparTabelas(c, TABELAS, DONOS);
    await esquecerBancoDeTeste();
    await c?.end();
  });

  beforeEach(async () => {
    await c.query("DELETE FROM companyInvites WHERE invitedBy IN (?)", [DONOS]);
    await limparTabelas(c, TABELAS, DONOS);
    for (const [id, nome] of [[ANA, "Ana"], [BRUNO, "Bruno"], [CLARA, "Clara"]] as const) {
      const valores = usuarioDeTeste(id, nome) as unknown[];
      if (id === CLARA) valores[2] = EMAIL_DA_CLARA;
      await c.query("INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)", valores);
    }
    await c.query(
      `INSERT INTO companyProfiles (id, userId, legalName, sortOrder) VALUES (?, ?, 'Padaria', 0), (?, ?, 'Consultoria', 1), (?, ?, 'Padaria', 0)`,
      [PADARIA_DA_ANA, ANA, CONSULTORIA_DA_ANA, ANA, PADARIA_DO_BRUNO, BRUNO],
    );
  });

  describe("criarConvite", () => {
    it("grava uma linha por empresa, no mesmo lote", async () => {
      await convite(ANA, [PADARIA_DA_ANA, CONSULTORIA_DA_ANA]);
      const linhas = await linhasDeConvite();
      expect(linhas.map(l => l.companyId)).toEqual([PADARIA_DA_ANA, CONSULTORIA_DA_ANA]);
      expect(new Set(linhas.map(l => l.lote)).size).toBe(1);
      expect(linhas.every(l => l.email === EMAIL_DA_CLARA && l.invitedBy === ANA)).toBe(true);
    });

    it("recusa a empresa do Bruno no convite da Ana — e não grava NADA, nem a dela", async () => {
      await expect(convite(ANA, [PADARIA_DA_ANA, PADARIA_DO_BRUNO])).rejects.toBeInstanceOf(EmpresaNaoEDoAtor);
      expect(await linhasDeConvite()).toEqual([]);
    });

    it("reenviar revoga o convite anterior para o mesmo e-mail e cria o novo", async () => {
      await convite(ANA, [PADARIA_DA_ANA], 1);
      await convite(ANA, [PADARIA_DA_ANA, CONSULTORIA_DA_ANA], 2);
      const vivas = await linhasDeConvite("revokedAt IS NULL");
      expect(vivas.map(l => l.tokenHash)).toEqual([HASH(2), HASH(2)]);
      expect((await linhasDeConvite("revokedAt IS NOT NULL")).map(l => l.tokenHash)).toEqual([HASH(1)]);
    });

    it("o reenvio do Bruno não toca o convite da Ana para a mesma pessoa", async () => {
      await convite(ANA, [PADARIA_DA_ANA], 1);
      await convite(BRUNO, [PADARIA_DO_BRUNO], 2);
      expect((await linhasDeConvite("revokedAt IS NULL")).length).toBe(2);
    });
  });

  describe("listarConvitesPendentes e revogarConvite", () => {
    it("cada dono vê só os seus", async () => {
      await convite(ANA, [PADARIA_DA_ANA], 1);
      await convite(BRUNO, [PADARIA_DO_BRUNO], 2);
      expect((await listarConvitesPendentes(ANA)).map(l => l.companyId)).toEqual([PADARIA_DA_ANA]);
      expect((await listarConvitesPendentes(BRUNO)).map(l => l.companyId)).toEqual([PADARIA_DO_BRUNO]);
      expect(await listarConvitesPendentes(CLARA)).toEqual([]);
    });

    it("vencido, aceito ou revogado sai da lista", async () => {
      await convite(ANA, [PADARIA_DA_ANA], 1);
      await c.query("UPDATE companyInvites SET expiresAt = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE tokenHash = ?", [HASH(1)]);
      expect(await listarConvitesPendentes(ANA)).toEqual([]);
    });

    it("o Bruno não cancela o lote da Ana", async () => {
      await convite(ANA, [PADARIA_DA_ANA], 1);
      const [lote] = (await listarConvitesPendentes(ANA)).map(l => l.lote);
      await revogarConvite(BRUNO, lote!);
      expect((await listarConvitesPendentes(ANA)).length).toBe(1);
      await revogarConvite(ANA, lote!);
      expect(await listarConvitesPendentes(ANA)).toEqual([]);
    });
  });

  describe("aceitarConvite", () => {
    it("grava um vínculo por empresa, carimba o aceite, e a Clara passa a ver as duas", async () => {
      await convite(ANA, [PADARIA_DA_ANA, CONSULTORIA_DA_ANA], 1);
      const aceite = await aceitarConvite(CLARA, { tokenHash: HASH(1), email: EMAIL_DA_CLARA });
      expect(aceite.companyIds.sort()).toEqual([PADARIA_DA_ANA, CONSULTORIA_DA_ANA].sort());

      const [vinculos] = await c.query<RowDataPacket[]>("SELECT companyId, grantedBy, role FROM companyAccess WHERE userId = ? ORDER BY companyId", [CLARA]);
      expect(vinculos.map(v => [v.companyId, v.grantedBy, v.role])).toEqual([[PADARIA_DA_ANA, ANA, "contador"], [CONSULTORIA_DA_ANA, ANA, "contador"]]);
      expect((await linhasDeConvite("acceptedAt IS NULL")).length).toBe(0);
      // O efeito que importa: a lista visível dela, que alimenta ctx.companies.
      expect((await empresasVisiveisPara(CLARA)).map(e => e.id).sort()).toEqual([PADARIA_DA_ANA, CONSULTORIA_DA_ANA].sort());
    });

    it("recusa quando o e-mail de quem aceita não é o convidado — e não grava vínculo", async () => {
      await convite(ANA, [PADARIA_DA_ANA], 1);
      await expect(aceitarConvite(BRUNO, { tokenHash: HASH(1), email: "bruno-9900002@example.com" })).rejects.toBeInstanceOf(ConviteDeOutroEmail);
      expect(await empresasVisiveisPara(BRUNO)).toHaveLength(1);
      expect((await linhasDeConvite("acceptedAt IS NULL")).length).toBe(1);
    });

    it("o segundo aceite do mesmo token é recusado — uso único", async () => {
      await convite(ANA, [PADARIA_DA_ANA], 1);
      await aceitarConvite(CLARA, { tokenHash: HASH(1), email: EMAIL_DA_CLARA });
      await expect(aceitarConvite(CLARA, { tokenHash: HASH(1), email: EMAIL_DA_CLARA })).rejects.toBeInstanceOf(ConviteInvalido);
      const [vinculos] = await c.query<RowDataPacket[]>("SELECT id FROM companyAccess WHERE userId = ?", [CLARA]);
      expect(vinculos).toHaveLength(1);
    });

    it("token inexistente, vencido ou revogado: recusa", async () => {
      await expect(aceitarConvite(CLARA, { tokenHash: HASH(99), email: EMAIL_DA_CLARA })).rejects.toBeInstanceOf(ConviteInvalido);
      await convite(ANA, [PADARIA_DA_ANA], 1);
      await c.query("UPDATE companyInvites SET expiresAt = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE tokenHash = ?", [HASH(1)]);
      await expect(aceitarConvite(CLARA, { tokenHash: HASH(1), email: EMAIL_DA_CLARA })).rejects.toBeInstanceOf(ConviteInvalido);
    });

    it("um vínculo vivo que já existia não duplica", async () => {
      await c.query("INSERT INTO companyAccess (userId, companyId, role, grantedBy) VALUES (?, ?, 'contador', ?)", [CLARA, PADARIA_DA_ANA, ANA]);
      await convite(ANA, [PADARIA_DA_ANA, CONSULTORIA_DA_ANA], 1);
      await aceitarConvite(CLARA, { tokenHash: HASH(1), email: EMAIL_DA_CLARA });
      const [vinculos] = await c.query<RowDataPacket[]>("SELECT companyId FROM companyAccess WHERE userId = ? AND revokedAt IS NULL ORDER BY companyId", [CLARA]);
      expect(vinculos.map(v => v.companyId)).toEqual([PADARIA_DA_ANA, CONSULTORIA_DA_ANA]);
    });

    it("convitePorToken traz nome da empresa e de quem convidou, em qualquer estado", async () => {
      await convite(ANA, [PADARIA_DA_ANA], 1);
      const linhas = await convitePorToken(HASH(1));
      expect(linhas).toHaveLength(1);
      expect(linhas[0]!.legalName).toBe("Padaria");
      expect(linhas[0]!.nomeDoDono).toBe("Ana");
      expect(await convitePorToken(HASH(42))).toEqual([]);
    });
  });

  describe("listarAcessos e revogarAcesso", () => {
    beforeEach(async () => {
      await c.query(
        "INSERT INTO companyAccess (userId, companyId, role, grantedBy) VALUES (?, ?, 'contador', ?), (?, ?, 'contador', ?), (?, ?, 'contador', ?)",
        [CLARA, PADARIA_DA_ANA, ANA, CLARA, CONSULTORIA_DA_ANA, ANA, CLARA, PADARIA_DO_BRUNO, BRUNO],
      );
    });

    it("a Ana vê a Clara nas duas dela; o Bruno vê a Clara só na dele — Padarias idênticas não se misturam", async () => {
      expect((await listarAcessos(ANA)).map(a => a.companyId).sort()).toEqual([PADARIA_DA_ANA, CONSULTORIA_DA_ANA].sort());
      expect((await listarAcessos(BRUNO)).map(a => a.companyId)).toEqual([PADARIA_DO_BRUNO]);
      expect(await listarAcessos(CLARA)).toEqual([]);
    });

    it("a Ana revoga a Clara numa empresa só, e a outra fica", async () => {
      await revogarAcesso(ANA, { contadorId: CLARA, companyId: PADARIA_DA_ANA });
      expect((await listarAcessos(ANA)).map(a => a.companyId)).toEqual([CONSULTORIA_DA_ANA]);
      expect((await empresasVisiveisPara(CLARA)).map(e => e.id).sort()).toEqual([CONSULTORIA_DA_ANA, PADARIA_DO_BRUNO].sort());
    });

    it("o Bruno não revoga o vínculo da Clara na empresa da Ana", async () => {
      await expect(revogarAcesso(BRUNO, { contadorId: CLARA, companyId: PADARIA_DA_ANA })).rejects.toBeInstanceOf(EmpresaNaoEDoAtor);
      expect((await listarAcessos(ANA))).toHaveLength(2);
    });
  });
});
