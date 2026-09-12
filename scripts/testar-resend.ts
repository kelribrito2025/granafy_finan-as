/*
 * Envia UM e-mail de teste pelo Resend, com as variáveis do `.env`.
 *
 *   npx tsx scripts/testar-resend.ts voce@exemplo.com [ativacao|boas-vindas|redefinicao]
 *
 * Sem o modelo, manda o de ativação. Serve para provar chave e remetente e
 * para ver os modelos de verdade na caixa de entrada. Não toca no banco.
 */
import "dotenv/config";
import { emailDeAtivacao, emailDeBoasVindas, emailDeRedefinicao, enviarEmail } from "../server/emails";

const destino = process.argv[2];
const modelo = process.argv[3] ?? "ativacao";
if (!destino) { console.error("uso: npx tsx scripts/testar-resend.ts <destino> [ativacao|boas-vindas|redefinicao]"); process.exit(2); }
if (!process.env.RESEND_API_KEY || !process.env.PASSWORD_RESET_FROM_EMAIL) { console.error("faltam RESEND_API_KEY e/ou PASSWORD_RESET_FROM_EMAIL no .env"); process.exit(2); }

const modelos = {
  ativacao: () => emailDeAtivacao({ nome: "Kelri", codigo: "486213", validade: "15 minutos" }),
  "boas-vindas": () => emailDeBoasVindas({ nome: "Kelri" }),
  redefinicao: () => emailDeRedefinicao({ nome: "Kelri", codigo: "907315" }),
} as const;
const escolhido = modelos[modelo as keyof typeof modelos];
if (!escolhido) { console.error(`modelo desconhecido: ${modelo}`); process.exit(2); }

const { assunto, html } = escolhido();
try {
  await enviarEmail({ to: destino, assunto, html });
  console.log(`enviado · ${modelo} · de: ${process.env.PASSWORD_RESET_FROM_EMAIL} · para: ${destino}`);
} catch (erro) {
  console.error("falhou:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
}
