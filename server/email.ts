/*
 * O e-mail do código de redefinição de senha, pelo Resend.
 *
 * Duas variáveis ligam o envio, e as duas moram no `.env` (ignorado pelo
 * git) e no ambiente de produção — nunca no repositório:
 *
 *   RESEND_API_KEY              a chave da conta no Resend
 *   PASSWORD_RESET_FROM_EMAIL   o remetente, num domínio verificado lá:
 *                               `GranaFy <nao-responda@dominio.com.br>`
 *
 * Sem as duas, `isPasswordResetEmailConfigured()` diz que não e a tela avisa
 * que o serviço ainda não está conectado. Com as duas e o envio falhando, o
 * fluxo continua o mesmo para quem pediu (a resposta não pode denunciar se o
 * e-mail existe), mas a falha vai para o log do servidor com a resposta do
 * Resend — porque "Password reset email delivery failed" sem o motivo é um
 * erro que ninguém consegue investigar.
 */
type PasswordResetEmail = {
  to: string;
  code: string;
};

export function isPasswordResetEmailConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM_EMAIL
  );
}

export async function sendPasswordResetCode({ to, code }: PasswordResetEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!apiKey || !from) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Seu código de redefinição — GranaFy",
      html: `
        <div style="font-family:Arial,sans-serif;color:#0B1F14;line-height:1.5">
          <h1 style="font-size:24px;margin:0 0 16px">Redefinir senha</h1>
          <p>Use o código abaixo para criar uma nova senha no GranaFy:</p>
          <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
          <p>O código expira em 10 minutos. Se você não solicitou a alteração, ignore esta mensagem.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    // O corpo do Resend diz o motivo (domínio não verificado, chave inválida,
    // remetente recusado). O código nunca vai para o log.
    const motivo = await response.text().catch(() => "");
    console.error(`[resend] envio recusado: HTTP ${response.status} ${motivo.slice(0, 300)}`);
    throw new Error("Password reset email delivery failed");
  }
  return true;
}
