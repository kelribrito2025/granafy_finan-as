import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { esquecerBancoDeTeste, listCompanies, usarBancoDeTesteEm } from "./db";
import {
  conectarNoBancoDeTeste,
  limparTabelas,
  prepararSchemaDeTeste,
  temBancoDeTeste,
} from "./testDatabase";

/*
 * O arreio de duas empresas, na sua primeira aplicação.
 *
 * A ideia toda: semear dois logins com empresas DELIBERADAMENTE IDÊNTICAS —
 * mesma razão social, mesmo CNPJ, mesma ordem. Se o escopo vazar, o resultado
 * dobra em vez de mudar de aparência, e dobrar é trivial de assertar. Foi
 * exatamente assim que a precedência do `OR` foi pega: dois usuários devolvendo
 * números idênticos.
 *
 * A alternativa — semear dados distintos e conferir "veio o meu" — falha em
 * silêncio quando a consulta devolve os dois e o teste só olha o primeiro.
 */

const ANA = 9_000_001;
const BRUNO = 9_000_002;

const TABELAS = ["companyProfiles", "users"] as const;

async function semear(conexao: Connection) {
  for (const [id, nome] of [[ANA, "Ana"], [BRUNO, "Bruno"]] as const) {
    await conexao.query(
      "INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, 'password')",
      [id, `local_${id}`, `${nome.toLowerCase()}@teste.local`, nome],
    );
  }

  /*
   * Idênticas de propósito, inclusive o CNPJ: não existe nenhum campo pelo qual
   * distinguir a empresa da Ana da do Bruno a não ser o dono. É o pior caso
   * para a guarda, e por isso é o caso que interessa.
   */
  const empresas: Array<[number, number, string, number, boolean]> = [
    [1, ANA, "Numero Virtual LTDA", 0, true],
    [2, BRUNO, "Numero Virtual LTDA", 0, true],
  ];
  for (const [id, userId, razao, ordem, ativa] of empresas) {
    await conexao.query(
      "INSERT INTO companyProfiles (id, userId, legalName, taxId, sortOrder, isActive) VALUES (?, ?, ?, '54656656000146', ?, ?)",
      [id, userId, razao, ordem, ativa],
    );
  }
}

describe.runIf(temBancoDeTeste())("isolamento de listCompanies", () => {
  let conexao: Connection;

  beforeAll(async () => {
    conexao = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(conexao);
    await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!);
  }, 60_000);

  afterAll(async () => {
    await esquecerBancoDeTeste();
    await conexao?.end();
  });

  beforeEach(async () => {
    await limparTabelas(conexao, TABELAS);
    await semear(conexao);
  });

  it("devolve só as empresas do dono, mesmo elas sendo idênticas", async () => {
    const daAna = await listCompanies(ANA);
    expect(daAna).toHaveLength(1);
    expect(daAna[0]?.userId).toBe(ANA);

    const doBruno = await listCompanies(BRUNO);
    expect(doBruno).toHaveLength(1);
    expect(doBruno[0]?.userId).toBe(BRUNO);

    // Nenhum id aparece nas duas listas.
    expect(daAna.map(e => e.id)).not.toEqual(doBruno.map(e => e.id));
  });

  it("devolve nada, e não a empresa dos outros, para quem não tem nenhuma", async () => {
    /*
     * O login sem cadastro de empresa é real hoje. Uma guarda ausente aqui não
     * devolveria zero: devolveria a lista inteira do banco.
     */
    await conexao.query("DELETE FROM companyProfiles WHERE userId = ?", [ANA]);
    expect(await listCompanies(ANA)).toEqual([]);
  });

  it("não esconde a empresa arquivada do próprio dono", async () => {
    /*
     * `listCompanies` não filtra por `isActive` de propósito: arquivada desce
     * na lista, não some. Quem arquivou precisa achá-la para reativar, e uma
     * lista que esconde o que existe faz a pessoa duvidar do que apagou.
     */
    await conexao.query("UPDATE companyProfiles SET isActive = false WHERE userId = ?", [ANA]);
    const daAna = await listCompanies(ANA);
    expect(daAna).toHaveLength(1);
    expect(daAna[0]?.isActive).toBe(false);
  });

  /*
   * FICA PARA A FASE 5 — a ordem da lista com várias empresas.
   *
   * A tentativa está registrada porque a lição vale: escrevi o teste semeando
   * duas empresas para a Ana e ele quebrou em "Duplicate entry for key
   * company_profiles_user_uidx". O único por `userId` continua de pé, e ele não
   * distingue INSERT vindo do app de INSERT vindo do teste — o mundo de duas
   * empresas por login simplesmente não existe ainda, nem para semear.
   *
   * Forjar o futuro no schema de teste — derrubar o único só aqui — passaria,
   * e seria pior: o arreio deixaria de exercitar o banco que existe, que é o
   * motivo inteiro de ele falar com um TiDB de verdade. O `orderBy` de
   * `listCompanies` fica escrito e sem prova até a Fase 5 derrubar o único de
   * verdade; a mesma regra, em memória, já está coberta por `sortCompanies`.
   */
});

describe.skipIf(temBancoDeTeste())("isolamento de listCompanies", () => {
  it("está sem o banco de teste configurado", () => {
    /*
     * Um pulo silencioso viraria "os testes passaram" sem nada ter sido
     * provado. Este aviso existe para que a ausência apareça na saída.
     */
    console.warn(
      "[isolamento] TEST_DATABASE_URL ausente — as provas de isolamento NÃO rodaram.",
    );
    expect(temBancoDeTeste()).toBe(false);
  });
});
