/*
 * A porta que o resto do servidor usa para mandar e-mail.
 *
 * Os modelos e o envio moram em `emails.ts`; aqui ficam só as funções com
 * nome de negócio. As variáveis (RESEND_API_KEY e PASSWORD_RESET_FROM_EMAIL,
 * que é o remetente de todos os e-mails, não só o da redefinição) vivem no
 * `.env` e no ambiente de produção — nunca no repositório.
 */
import { emailDeAtivacao, emailDeBoasVindas, emailDeConvite, emailDeRedefinicao, enviarEmail, envioDeEmailConfigurado } from "./emails";

export function isPasswordResetEmailConfigured() {
  return envioDeEmailConfigurado();
}

export async function sendPasswordResetCode({ to, code, name = null }: { to: string; code: string; name?: string | null }) {
  const { assunto, html } = emailDeRedefinicao({ nome: name, codigo: code });
  return enviarEmail({ to, assunto, html });
}

export async function sendActivationCode({ to, code, name = null, validity = "15 minutos" }: { to: string; code: string; name?: string | null; validity?: string }) {
  const { assunto, html } = emailDeAtivacao({ nome: name, codigo: code, validade: validity });
  return enviarEmail({ to, assunto, html });
}

/**
 * As boas-vindas, logo depois do cadastro.
 *
 * Nunca falha o cadastro: a conta já existe quando o e-mail sai, e um
 * problema no Resend não pode devolver erro para quem acabou de se
 * cadastrar. A falha vai para o log e só.
 */
export async function sendWelcomeEmail({ to, name = null }: { to: string; name?: string | null }) {
  try {
    const { assunto, html } = emailDeBoasVindas({ nome: name });
    return await enviarEmail({ to, assunto, html });
  } catch (error) {
    console.error("[resend] boas-vindas não enviadas:", error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * O convite de acesso do contador. `false` quando o envio não está
 * configurado — e nesse caso o router devolve o link para o dono mandar por
 * outro caminho, então a falta de e-mail não trava o convite.
 */
export async function sendCompanyInvite(dados: {
  to: string;
  nomeDoDono: string;
  empresas: string[];
  token: string;
}) {
  const { assunto, html } = emailDeConvite({
    nomeDoDono: dados.nomeDoDono,
    emailConvidado: dados.to,
    empresas: dados.empresas,
    token: dados.token,
    validade: "7 dias",
  });
  return enviarEmail({ to: dados.to, assunto, html });
}
