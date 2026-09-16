import { companyDisplayName } from "@shared/companies";
import { DEFAULT_PREFERENCES, todayIn } from "@shared/preferences";
import * as db from "./db";
import { sendOverdueAlert } from "./email";
import { envioDeEmailConfigurado } from "./emails";
import { resolveTimeZone } from "./userToday";

/*
 * O alerta de contas a pagar atrasadas.
 *
 * Uma vez por dia, a partir das 8h NO FUSO DA PESSOA, para cada empresa dela
 * que tenha conta a pagar vencida e ainda pendente: um e-mail com a lista, o
 * total e o botão "Ver tudo". Sem atraso, sem e-mail.
 *
 * O agendador é um relógio dentro do processo, a cada quinze minutos. Ele não
 * sabe que horas são "as 8h" de ninguém — cada rodada pergunta, por pessoa,
 * "já passou das 8h no fuso dela e ainda não mandei hoje?". A resposta para
 * "ainda não mandei" mora no banco (`alertDispatches`), não na memória: o
 * servidor reinicia, e a memória vai embora com ele.
 */

export const HORA_DO_ALERTA = 8;

export type ContaAtrasada = { descricao: string; contato: string; vencimento: string; diasDeAtraso: number; valor: number };

/** A hora local (0–23) de `agora` num fuso. */
export function horaLocal(agora: Date, timeZone: string) {
  const texto = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(agora);
  return Number(texto) % 24;
}

/** Dias inteiros entre duas datas ISO (a segunda depois da primeira). */
export function diasEntre(deIso: string, ateIso: string) {
  const de = Date.UTC(...(deIso.slice(0, 10).split("-").map(Number) as [number, number, number]).map((n, i) => (i === 1 ? n - 1 : n)) as [number, number, number]);
  const ate = Date.UTC(...(ateIso.slice(0, 10).split("-").map(Number) as [number, number, number]).map((n, i) => (i === 1 ? n - 1 : n)) as [number, number, number]);
  return Math.max(0, Math.round((ate - de) / 86_400_000));
}

export function montarContas(linhas: Array<{ description: string; contact: string; transactionDate: string; amount: string | number }>, hoje: string): { contas: ContaAtrasada[]; total: number } {
  const contas = linhas.map(l => ({
    descricao: l.description,
    contato: l.contact,
    vencimento: l.transactionDate,
    diasDeAtraso: diasEntre(l.transactionDate, hoje),
    valor: Math.abs(Number(l.amount)),
  }));
  const total = Math.round(contas.reduce((soma, c) => soma + c.valor, 0) * 100) / 100;
  return { contas, total };
}

/**
 * Manda o alerta de UMA empresa para UMA pessoa, agora, sem olhar hora nem
 * carimbo. É o que o botão "Enviar agora" chama. Devolve o que aconteceu,
 * para a tela dizer "enviado" ou "nenhuma conta atrasada".
 */
export async function enviarAlertaDaEmpresa(dados: { userId: number; email: string; nome: string | null; empresa: { id: number; userId: number; legalName: string; tradeName: string }; hoje: string }) {
  const escopo = { userId: dados.empresa.userId, companyId: dados.empresa.id };
  const linhas = await db.listarContasAtrasadas(escopo, dados.hoje);
  if (linhas.length === 0) return { enviado: false as const, motivo: "sem-atraso" as const, contas: 0, total: 0 };
  const { contas, total } = montarContas(linhas, dados.hoje);
  const enviado = await sendOverdueAlert({
    to: dados.email,
    nome: dados.nome,
    empresa: companyDisplayName(dados.empresa, dados.nome ?? ""),
    contas,
    total,
  });
  return enviado
    ? { enviado: true as const, contas: contas.length, total }
    : { enviado: false as const, motivo: "email-nao-configurado" as const, contas: contas.length, total };
}

/**
 * Uma rodada do agendador. Idempotente dentro do dia: o carimbo entra ANTES
 * do envio (é ele que segura a rodada concorrente) e sai se o envio falhar.
 */
export async function enviarAlertasDoDia(agora = new Date()) {
  const resumo = { avaliados: 0, enviados: 0, semAtraso: 0, foraDaHora: 0, jaEnviados: 0, falhas: 0 };
  const destinatarios = await db.listarDestinatariosDeAlerta();
  for (const pessoa of destinatarios) {
    const timeZone = resolveTimeZone(pessoa.timeZone);
    if (horaLocal(agora, timeZone) < HORA_DO_ALERTA) { resumo.foraDaHora += 1; continue; }
    const hoje = todayIn({ ...DEFAULT_PREFERENCES, timeZone }, agora);
    const empresas = (await db.listCompanies(pessoa.userId)).filter(empresa => empresa.isActive);
    for (const empresa of empresas) {
      resumo.avaliados += 1;
      const carimbo = { companyId: empresa.id, kind: "contas_atrasadas" as const, sentOn: hoje };
      try {
        const linhas = await db.listarContasAtrasadas({ userId: pessoa.userId, companyId: empresa.id }, hoje);
        if (linhas.length === 0) { resumo.semAtraso += 1; continue; }
        if (!await db.registrarEnvioDeAlerta(pessoa.userId, carimbo)) { resumo.jaEnviados += 1; continue; }
        const { contas, total } = montarContas(linhas, hoje);
        const enviado = await sendOverdueAlert({
          to: pessoa.email,
          nome: pessoa.name,
          empresa: companyDisplayName(empresa, pessoa.name ?? ""),
          contas,
          total,
        });
        if (!enviado) { await db.desfazerEnvioDeAlerta(pessoa.userId, carimbo); resumo.falhas += 1; continue; }
        resumo.enviados += 1;
      } catch (erro) {
        resumo.falhas += 1;
        await db.desfazerEnvioDeAlerta(pessoa.userId, carimbo).catch(() => undefined);
        console.error(`[alertas] empresa ${empresa.id} de ${pessoa.userId}:`, erro instanceof Error ? erro.message : erro);
      }
    }
  }
  return resumo;
}

/** Liga o relógio. Sem Resend configurado não liga: não há para onde mandar. */
export function iniciarAgendadorDeAlertas(intervaloMs = 15 * 60_000) {
  if (process.env.VITEST || process.env.ALERTAS_DESLIGADOS === "1") return null;
  if (!envioDeEmailConfigurado()) {
    console.log("[alertas] envio de e-mail não configurado; agendador de alertas desligado");
    return null;
  }
  const rodar = () => enviarAlertasDoDia().then(resumo => {
    if (resumo.enviados > 0 || resumo.falhas > 0) console.log("[alertas] rodada:", JSON.stringify(resumo));
  }).catch(erro => console.error("[alertas] rodada falhou:", erro instanceof Error ? erro.message : erro));
  const relogio = setInterval(rodar, intervaloMs);
  // A primeira rodada um minuto depois de subir, para o deploy não competir com ela.
  setTimeout(rodar, 60_000);
  return relogio;
}
