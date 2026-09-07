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
      subject: "Seu código de redefinição — NV Financeiro",
      html: `
        <div style="font-family:Arial,sans-serif;color:#0B1F14;line-height:1.5">
          <h1 style="font-size:24px;margin:0 0 16px">Redefinir senha</h1>
          <p>Use o código abaixo para criar uma nova senha:</p>
          <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:24px 0">${code}</p>
          <p>O código expira em 10 minutos. Se você não solicitou a alteração, ignore esta mensagem.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    throw new Error("Password reset email delivery failed");
  }
  return true;
}
