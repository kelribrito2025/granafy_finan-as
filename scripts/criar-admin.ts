/*
 * Cria (ou promove) uma conta de administrador do sistema.
 *
 *   ADMIN_EMAIL=... ADMIN_NOME=... ADMIN_SENHA=... npx tsx scripts/criar-admin.ts
 *   PROMOVER=dev@teste.com npx tsx scripts/criar-admin.ts        (só promove)
 *
 * A conta nova nasce pelo MESMO caminho do cadastro (createLocalUser: empresa
 * padrão e catálogo de categorias), com o primeiro acesso já concluído — o
 * admin não passa pelo assistente — e depois é promovida a `admin`.
 *
 * Senha e hash nunca saem daqui: a senha entra por variável de ambiente (não
 * por argumento, que fica no `ps`) e o script só imprime id, e-mail, papel e
 * datas. Toca a produção de propósito; roda com o pedido explícito de quem
 * manda no banco.
 */
import "dotenv/config";
import * as db from "../server/db";
import { hashPassword } from "../server/auth";
import { getDb } from "../server/db";
import { users } from "../drizzle/schema";
import { eq, inArray } from "drizzle-orm";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const nome = process.env.ADMIN_NOME?.trim();
const senha = process.env.ADMIN_SENHA;
const promover = (process.env.PROMOVER ?? "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

async function retrato(emails: string[]) {
  const conexao = await getDb();
  if (!conexao) throw new Error("sem banco");
  const linhas = await conexao.select({ id: users.id, email: users.email, name: users.name, role: users.role, createdAt: users.createdAt })
    .from(users).where(inArray(users.email, emails));
  for (const linha of linhas) {
    const empresas = await db.listCompanies(linha.id);
    console.log(`  #${linha.id} ${linha.email} · ${linha.name} · papel=${linha.role} · empresas=${empresas.length}` +
      ` · primeiro acesso concluído=${empresas.every(e => Boolean(e.onboardingCompletedAt)) ? "sim" : "não"}`);
  }
  if (linhas.length === 0) console.log("  (nenhuma dessas contas existe ainda)");
}

const alvo = [...(email ? [email] : []), ...promover];
console.log("ANTES:"); await retrato(alvo);

if (email && nome && senha) {
  const existente = await db.getUserRecordByEmail(email);
  if (existente) {
    console.log(`\n${email} já existe (#${existente.id}); não recria.`);
  } else {
    const user = await db.createLocalUser({ email, name: nome, passwordHash: await hashPassword(senha) });
    for (const empresa of await db.listCompanies(user.id)) {
      await db.markOnboardingCompleted({ userId: user.id, companyId: empresa.id });
    }
    console.log(`\ncriada #${user.id} ${email} pelo caminho do cadastro, com o primeiro acesso concluído.`);
  }
}

const conexao = await getDb();
if (!conexao) throw new Error("sem banco");
for (const e of alvo) {
  await conexao.update(users).set({ role: "admin" }).where(eq(users.email, e));
}
console.log(`promovidas a admin: ${alvo.join(", ")}`);

console.log("\nDEPOIS:"); await retrato(alvo);
process.exit(0);
