import { DEFAULT_PREFERENCES, todayIn } from "@shared/preferences";
import * as db from "./db";

/*
 * O "hoje" do servidor, no fuso de quem está olhando.
 *
 * O servidor roda em UTC. Enquanto o cálculo era `new Date().toISOString()`,
 * das 21h à meia-noite de Brasília o sistema já estava no dia seguinte: um
 * boleto que vence amanhã aparecia como "vence hoje", um que vence hoje virava
 * atraso, e o saldo de caixa de hoje passava a incluir o que só entra amanhã.
 * Três telas mentindo por três horas, todo dia.
 *
 * O fuso já estava salvo em `userPreferences` e a conversão já existia em
 * `todayIn` — só ninguém do lado do servidor usava.
 */

/**
 * O fuso salvo, ou o padrão quando ele não serve.
 *
 * O schema aceita qualquer texto de até 60 caracteres em `timeZone`, então nada
 * impede um valor inválido chegar ao banco. `Intl.DateTimeFormat` responde a
 * isso com exceção, e sem esta checagem um fuso digitado errado derrubaria
 * todas as telas de fluxo de caixa de uma vez, com erro de servidor.
 */
export function resolveTimeZone(saved: string | null | undefined) {
  if (!saved) return DEFAULT_PREFERENCES.timeZone;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: saved });
    return saved;
  } catch {
    return DEFAULT_PREFERENCES.timeZone;
  }
}

/** A data de hoje, em `YYYY-MM-DD`, no fuso que esta conta escolheu. */
export async function userToday(userId: number, now = new Date()) {
  const saved = await db.getUserPreferences(userId);
  return todayIn(
    { ...DEFAULT_PREFERENCES, timeZone: resolveTimeZone(saved?.timeZone) },
    now
  );
}
