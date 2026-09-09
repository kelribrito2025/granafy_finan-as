import { describe, expect, it } from "vitest";
import {
  BancoDeTesteRecusado,
  conectarNoBancoDeTeste,
  conferirAlvoDeTeste,
  temBancoDeTeste,
} from "./testDatabase";

const PRODUCAO = "mysql://prefixo.root:senha@gateway01.exemplo.tidbcloud.com:4000/granafy_database";

/*
 * A trava é testada sem banco nenhum: ela existe justamente para o caso em que
 * a variável de ambiente está errada, e um teste que precisasse de conexão para
 * verificar isso não rodaria na hora em que mais importa.
 */
describe("trava do banco de teste", () => {
  it("recusa quando a variável não está definida", () => {
    expect(() => conferirAlvoDeTeste(undefined)).toThrow(BancoDeTesteRecusado);
  });

  it("recusa um schema que não termina em _test", () => {
    expect(() => conferirAlvoDeTeste("mysql://u:s@h:4000/granafy_database"))
      .toThrow(/precisa terminar em "_test"/);
  });

  it("recusa o schema de produção mesmo que alguém o renomeie para _test", () => {
    const disfarcado = "mysql://prefixo.root:senha@gateway01.exemplo.tidbcloud.com:4000/granafy_database";
    expect(() => conferirAlvoDeTeste(disfarcado, PRODUCAO)).toThrow(BancoDeTesteRecusado);
  });

  it("recusa a credencial de produção apontando para o schema de teste", () => {
    /*
     * Este é o furo que a trava de nome sozinha não pega: o usuário de produção
     * enxerga os dois schemas, então apontá-lo para granafy_test passaria no
     * sufixo e ainda assim poria uma credencial com acesso total no arreio.
     */
    const mesmoUsuario = "mysql://prefixo.root:senha@gateway01.exemplo.tidbcloud.com:4000/granafy_test";
    expect(() => conferirAlvoDeTeste(mesmoUsuario, PRODUCAO)).toThrow(/credencial de produção/);
  });

  it("aceita o usuário restrito apontando para o schema de teste", () => {
    const certo = "mysql://prefixo.granafy_test:outra@gateway01.exemplo.tidbcloud.com:4000/granafy_test";
    expect(conferirAlvoDeTeste(certo, PRODUCAO).banco).toBe("granafy_test");
  });

  it("recusa uma URL malformada", () => {
    expect(() => conferirAlvoDeTeste("nao-e-url")).toThrow(BancoDeTesteRecusado);
  });
});

/*
 * A terceira camada: a credencial de teste não pode alcançar produção. Só roda
 * quando o arreio está configurado, e é o que transforma "confio no GRANT" em
 * "o banco recusou na minha frente".
 */
describe.runIf(temBancoDeTeste())("contenção da credencial de teste", () => {
  it("não consegue ler nenhuma tabela do banco de produção", async () => {
    const conexao = await conectarNoBancoDeTeste();
    try {
      const producao = new URL(process.env.TIDB_DATABASE_URL!).pathname.replace(/^\//, "");
      await expect(conexao.query(`SELECT COUNT(*) FROM \`${producao}\`.\`users\``)).rejects.toThrow();
    } finally {
      await conexao.end();
    }
  });

  it("não enxerga o schema de produção nem na listagem", async () => {
    const conexao = await conectarNoBancoDeTeste();
    try {
      const producao = new URL(process.env.TIDB_DATABASE_URL!).pathname.replace(/^\//, "");
      const [linhas] = await conexao.query("SHOW DATABASES");
      const nomes = (linhas as Record<string, string>[]).map(linha => Object.values(linha)[0]);
      expect(nomes).not.toContain(producao);
    } finally {
      await conexao.end();
    }
  });
});
