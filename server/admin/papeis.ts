/*
 * Quem é admin do sistema.
 *
 * Fica fora de `consultas.ts` porque aquele arquivo não escreve — é a
 * promessa que o cabeçalho dele faz — e fora de `exclusoes.ts` porque aqui
 * nada é apagado. É a terceira coisa que o admin pode fazer no sistema
 * inteiro, e a mais fácil de fazer sem querer: por isso promover pede o
 * e-mail inteiro, digitado.
 *
 * Duas recusas do servidor: ninguém mexe no próprio papel (quem se
 * rebaixasse perderia a tela no mesmo clique) e o último admin não é
 * rebaixado, senão o `/admin` fica sem dono e só um UPDATE na mão devolve
 * o acesso.
 */
import { TRPCError } from "@trpc/server";
import { count, eq } from "drizzle-orm";
import { users } from "../../drizzle/schema";
import { normalizeEmail } from "../auth";
import { getDb } from "../db";

async function conexao() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export async function promover({ email, ator }: { email: string; ator: number }) {
  const db = await conexao();
  /*
   * `normalizeEmail`, e não `.trim()`.
   *
   * Todo e-mail entra no banco em minúsculas — cadastro, login e Google passam
   * pela mesma função. Aqui a comparação era exata sobre o texto digitado, e a
   * collation padrão do TiDB é BINÁRIA: promover digitando "Fulano@empresa.com"
   * devolvia "nenhum login com esse e-mail" para uma conta que existe. O admin
   * digita o endereço inteiro justamente porque promover é a ação mais fácil de
   * fazer sem querer — e o erro fazia parecer que a conta não existia.
   */
  const alvo = normalizeEmail(email);
  const [pessoa] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.email, alvo))
    .limit(1);
  if (!pessoa) throw new TRPCError({ code: "NOT_FOUND", message: `Nenhum login com o e-mail ${alvo}.` });
  if (pessoa.id === ator) throw new TRPCError({ code: "BAD_REQUEST", message: "Você já é admin." });
  if (pessoa.role === "admin") throw new TRPCError({ code: "BAD_REQUEST", message: `${alvo} já é admin do sistema.` });

  await db.update(users).set({ role: "admin" }).where(eq(users.id, pessoa.id));
  console.warn(`[admin] ${pessoa.id} virou admin por ${ator}`);
  return { id: pessoa.id, nome: pessoa.name, email: pessoa.email };
}

export async function rebaixar({ id, ator }: { id: number; ator: number }) {
  const db = await conexao();
  if (id === ator) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não tira o próprio papel de admin." });

  const [pessoa] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!pessoa) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  if (pessoa.role !== "admin") throw new TRPCError({ code: "BAD_REQUEST", message: "Este login já é usuário comum." });

  const [quantos] = await db.select({ n: count() }).from(users).where(eq(users.role, "admin"));
  if (Number(quantos.n) <= 1) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Este é o último admin do sistema. Promova outro antes." });
  }

  await db.update(users).set({ role: "user" }).where(eq(users.id, id));
  console.warn(`[admin] ${id} voltou a usuário por ${ator}`);
  return { id: pessoa.id, nome: pessoa.name, email: pessoa.email };
}
