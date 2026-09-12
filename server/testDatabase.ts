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
  const rotulo = arquivoChamador();
  const inicio = Date.now();
  const conexao = await createConnection({
    host: url.hostname,
    port: Number(url.port || "4000"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    connectTimeout: 15_000,
    multipleStatements: false,
  });
  anotar(`${rotulo} · conectou em ${Date.now() - inicio} ms`);
  return cronometrarConexao(conexao, rotulo);
}

/*
 * O relógio do arreio.
 *
 * Sete ocorrências do timeout aberto (ver `timeoutsDaSuite.md`) e nenhuma
 * disse ONDE o tempo foi: o vitest sabe que o hook estourou, não qual comando
 * estava esperando. Este relógio anota, com hora de parede, o que os arreios
 * pagam ao banco — e só fala quando há algo a dizer:
 *
 *   - consulta que passa de LIMIAR_LENTA_MS, junto com quanto tempo a conexão
 *     ficou ociosa antes dela (a hipótese da "primeira ida depois de parada");
 *   - consulta ainda em voo depois de AVISO_EM_VOO_MS — é a linha que sobra
 *     quando o hook morre, porque a consulta que trava nunca volta para se
 *     explicar;
 *   - erro, com o código e quanto tempo levou para chegar: um ECONNRESET aos
 *     40 s é outro bicho que um ECONNRESET imediato;
 *   - o resumo da conexão ao fechar — quantas consultas, a mais lenta, o maior
 *     ocioso —, que é a linha de base que uma rodada quieta deixa.
 *
 * A hora de parede (UTC, como o painel do TiDB) é para cruzar com o consumo
 * do cluster. `ARREIO_RELOGIO=0` desliga tudo.
 */
const LIMIAR_LENTA_MS = 2_000;
const AVISO_EM_VOO_MS = 10_000;
const RELOGIO_LIGADO = process.env.ARREIO_RELOGIO !== "0";

function horaDeParede() {
  return new Date().toISOString().slice(11, 23);
}

function anotar(linha: string) {
  if (RELOGIO_LIGADO) process.stderr.write(`[arreio ${horaDeParede()}] ${linha}\n`);
}

function resumirSql(sql: unknown) {
  const texto = typeof sql === "string" ? sql : String((sql as { sql?: string } | null)?.sql ?? sql);
  return texto.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** O arquivo de teste que pediu a conexão, lido da pilha — só para rotular a linha. */
function arquivoChamador() {
  const linha = (new Error().stack ?? "").split("\n").find(trecho => /\.test\.ts/.test(trecho));
  return linha?.match(/([\w.-]+\.test\.ts)/)?.[1] ?? "?";
}

type Consulta = (...args: any[]) => Promise<any>;

function cronometrarConexao(conexao: Connection, rotulo: string) {
  const resumo = { consultas: 0, totalMs: 0, maxMs: 0, maxSql: "", maiorOciosoMs: 0, ultimoFim: Date.now() };

  const envolver = <F extends Consulta>(original: F): F =>
    (async (...args: any[]) => {
      const sql = resumirSql(args[0]);
      const inicio = Date.now();
      const ociosa = inicio - resumo.ultimoFim;
      const aviso = setTimeout(
        () => anotar(`${rotulo} · EM VOO há ${AVISO_EM_VOO_MS / 1000} s (ociosa ${ociosa} ms antes) · ${sql}`),
        AVISO_EM_VOO_MS,
      );
      aviso.unref();
      try {
        const resultado = await original(...args);
        const ms = Date.now() - inicio;
        if (ms > LIMIAR_LENTA_MS) anotar(`${rotulo} · ${ms} ms (ociosa ${ociosa} ms antes) · ${sql}`);
        return resultado;
      } catch (erro) {
        const codigo = (erro as { code?: string }).code ?? (erro as Error).name;
        anotar(`${rotulo} · ERRO ${codigo} após ${Date.now() - inicio} ms (ociosa ${ociosa} ms antes) · ${sql}`);
        throw erro;
      } finally {
        clearTimeout(aviso);
        const ms = Date.now() - inicio;
        resumo.consultas += 1;
        resumo.totalMs += ms;
        resumo.ultimoFim = Date.now();
        if (ms > resumo.maxMs) {
          resumo.maxMs = ms;
          resumo.maxSql = sql;
        }
        if (ociosa > resumo.maiorOciosoMs) resumo.maiorOciosoMs = ociosa;
      }
    }) as F;

  conexao.query = envolver(conexao.query.bind(conexao) as Consulta) as Connection["query"];
  conexao.execute = envolver(conexao.execute.bind(conexao) as Consulta) as Connection["execute"];

  const fechar = conexao.end.bind(conexao);
  conexao.end = (async () => {
    anotar(
      `${rotulo} · fechou · ${resumo.consultas} consultas · ${resumo.totalMs} ms no banco` +
        ` · mais lenta ${resumo.maxMs} ms (${resumo.maxSql}) · maior ocioso ${resumo.maiorOciosoMs} ms`,
    );
    return fechar();
  }) as Connection["end"];

  return conexao;
}

/**
 * O pool que o código de produção usa dentro do arreio (`usarBancoDeTesteEm`).
 *
 * As consultas dele passam pelo drizzle, não por aqui; o que dá para ouvir de
 * fora são dois eventos que interessam ao padrão: conexão nova (um handshake
 * TLS até us-east-1, que é o custo da "primeira ida") e fila (as dez conexões
 * ocupadas — o sinal de pool esgotado que a medição de vazamento descartou,
 * mas que agora fica gravado em vez de medido à mão).
 */
export function escutarPoolDeTeste(pool: { on(evento: string, ouvinte: () => void): unknown }) {
  let abertas = 0;
  pool.on("connection", () => anotar(`pool · conexão nova nº ${++abertas}`));
  pool.on("enqueue", () => anotar("pool · consulta na FILA: as dez conexões estão ocupadas"));
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
  const inicio = Date.now();
  let novas = 0;
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
    novas += 1;
  }
  anotar(`schema pronto em ${Date.now() - inicio} ms · ${novas} migrations novas`);
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

/**
 * A identidade de um usuário de teste — derivada do id, sempre.
 *
 * A faixa de cada suíte é numérica, e é por ela que `limparTabelas` apaga. Só
 * que `users` tem dois índices únicos de TEXTO — `openId` e `email` — e três
 * arreios semeavam os mesmos literais: `'a'`, `'b'`, `'ana@t.local'`. Enquanto
 * todo mundo roda até o fim, as faixas nunca se encontram e nada acontece.
 *
 * Basta uma suíte morrer antes do `afterAll` — um Ctrl-C, um `--bail`, um kill
 * — para o literal sobreviver à faixa que o apagaria, e a PRÓXIMA suíte quebrar
 * em "Duplicate entry" num arquivo que não tem nada a ver com o que falhou. Foi
 * exatamente o que aconteceu: um `kill` no meio de `activeCompany` (faixa
 * 7.100.00x) derrubou `cadastros` (6.100.00x) e `backfillCompanies`
 * (8.100.00x), que só compartilhavam o `openId 'a'`.
 *
 * Derivando do id, a faixa passa a valer para as três chaves da tabela, e o
 * isolamento volta a ser por desenho em vez de por sorte de escalonamento.
 */
export function usuarioDeTeste(id: number, nome: string) {
  return [id, `teste-${id}`, `teste-${id}@t.local`, nome, "password"];
}
