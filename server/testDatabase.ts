import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createConnection, type Connection } from "mysql2/promise";

/*
 * O banco de teste, e as travas que o mantêm longe de produção.
 *
 * As guardas de isolamento vivem em consultas SQL. Provar que uma consulta
 * filtra pelo dono certo exige rodá-la contra um banco de verdade — ler o
 * código não prova nada, e um banco falso em memória não reproduz o que já nos
 * mordeu duas vezes: o `only_full_group_by` do MySQL e a precedência do `OR`
 * em fragmento cru. Por isso o alvo é um schema no mesmo cluster TiDB, com o
 * mesmo dialeto.
 *
 * Um schema no mesmo cluster de produção só é aceitável com contenção real, e
 * ela é feita em três camadas independentes:
 *
 *   1. Credencial separada. `TEST_DATABASE_URL` aponta para um usuário SQL que
 *      só tem permissão em `granafy_test`. A credencial de produção nunca é
 *      lida por este arquivo — nem como reserva.
 *   2. Trava de nome, aqui embaixo. O alvo precisa terminar em `_test`. Não há
 *      variável, flag ou parâmetro que desligue isso.
 *   3. Prova de impotência, em `testDatabase.test.ts`: o arreio tenta ler uma
 *      tabela de produção com a credencial de teste e o teste só passa se o
 *      banco recusar.
 *
 * Nenhuma das três sozinha bastaria. Um erro de digitação vence a primeira, um
 * grant largo demais vence a segunda, e uma credencial trocada vence a
 * terceira — as três juntas exigem três erros no mesmo dia.
 */

/** O sufixo obrigatório do schema de teste. Não é configurável de propósito. */
export const SUFIXO_OBRIGATORIO = "_test";

export class BancoDeTesteRecusado extends Error {}

/**
 * Confere o alvo antes de qualquer conexão.
 *
 * Pura, e testada sem banco: é a trava que impede o arreio de apontar para
 * produção por um erro de digitação numa variável de ambiente.
 */
