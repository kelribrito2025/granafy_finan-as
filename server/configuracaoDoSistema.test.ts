import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CHAVE_MOSTRAR_ASSINATURAS } from "@shared/sistema";
import { definirMostrarAssinaturas, lerConfiguracaoDoSistema } from "./configuracaoDoSistema";
import { esquecerBancoDeTeste, usarBancoDeTesteEm } from "./db";
import {
  conectarNoBancoDeTeste,
  limparTabelas,
  prepararSchemaDeTeste,
  temBancoDeTeste,
  usuarioDeTeste,
} from "./testDatabase";

/*
 * O interruptor de Planos e Assinatura, contra banco de verdade.
 *
 * O que interessa aqui não é a conversão de texto para booleano —
 * `shared/sistema.test.ts` prova aquilo sem banco. É o que só o banco pode
 * dizer: que a primeira alternância CRIA a linha e a segunda a ATUALIZA. Foi
 * por aí que a versão anterior morreu, ainda que por outro motivo: o valor
 * ficava num lugar que ninguém mais conseguia ler.
 *
 * Um INSERT seco passaria no primeiro teste e quebraria no segundo; um UPDATE
 * seco faria o contrário e, pior, em silêncio — zero linhas afetadas não é
 * erro em lugar nenhum, e o admin veria o interruptor voltar sozinho.
 */

const ADA = 9_500_001;
const BENTO = 9_500_002;

const TABELAS = ["users"] as const;
const DONOS = [ADA, BENTO] as const;

describe.runIf(temBancoDeTeste())("a configuração do sistema", () => {
  let conexao: Connection;

  /*
   * `systemSettings` não tem dono: é a única tabela do schema sem `userId` e
   * sem `companyId`, e é justamente isso que a torna configuração do sistema.
   * `limparTabelas` apaga por faixa de dono e não serve para ela, então a
   * limpeza é por chave, aqui.
   */
  const limparConfiguracao = async () => {
    await conexao.query("DELETE FROM systemSettings WHERE settingKey = ?", [CHAVE_MOSTRAR_ASSINATURAS]);
  };

  const linhaGravada = async () => {
    const [linhas] = await conexao.query(
      "SELECT settingValue, updatedByUserId FROM systemSettings WHERE settingKey = ?",
      [CHAVE_MOSTRAR_ASSINATURAS],
    );
    return (linhas as Array<{ settingValue: string; updatedByUserId: number | null }>)[0] ?? null;
  };

  beforeAll(async () => {
    conexao = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(conexao);
    await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!);
  }, 60_000);

  afterAll(async () => {
    await limparConfiguracao();
    await limparTabelas(conexao, TABELAS, DONOS);
    await esquecerBancoDeTeste();
    await conexao?.end();
  });

  beforeEach(async () => {
    await limparConfiguracao();
    await limparTabelas(conexao, TABELAS, DONOS);
    for (const [id, nome] of [[ADA, "Ada"], [BENTO, "Bento"]] as const) {
      await conexao.query(
        "INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)",
        usuarioDeTeste(id, nome),
      );
    }
  });

  it("mostra tudo enquanto ninguém mexeu — a tabela nasce vazia", async () => {
    expect(await linhaGravada()).toBeNull();
    expect(await lerConfiguracaoDoSistema()).toEqual({ mostrarAssinaturas: true });
  });

  it("desligar cria a linha, e a leitura seguinte já obedece", async () => {
    await definirMostrarAssinaturas(false, ADA);

    expect(await lerConfiguracaoDoSistema()).toEqual({ mostrarAssinaturas: false });
    expect(await linhaGravada()).toMatchObject({ settingValue: "0", updatedByUserId: ADA });
  });

  /*
   * A segunda alternância é a que importa: é ela que distingue um INSERT que
   * explode de um upsert que funciona. Sem este teste, o interruptor
   * funcionaria uma vez por instalação.
   */
  it("religar atualiza a linha que já existe, sem explodir na chave", async () => {
    await definirMostrarAssinaturas(false, ADA);
    await definirMostrarAssinaturas(true, ADA);

    expect(await lerConfiguracaoDoSistema()).toEqual({ mostrarAssinaturas: true });
    expect(await linhaGravada()).toMatchObject({ settingValue: "1" });

    const [linhas] = await conexao.query(
      "SELECT COUNT(*) AS n FROM systemSettings WHERE settingKey = ?",
      [CHAVE_MOSTRAR_ASSINATURAS],
    );
    expect(Number((linhas as Array<{ n: number }>)[0]!.n)).toBe(1);
  });

  it("vai e volta quantas vezes o admin quiser", async () => {
    for (const desejado of [false, true, false, false, true]) {
      await definirMostrarAssinaturas(desejado, ADA);
      expect(await lerConfiguracaoDoSistema()).toEqual({ mostrarAssinaturas: desejado });
    }
  });

  /*
   * O carimbo tem que acompanhar a última decisão, e não a primeira: a tela do
   * admin promete que a escolha vale para o sistema inteiro, e saber quem
   * desligou por último é o que torna isso auditável.
   */
  it("guarda quem mexeu por último", async () => {
    await definirMostrarAssinaturas(false, ADA);
    expect(await linhaGravada()).toMatchObject({ updatedByUserId: ADA });

    await definirMostrarAssinaturas(true, BENTO);
    expect(await linhaGravada()).toMatchObject({ updatedByUserId: BENTO, settingValue: "1" });
  });

  /*
   * A decisão é UMA para o sistema. Se algum dia ela virar por dono — por
   * engano de assinatura, por exemplo —, aparecem duas linhas e este teste
   * pega: seria o bug original de volta, com outra roupa.
   */
  it("é uma decisão só, e não uma por admin", async () => {
    await definirMostrarAssinaturas(false, ADA);
    await definirMostrarAssinaturas(false, BENTO);

    const [linhas] = await conexao.query("SELECT COUNT(*) AS n FROM systemSettings");
    expect(Number((linhas as Array<{ n: number }>)[0]!.n)).toBe(1);
  });

  it("lixo escrito na mão no banco não desliga nada", async () => {
    await conexao.query(
      "INSERT INTO systemSettings (settingKey, settingValue) VALUES (?, ?)",
      [CHAVE_MOSTRAR_ASSINATURAS, "false"],
    );
    expect(await lerConfiguracaoDoSistema()).toEqual({ mostrarAssinaturas: true });
  });
});
