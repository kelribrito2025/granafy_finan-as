/**
 * Títulos a pagar e a receber.
 *
 * Não existe tabela de títulos: um título é um lançamento pendente. O vencimento
 * é a data do lançamento — o banco não guarda data de pagamento separada —, e o
 * sinal do valor diz de que lado ele está. Entrada pendente é a receber, saída
 * pendente é a pagar.
 */

import { roundCurrency } from "./currency";

export type TitleStatus = "atrasado" | "vence_hoje" | "em_aberto" | "liquidado";

export type TitleRow = {
  id: number;
  type: "entrada" | "saida" | "transferencia";
  transactionDate: string;
  description: string;
  contact: string;
  category: string;
  /** Assinado: entrada positiva, saída negativa. */
  amount: number;
  account: string;
  status: "Pago" | "Pendente";
};

export type Title = TitleRow & {
  titleStatus: TitleStatus;
  /** Dias de atraso; zero quando não está atrasado. */
  daysLate: number;
  side: "receber" | "pagar";
};

export const STATUS_LABELS: Record<TitleStatus, string> = {
  atrasado: "Atrasado",
  vence_hoje: "Vence hoje",
  em_aberto: "Em aberto",
  liquidado: "Liquidado",
};

function daysBetween(fromIso: string, toIso: string) {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86_400_000);
}

export function titleStatusOf(row: Pick<TitleRow, "status" | "transactionDate">, todayIso: string): TitleStatus {
  if (row.status === "Pago") return "liquidado";
  if (row.transactionDate < todayIso) return "atrasado";
  if (row.transactionDate === todayIso) return "vence_hoje";
  return "em_aberto";
}

/** Transferência move dinheiro entre contas próprias: não é título de ninguém. */
function isTitle(row: TitleRow) {
  return row.type !== "transferencia" && row.amount !== 0;
}

export function toTitle(row: TitleRow, todayIso: string): Title {
  const titleStatus = titleStatusOf(row, todayIso);
  return {
    ...row,
    titleStatus,
    daysLate: titleStatus === "atrasado" ? daysBetween(row.transactionDate, todayIso) : 0,
    side: row.amount > 0 ? "receber" : "pagar",
  };
}

export type TitleGroupKey = "atrasados" | "hoje" | "proximos" | "depois";

export type TitleGroup = {
  key: TitleGroupKey;
  label: string;
  titles: Title[];
  /** Soma assinada do grupo: entradas menos saídas. */
  balance: number;
  receivable: number;
  payable: number;
};

const GROUP_LABELS: Record<TitleGroupKey, string> = {
  atrasados: "Atrasados",
  hoje: "Hoje",
  proximos: "Próximos 7 dias",
  depois: "Depois",
};

function groupKeyOf(title: Title, todayIso: string): TitleGroupKey {
  if (title.titleStatus === "atrasado") return "atrasados";
  if (title.transactionDate === todayIso) return "hoje";
  return daysBetween(todayIso, title.transactionDate) <= 7 ? "proximos" : "depois";
}

export type PayablesView = {
  /** Só os pendentes, ordenados por vencimento. */
  open: Title[];
  receivables: Title[];
  payables: Title[];
  overdue: Title[];
  dueToday: Title[];
  groups: TitleGroup[];
  totals: {
    receivable: number;
    payable: number;
    balance: number;
    /** Saldo líquido dos vencidos: útil como número, ruim como rótulo. */
    overdue: number;
    /** Só a dívida vencida — é este o número que a tela pinta de vermelho. */
    overduePayable: number;
    overdueReceivable: number;
    dueTodayReceivable: number;
  };
};

/**
 * Monta a tela a partir dos lançamentos do período.
 *
 * Só os pendentes viram título: o que já foi pago saiu da fila. Títulos
 * atrasados de meses anteriores entram quando vierem na lista de linhas — quem
 * decide a janela é quem chama.
 */
export function buildPayablesView(rows: readonly TitleRow[], todayIso: string): PayablesView {
  const open = rows
    .filter(row => isTitle(row) && row.status === "Pendente")
    .map(row => toTitle(row, todayIso))
    .sort((left, right) =>
      left.transactionDate === right.transactionDate
        ? right.amount - left.amount
        : left.transactionDate < right.transactionDate ? -1 : 1
    );

  const receivables = open.filter(title => title.side === "receber");
  const payables = open.filter(title => title.side === "pagar");
  const overdue = open.filter(title => title.titleStatus === "atrasado");
  const dueToday = open.filter(title => title.titleStatus === "vence_hoje");

  const sum = (titles: readonly Title[]) => roundCurrency(titles.reduce((total, title) => total + title.amount, 0));
  const receivable = sum(receivables);
  const payable = sum(payables);

  const groups: TitleGroup[] = (["atrasados", "hoje", "proximos", "depois"] as const)
    .map(key => {
      const titles = open.filter(title => groupKeyOf(title, todayIso) === key);
      return {
        key,
        label: GROUP_LABELS[key],
        titles,
        balance: sum(titles),
        receivable: sum(titles.filter(title => title.side === "receber")),
        payable: sum(titles.filter(title => title.side === "pagar")),
      };
    })
    .filter(group => group.titles.length > 0);

  return {
    open,
    receivables,
    payables,
    overdue,
    dueToday,
    groups,
    totals: {
      receivable,
      payable,
      balance: receivable + payable,
      overdue: sum(overdue),
      overduePayable: sum(overdue.filter(title => title.side === "pagar")),
      overdueReceivable: sum(overdue.filter(title => title.side === "receber")),
      dueTodayReceivable: sum(dueToday.filter(title => title.side === "receber")),
    },
  };
}
