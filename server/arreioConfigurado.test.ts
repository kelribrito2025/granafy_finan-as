import { describe, expect, it } from "vitest";
import { conferirAlvoDeTeste, temBancoDeTeste } from "./testDatabase";

/*
 * O teste que impede a suíte de fechar verde sem ter testado nada.
 *
 * Onze arreios de isolamento vivem atrás de `describe.runIf(temBancoDeTeste())`.
 * O `runIf` é certo: numa máquina sem o schema de teste eles não têm como rodar,
 * e falhar ali só ensinaria a ignorar vermelho. O problema é o que acontece
 * quando ninguém percebe que a variável sumiu — a suíte imprime "passou",
 * ninguém lê o "132 skipped", e as guardas de isolamento, que são a coisa mais
 * valiosa deste projeto, param de ser exercitadas sem uma linha de aviso.
 *
 * Em CI isso não pode acontecer: é justamente onde não há humano lendo a
 * contagem. Então aqui, e só aqui, o silêncio vira vermelho.
 *
 * Fora do CI o teste não cobra nada: na máquina de quem está mexendo no
 * frontend, exigir um schema TiDB seria atrapalhar sem proteger.
 */

/** Verdadeiro em GitHub Actions e na maioria dos serviços de CI. */
const EM_CI = process.env.CI === "true" || process.env.CI === "1";

describe("o arreio de banco está configurado", () => {
  it.runIf(EM_CI)("em CI, TEST_DATABASE_URL é obrigatória", () => {
    /*
     * A mensagem carrega o motivo porque quem vai ler é alguém olhando um
     * build vermelho sem contexto nenhum — possivelmente meses depois, e
     * possivelmente sem saber que os arreios de isolamento existem.
     */
    expect(
      temBancoDeTeste(),
      "TEST_DATABASE_URL não está definida neste CI. Sem ela os 11 arreios de " +
      "isolamento são PULADOS e a suíte fecha verde sem ter exercitado nenhuma " +
      "guarda de dono ou de empresa. Defina TEST_DATABASE_URL (e TIDB_DATABASE_URL) " +
      "nos segredos do repositório — ver o cabeçalho de server/testDatabase.ts.",
    ).toBe(true);
  });

  it.runIf(EM_CI)("em CI, TIDB_DATABASE_URL também — senão a contenção quebra", () => {
    /*
     * `temBancoDeTeste()` não exige esta segunda variável, mas a suíte de
     * contenção em `testDatabase.test.ts` exige: ela é liberada pelo mesmo
     * `runIf` e o corpo faz `new URL(process.env.TIDB_DATABASE_URL!)`. Com só a
     * primeira definida, o resultado é `TypeError: Invalid URL` no arquivo que
     * existe para provar que a credencial de teste não alcança produção — o
     * lugar onde um erro confuso é mais caro.
     */
    expect(
      Boolean(process.env.TIDB_DATABASE_URL),
      "TIDB_DATABASE_URL não está definida. Com TEST_DATABASE_URL sozinha, a " +
      "suíte de contenção de server/testDatabase.test.ts falha com " +
      "\"Invalid URL\" em vez de provar a contenção.",
    ).toBe(true);
  });

  /*
   * A trava de nome vale em qualquer lugar, com ou sem CI: se a variável
   * existe, ela tem que apontar para um schema de teste. É barata e cobre o
   * erro de digitação que apontaria o arreio para produção.
   */
  it("quando definida, aponta para um schema _test", () => {
    if (!process.env.TEST_DATABASE_URL) return;
    expect(() =>
      conferirAlvoDeTeste(process.env.TEST_DATABASE_URL, process.env.TIDB_DATABASE_URL),
    ).not.toThrow();
  });
});
