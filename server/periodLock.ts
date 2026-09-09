import { TRPCError } from "@trpc/server";
import type { Escopo } from "./escopo";
import * as db from "./db";

/*
 * A trava do mês fechado.
 *
 * Fechar um mês na conciliação é assinar que o saldo daquela conta bate com o
 * extrato. Se depois disso um lançamento puder ser criado, editado, apagado ou
 * importado naquele mês, a assinatura deixa de valer sem deixar rastro — e o
 * fechamento vira carimbo decorativo.
 *
 * A trava mora aqui, e não dentro de um router, porque três caminhos escrevem
 * na mesma conta: lançamentos, importação e a própria conciliação.
 *
 * LIMITAÇÃO CONHECIDA — lançamento sem conta passa.
 * O fechamento é por conta, e protege o saldo bancário. Um lançamento com
 * `accountId` nulo não entra no saldo de conta nenhuma, então não desfaz o que
 * foi assinado; mas ele entra na DRE, e portanto ainda dá para mexer no
 * resultado de um mês fechado. Fechamento contábil de verdade seria por
 * empresa e por período, não por conta — e é por aqui que se começa.
 */

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export type PeriodTarget = {
  /** Nulo passa: ver a limitação no topo do arquivo. */
  accountId: number | null;
  /** Data do lançamento, em ISO curto. */
  date: string;
};

function monthKey(accountId: number, date: string) {
  return `${accountId}:${date.slice(0, 7)}`;
}

/**
 * Recusa a escrita quando algum alvo cai num mês já fechado.
 *
 * A mensagem diz qual mês, qual conta e onde reabrir: um "operação não
 * permitida" faria a pessoa procurar o problema no lugar errado.
 */
export async function assertPeriodsOpen(escopo: Escopo, targets: readonly PeriodTarget[]) {
  const pares = new Map<string, { accountId: number; date: string }>();
  for (const target of targets) {
    if (target.accountId == null || !target.date) continue;
    pares.set(monthKey(target.accountId, target.date), {
      accountId: target.accountId,
      date: target.date,
    });
  }
  if (pares.size === 0) return;

  const fechados = await db.listClosedReconciliationPeriods(escopo);
  if (fechados.length === 0) return;

  const trancados = new Set(fechados.map(period => monthKey(period.accountId, `${period.year}-${String(period.month).padStart(2, "0")}`)));
  const bloqueio = Array.from(pares.entries()).find(([chave]) => trancados.has(chave));
  if (!bloqueio) return;

  const [, alvo] = bloqueio;
  const [ano, mes] = alvo.date.split("-").map(Number);
  const conta = await db.getFinancialAccount(escopo, alvo.accountId);
  const nomeDaConta = conta ? ` na conta ${conta.name}` : "";

  throw new TRPCError({
    code: "BAD_REQUEST",
    message:
      `${MESES[mes - 1]} de ${ano} está fechado${nomeDaConta}. ` +
      "Para alterar, abra Conciliação, escolha esse mês e use “Reabrir o mês” — o motivo fica registrado no histórico.",
  });
}