export function conferirAlvoDeTeste(url: string | undefined, urlDeProducao?: string) {
  if (!url) {
    throw new BancoDeTesteRecusado(
      "TEST_DATABASE_URL não está definida. Os testes de isolamento precisam do schema de teste.",
    );
  }

  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    throw new BancoDeTesteRecusado("TEST_DATABASE_URL não é uma URL válida.");
  }

  const banco = alvo.pathname.replace(/^\//, "");
  if (!banco.endsWith(SUFIXO_OBRIGATORIO)) {
    throw new BancoDeTesteRecusado(
      `O banco de teste precisa terminar em "${SUFIXO_OBRIGATORIO}". Recebido: "${banco}".`,
    );
  }

  if (urlDeProducao) {
    /*
     * O mesmo cluster é esperado — é o ponto da fidelidade de dialeto. O que
     * não pode é o mesmo schema, nem o mesmo usuário: se a URL de teste
     * chegasse com a credencial de produção, a trava de nome não adiantaria
     * nada, porque aquele usuário enxerga os dois schemas.
     */
    const producao = new URL(urlDeProducao);
    const bancoDeProducao = producao.pathname.replace(/^\//, "");
    if (banco === bancoDeProducao) {
      throw new BancoDeTesteRecusado("TEST_DATABASE_URL aponta para o banco de produção.");
    }
    if (alvo.username === producao.username) {
      throw new BancoDeTesteRecusado(
        "TEST_DATABASE_URL usa a credencial de produção. O arreio precisa do usuário restrito ao schema de teste.",
      );
    }
  }

  return { url: alvo, banco };
}

/** `true` quando dá para rodar os testes que precisam de banco. */
export function temBancoDeTeste() {
  try {
    conferirAlvoDeTeste(process.env.TEST_DATABASE_URL, process.env.TIDB_DATABASE_URL);
    return true;
  } catch {
    return false;
  }
}

export async function conectarNoBancoDeTeste(): Promise<Connection> {
  const { url } = conferirAlvoDeTeste(process.env.TEST_DATABASE_URL, process.env.TIDB_DATABASE_URL);
  return createConnection({
    host: url.hostname,
    port: Number(url.port || "4000"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    connectTimeout: 15_000,
    multipleStatements: false,
  });
}

/**
 * Cria o schema de teste a partir das migrations, na ordem.
 *
 * São os mesmos arquivos que produção recebeu, aplicados na mesma sequência —
 * não uma recriação a partir do schema em TypeScript. A diferença importa: o
 * que o teste exercita é o banco que existe, com os índices que existem, e não
 * o banco que o código acha que existe.
 *
 * `drizzle-kit` não entra nisso. Ele não é chamado em lugar nenhum deste
 * projeto, e não vai ser aqui que ele estreia.
 */
/** O diário do próprio arreio: qual migration já entrou neste schema. */
const DIARIO = "_migracoes_do_arreio";

export async function prepararSchemaDeTeste(conexao: Connection) {
  /*
   * Um diário, e não "se já tem tabela, pula".
   *
   * O atalho ingênuo — pular quando o schema não está vazio — deixa toda
   * migration NOVA de fora para sempre: o schema de teste congela na versão em
   * que foi criado, e o arreio passa a exercitar um banco que produção não tem
   * mais. Foi o que aconteceu entre a Fase 1 e a Fase 2, e o custo teria sido
   * descobrir no meio do ritual.
   *
   * Com o diário, cada arquivo entra uma vez e só uma, e um arquivo novo entra
   * na primeira rodada depois de aparecer — que é como um migrador de verdade
   * se comporta.
   */
  await conexao.query(
    `CREATE TABLE IF NOT EXISTS \`${DIARIO}\` (arquivo varchar(255) NOT NULL PRIMARY KEY, aplicadaEm timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  );
  const [jaAplicadas] = await conexao.query(`SELECT arquivo FROM \`${DIARIO}\``);
  const feitas = new Set((jaAplicadas as Array<{ arquivo: string }>).map(linha => linha.arquivo));

  const pasta = path.resolve(import.meta.dirname, "..", "drizzle");
  const arquivos = readdirSync(pasta).filter(nome => nome.endsWith(".sql")).sort();

  for (const arquivo of arquivos) {
    if (feitas.has(arquivo)) continue;
    const conteudo = readFileSync(path.join(pasta, arquivo), "utf8");
    const comandos = conteudo
      .split("--> statement-breakpoint")
      .map(trecho => trecho.trim())
      .filter(Boolean);
    for (const comando of comandos) {
      try {
        await conexao.query(comando);
      } catch (erro) {
        /*
         * Tolerado só o "já existe", para o caso de um schema montado antes de
         * o diário existir. Qualquer outro erro sobe: schema meio aplicado faz
         * o teste mentir, e um teste que mente é pior que teste nenhum.
         */
        const codigo = (erro as { code?: string }).code ?? "";
        const jaExiste = ["ER_TABLE_EXISTS_ERROR", "ER_DUP_FIELDNAME", "ER_DUP_KEYNAME"].includes(codigo);
        if (!jaExiste) throw erro;
      }
    }
    // IGNORE porque duas suítes podem chegar aqui juntas na primeira montagem.
    await conexao.query(`INSERT IGNORE INTO \`${DIARIO}\` (arquivo) VALUES (?)`, [arquivo]);
  }
}

/*
 * Cada arreio é dono de uma faixa de `userId`, e só apaga o que é dela.
 *
 * A versão anterior fazia `DELETE FROM <tabela>` sem filtro: toda suíte
 * esvaziava a tabela inteira do vizinho. Isso só é seguro enquanto os arquivos
 * rodarem estritamente um por vez — ou seja, o isolamento entre arreios
 * dependia de uma linha de CONFIGURAÇÃO (`fileParallelism: false`), não do
 * desenho. Um arreio de isolamento que não é isolado de si mesmo é uma piada
 * que só tem graça antes de dar problema.
 *
 * As faixas já existiam por convenção nos arquivos; aqui viram contrato. Com
 * elas, duas suítes podem rodar juntas sem se enxergarem, e a ordem dos
 * arquivos deixa de importar.
 *
 * A tabela `users` filtra por `id`; as demais, por `userId`.
 */
export async function limparTabelas(
  conexao: Connection,
  tabelas: readonly string[],
  donos: readonly number[],
) {
  if (donos.length === 0) {
    throw new BancoDeTesteRecusado("limparTabelas exige a faixa de donos da suíte.");
  }
  if (!donos.every(id => Number.isSafeInteger(id) && id > 0)) {
    throw new BancoDeTesteRecusado("Faixa de donos inválida.");
  }

  for (const tabela of tabelas) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(tabela)) {
      throw new BancoDeTesteRecusado(`Nome de tabela suspeito: "${tabela}".`);
    }
    const coluna = tabela === "users" ? "id" : "userId";
    const marcas = donos.map(() => "?").join(", ");
    await conexao.query(`DELETE FROM \`${tabela}\` WHERE \`${coluna}\` IN (${marcas})`, [...donos]);
  }
}
