#!/usr/bin/env node
/*
 * Envia UM e-mail de teste pelo Resend, com as variáveis do `.env`.
 *
 *   node scripts/testar-resend.mjs voce@exemplo.com
 *
 * Serve para provar chave e remetente antes de depender deles na tela de
 * redefinição. Não toca no banco. Não roda sem um destinatário explícito.
 */
import { readFileSync } from "node:fs";

for (const linha of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

const destino = process.argv[2];
const chave = process.env.RESEND_API_KEY;
const de = process.env.PASSWORD_RESET_FROM_EMAIL;
if (!destino) { console.error("uso: node scripts/testar-resend.mjs <destino>"); process.exit(2); }
if (!chave || !de) { console.error("faltam RESEND_API_KEY e/ou PASSWORD_RESET_FROM_EMAIL no .env"); process.exit(2); }

const resposta = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    from: de,
    to: [destino],
    subject: "Teste de envio — GranaFy",
    html: "<p>Se este e-mail chegou, o remetente e a chave do Resend estão certos.</p>",
  }),
});
const corpo = await resposta.text();
console.log(`HTTP ${resposta.status} · de: ${de} · para: ${destino}`);
console.log(corpo);
process.exit(resposta.ok ? 0 : 1);
