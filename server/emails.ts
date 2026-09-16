import { ENV } from "./_core/env";

/*
 * Os e-mails do GranaFy, num modelo só.
 *
 * Tudo em tabela e estilo inline, porque é o que os clientes de e-mail
 * entendem — Gmail ignora <style> em boa parte, Outlook ignora quase tudo.
 * O desenho é o do painel: fundo #E9EEEB, cartão branco de cantos 20 px, o
 * rótulo verde em caixa alta, o título, o corpo, e o rodapé cinza.
 *
 * A fonte é a Geist, a mesma do painel, com a pilha de reserva do sistema
 * (aspas simples na pilha: ela vai dentro de style="…", e aspas duplas ali
 * fecham o atributo e derrubam a fonte inteira para a serifa do cliente):
 * Apple Mail e iOS carregam a Geist pelo <link>; Gmail e Outlook caem na
 * reserva, que é o mesmo que o painel faz onde a Geist não chega.
 *
 * O logo e os links dependem de PUBLIC_URL. Sem ela o e-mail sai sem a
 * imagem e sem botão — texto e código continuam inteiros. Imagem em base64
 * não serve: o Gmail bloqueia.
 */
const FONTE = `'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;

function urlPublica(caminho = "") {
  const base = ENV.publicUrl.replace(/\/$/, "");
  return base ? `${base}${caminho}` : null;
}

function escapar(texto: string) {
  return texto.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

type Bloco = string;

/** O quadro do código: fundo verde-claro, monoespaçado, espaçado. */
export function blocoDeCodigo(codigo: string, validade: string): Bloco {
  return `
    <tr><td class="px" style="padding:26px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
        <tr><td align="center" bgcolor="#F1FBF6" style="background-color:#F1FBF6; border-radius:16px; padding:26px 16px;">
          <p class="big" style="margin:0; font-family:'Courier New',Courier,monospace; font-size:38px; line-height:44px; mso-line-height-rule:exactly; font-weight:bold; letter-spacing:10px; color:#0A7A42;">${escapar(codigo)}</p>
          <p style="margin:10px 0 0 0; font-family:${FONTE}; font-size:12.5px; line-height:18px; mso-line-height-rule:exactly; color:#4C6355;">${escapar(validade)}</p>
        </td></tr>
      </table>
    </td></tr>`;
}

/** O botão verde. Sem URL pública não há para onde apontar, e ele não entra. */
export function blocoDeBotao(rotulo: string, caminho: string): Bloco {
  const href = urlPublica(caminho);
  if (!href) return "";
  return `
    <tr><td class="px" style="padding:24px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
        <tr><td align="center" bgcolor="#12B85C" style="background-color:#12B85C; border-radius:12px;">
          <a href="${href}" style="display:block; padding:15px 24px; font-family:${FONTE}; font-size:15px; font-weight:bold; color:#FFFFFF; text-decoration:none; line-height:20px; mso-line-height-rule:exactly;">${escapar(rotulo)}</a>
        </td></tr>
      </table>
    </td></tr>`;
}

/** A nota do fim, separada por um fio. O HTML é do chamador (para o <strong>). */
export function blocoDeNota(html: string): Bloco {
  return `
    <tr><td class="px" style="padding:24px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%; border-top:1px solid #F1F4F2;">
        <tr><td height="20" style="height:20px; line-height:20px; font-size:0;">&nbsp;</td></tr>
        <tr><td style="font-family:${FONTE}; font-size:13px; line-height:21px; mso-line-height-rule:exactly; color:#4C6355;">${html}</td></tr>
      </table>
    </td></tr>`;
}

/** Uma lista de passos, para o e-mail de boas-vindas. */
export function blocoDePassos(passos: Array<{ titulo: string; texto: string }>): Bloco {
  const linhas = passos.map((passo, i) => `
    <tr>
      <td width="28" valign="top" style="width:28px; padding:0 12px 14px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" bgcolor="#DFF6EA" style="background-color:#DFF6EA; border-radius:14px; width:28px; height:28px; font-family:${FONTE}; font-size:12.5px; font-weight:bold; color:#0A7A42;">${i + 1}</td>
        </tr></table>
      </td>
      <td valign="top" style="padding:0 0 14px 0; font-family:${FONTE};">
        <p style="margin:0; font-size:14px; line-height:20px; font-weight:bold; color:#0B1F14;">${escapar(passo.titulo)}</p>
        <p style="margin:2px 0 0 0; font-size:13px; line-height:20px; color:#4C6355;">${escapar(passo.texto)}</p>
      </td>
    </tr>`).join("");
  return `
    <tr><td class="px" style="padding:22px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">${linhas}</table>
    </td></tr>`;
}

export function layoutDeEmail({ assunto, previa, rotulo, titulo, corpo, blocos }: {
  assunto: string;
  /** A linha que aparece na caixa de entrada, depois do assunto. */
  previa: string;
  rotulo: string;
  titulo: string;
  /** HTML do parágrafo de abertura (o chamador escapa o que vem de fora). */
  corpo: string;
  blocos: Bloco[];
}) {
  const logo = urlPublica("/email/granafy-logo.png");
  const marca = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      ${logo ? `<td width="36" style="width:36px; line-height:0; font-size:0;"><img src="${logo}" width="36" height="36" alt="GranaFy" style="display:block; width:36px; height:36px; border:0; outline:none; text-decoration:none; border-radius:10px;"></td><td width="10" style="width:10px;">&nbsp;</td>` : ""}
      <td style="font-family:${FONTE}; font-size:16px; font-weight:bold; color:#0B1F14; letter-spacing:-.2px;">Grana<span style="color:#0A7A42;">Fy</span></td>
    </tr></table>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapar(assunto)}</title>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @media only screen and (max-width:620px) {
    .px { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:23px !important; line-height:29px !important; }
    .big { font-size:30px !important; letter-spacing:6px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#E9EEEB;">
<span style="display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all;">${escapar(previa)}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#E9EEEB;">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px; max-width:600px;">
      <tr><td class="px" style="padding:0 0 18px 0;">${marca}</td></tr>
      <tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF; border-radius:20px; padding:0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr><td class="px" style="padding:36px 40px 0 40px; font-family:${FONTE};">
            <p style="margin:0 0 10px 0; font-size:11px; font-weight:bold; letter-spacing:1.4px; text-transform:uppercase; color:#0A7A42;">${escapar(rotulo)}</p>
            <h1 class="h1" style="margin:0 0 12px 0; font-size:26px; line-height:32px; mso-line-height-rule:exactly; font-weight:bold; color:#0B1F14; letter-spacing:-.5px;">${escapar(titulo)}</h1>
            <p style="margin:0; font-size:15px; line-height:24px; mso-line-height-rule:exactly; color:#4C6355;">${corpo}</p>
          </td></tr>
          ${blocos.join("")}
          <tr><td height="36" style="height:36px; line-height:36px; font-size:0;">&nbsp;</td></tr>
        </table>
      </td></tr>
      <tr><td class="px" style="padding:22px 40px 8px 40px; font-family:${FONTE}; font-size:11.5px; line-height:19px; mso-line-height-rule:exactly; color:#8A968D;">
        GranaFy · Gestão financeira para pequenas empresas<br>
        Este é um e-mail de serviço da sua conta.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/* ── Os modelos ─────────────────────────────────────────────────────────── */

export function emailDeRedefinicao({ nome, codigo }: { nome: string | null; codigo: string }) {
  const ola = nome ? `Olá, ${escapar(nome)}. ` : "";
  return {
    assunto: "Seu código de redefinição · GranaFy",
    html: layoutDeEmail({
      assunto: "Seu código de redefinição · GranaFy",
      previa: `Seu código de redefinição é ${codigo} — vale por 10 minutos.`,
      rotulo: "Redefinição de senha",
      titulo: "Seu código de redefinição",
      corpo: `${ola}Use o código abaixo para criar uma nova senha no GranaFy.`,
      blocos: [
        blocoDeCodigo(codigo, "Válido por 10 minutos"),
        blocoDeNota(`<strong style="color:#28382E;">Não pediu este código?</strong> Ignore este e-mail — sem o código ninguém troca a sua senha.`),
      ],
    }),
  };
}

export function emailDeAtivacao({ nome, codigo, validade }: { nome: string | null; codigo: string; validade: string }) {
  const ola = nome ? `Olá, ${escapar(nome)}. ` : "";
  return {
    assunto: "Seu código de ativação · GranaFy",
    html: layoutDeEmail({
      assunto: "Seu código de ativação · GranaFy",
      previa: `Seu código de ativação é ${codigo} — vale por ${validade}.`,
      rotulo: "Ativação da conta",
      titulo: "Seu código de ativação",
      corpo: `${ola}Use o código abaixo para confirmar seu e-mail e ativar a sua conta.`,
      blocos: [
        blocoDeCodigo(codigo, `Válido por ${validade}`),
        blocoDeNota(`<strong style="color:#28382E;">Não pediu este código?</strong> Ignore este e-mail — sem o código ninguém ativa a conta.`),
      ],
    }),
  };
}

export function emailDeBoasVindas({ nome }: { nome: string | null }) {
  const ola = nome ? `Olá, ${escapar(nome)}. ` : "";
  return {
    assunto: "Bem-vindo ao GranaFy",
    html: layoutDeEmail({
      assunto: "Bem-vindo ao GranaFy",
      previa: "Sua conta está pronta. Em três passos o painel começa a trabalhar por você.",
      rotulo: "Boas-vindas",
      titulo: "Sua conta está pronta",
      corpo: `${ola}O GranaFy organiza o financeiro da sua empresa a partir do que entra e sai das suas contas. Em três passos o painel começa a trabalhar por você.`,
      blocos: [
        blocoDePassos([
          { titulo: "Cadastre a primeira conta", texto: "Banco, tipo de conta e o saldo inicial." },
          { titulo: "Registre ou importe os lançamentos", texto: "Manualmente, ou pelo extrato do banco em OFX ou CSV." },
          { titulo: "Acompanhe o caixa", texto: "Saldo dia a dia, contas a pagar e receber, DRE e conciliação." },
        ]),
        blocoDeBotao("Abrir o GranaFy", "/"),
        blocoDeNota(`Você pode refazer esses passos quando quiser, em <strong style="color:#28382E;">Configurações</strong>.`),
      ],
    }),
  };
}

export function emailDeConvite({ nomeDoDono, emailConvidado, empresas, token, validade }: {
  nomeDoDono: string;
  emailConvidado: string;
  empresas: string[];
  token: string;
  validade: string;
}) {
  const lista = empresas.map(escapar).join(", ");
  const plural = empresas.length > 1;
  return {
    assunto: `${nomeDoDono} liberou o acesso a ${plural ? "empresas" : "uma empresa"} no GranaFy`,
    html: layoutDeEmail({
      assunto: `${nomeDoDono} liberou o acesso no GranaFy`,
      previa: `Você foi convidado para ver ${plural ? "as empresas" : "a empresa"} ${empresas.join(", ")} em modo leitura.`,
      rotulo: "Convite de acesso",
      titulo: `${nomeDoDono} liberou o acesso para você`,
      corpo: `Você foi convidado como <strong style="color:#28382E;">contador</strong> ${plural ? "das empresas" : "da empresa"} <strong style="color:#28382E;">${lista}</strong>. O acesso é somente leitura: você vê lançamentos, conciliação, DRE e balanço, e não altera nada.`,
      blocos: [
        blocoDeBotao("Aceitar convite", `/convite/${token}`),
        blocoDeNota(`O convite vale por <strong style="color:#28382E;">${escapar(validade)}</strong> e só funciona com o e-mail <strong style="color:#28382E;">${escapar(emailConvidado)}</strong>. Se você já tem conta no GranaFy com esse e-mail, entre com a senha de sempre; se não tem, cria a senha ao aceitar.<br><br><strong style="color:#28382E;">Não conhece ${escapar(nomeDoDono)}?</strong> Ignore este e-mail — sem clicar, nada acontece.`),
      ],
    }),
  };
}

const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function dataBr(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** A tabela das contas: descrição e vencimento à esquerda, valor à direita. */
export function blocoDeContas(contas: Array<{ descricao: string; contato: string; vencimento: string; diasDeAtraso: number; valor: number }>, total: number): Bloco {
  const linhas = contas.map(conta => `
    <tr>
      <td style="padding:10px 0; border-bottom:1px solid #F1F4F2; font-family:${FONTE};">
        <p style="margin:0; font-size:13.5px; line-height:19px; font-weight:bold; color:#0B1F14;">${escapar(conta.descricao)}</p>
        <p style="margin:2px 0 0 0; font-size:12px; line-height:17px; color:#8A968D;">${conta.contato ? `${escapar(conta.contato)} · ` : ""}venceu em ${dataBr(conta.vencimento)} · ${conta.diasDeAtraso === 1 ? "1 dia" : `${conta.diasDeAtraso} dias`} de atraso</p>
      </td>
      <td align="right" valign="top" style="padding:10px 0 10px 12px; border-bottom:1px solid #F1F4F2; font-family:${FONTE}; font-size:13.5px; line-height:19px; font-weight:bold; color:#B3261E; white-space:nowrap;">${escapar(dinheiro.format(conta.valor))}</td>
    </tr>`).join("");
  return `
    <tr><td class="px" style="padding:22px 40px 0 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;">
        ${linhas}
        <tr>
          <td style="padding:14px 0 0 0; font-family:${FONTE}; font-size:13px; line-height:19px; font-weight:bold; color:#4C6355;">Total em atraso</td>
          <td align="right" style="padding:14px 0 0 12px; font-family:${FONTE}; font-size:18px; line-height:24px; font-weight:bold; color:#B3261E; white-space:nowrap;">${escapar(dinheiro.format(total))}</td>
        </tr>
      </table>
    </td></tr>`;
}

export function emailDeContasAtrasadas({ nome, empresa, contas, total }: {
  nome: string | null;
  empresa: string;
  contas: Array<{ descricao: string; contato: string; vencimento: string; diasDeAtraso: number; valor: number }>;
  total: number;
}) {
  const ola = nome ? `Olá, ${escapar(nome)}. ` : "";
  const quantas = contas.length === 1 ? "1 conta a pagar está atrasada" : `${contas.length} contas a pagar estão atrasadas`;
  return {
    assunto: `${quantas} · ${empresa}`,
    html: layoutDeEmail({
      assunto: `${quantas} · ${empresa}`,
      previa: `${quantas} na ${empresa}, somando ${dinheiro.format(total)}.`,
      rotulo: "Contas a pagar",
      titulo: quantas,
      corpo: `${ola}Na <strong style="color:#28382E;">${escapar(empresa)}</strong>, ${contas.length === 1 ? "esta conta passou do vencimento e ainda está pendente" : "estas contas passaram do vencimento e ainda estão pendentes"}. Se alguma já foi paga, marque como paga e o alerta para.`,
      blocos: [
        blocoDeContas(contas, total),
        blocoDeBotao("Ver tudo", "/a-pagar-e-receber"),
        blocoDeNota(`Este alerta sai uma vez por dia enquanto houver conta atrasada. Para não receber, desligue em <strong style="color:#28382E;">Configurações → Preferências → Alertas por e-mail</strong>.`),
      ],
    }),
  };
}

/* ── O envio ────────────────────────────────────────────────────────────── */

export function envioDeEmailConfigurado() {
  return Boolean(process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM_EMAIL);
}

/**
 * Manda um e-mail pelo Resend. `false` quando não está configurado.
 *
 * Nunca envia de dentro da suíte: os arreios cadastram contas com e-mails
 * inventados, e o `.env` local tem a chave de verdade. Uma recusa do Resend
 * vai para o log com status e resposta — sem o corpo do e-mail, que pode
 * carregar um código.
 */
export async function enviarEmail({ to, assunto, html }: { to: string; assunto: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM_EMAIL;
  if (!apiKey || !from || process.env.VITEST) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: assunto, html }),
  });
  if (!response.ok) {
    const motivo = await response.text().catch(() => "");
    console.error(`[resend] envio recusado: HTTP ${response.status} ${motivo.slice(0, 300)}`);
    throw new Error("E-mail delivery failed");
  }
  return true;
}
