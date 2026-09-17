/*
 * A matemática dos Relatórios, sem banco e sem tela.
 *
 * O servidor devolve o movimento agregado por conta e por mês; este módulo
 * transforma isso nas séries que as três telas desenham. Fica em `shared/`
 * para o cliente reaproveitar os totais e a curva sem repetir a conta, e para
 * a regra ser testada com números na mão, sem MariaDB no meio.
 */

export type Janela = "6m" | "12m" | "ano";
export const JANELAS: Array<[Janela, string]> = [["6m", "6 meses"], ["12m", "12 meses"], ["ano", "Ano"]];

export type Mes = { year: number; month: number };

export const NOMES_DOS_MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function mesDe(iso: string): Mes {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

export function deslocarMes({ year, month }: Mes, passo: number): Mes {
  const d = new Date(Date.UTC(year, month - 1 + passo, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** "2026-04" — a mesma chave que o `DATE_FORMAT(..., '%Y-%m')` do banco produz. */
export function chaveDoMes({ year, month }: Mes) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function inicioDoMes({ year, month }: Mes) {
  return `${chaveDoMes({ year, month })}-01`;
}

/** Primeiro dia do mês seguinte: o fim exclusivo das consultas. */
export function fimExclusivoDoMes(mes: Mes) {
  return inicioDoMes(deslocarMes(mes, 1));
}

export function ultimoDiaDoMes({ year, month }: Mes) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** A véspera de uma data ISO, para "tudo antes de" virar "até". */
export function diaAnterior(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Os meses que a janela cobre, terminando em `ate`. "Ano" é o ano civil de
 * `ate` até o próprio mês: janeiro a setembro em setembro, e não os doze
 * meses corridos — é a leitura que quem pergunta "como foi o ano" espera.
 */
export function mesesDaJanela(janela: Janela, ate: Mes): Mes[] {
  const quantos = janela === "6m" ? 6 : janela === "12m" ? 12 : ate.month;
  return Array.from({ length: quantos }, (_, i) => deslocarMes(ate, i - (quantos - 1)));
}

/** A janela imediatamente anterior, com o mesmo tamanho — a base do "vs. período anterior". */
export function mesesAnteriores(meses: Mes[]): Mes[] {
  const primeiro = meses[0]!;
  return meses.map((_, i) => deslocarMes(primeiro, i - meses.length));
}

export function rotuloDoMes({ year, month }: Mes) {
  const nome = NOMES_DOS_MESES[month - 1]!;
  return `${nome[0]!.toUpperCase()}${nome.slice(1)} de ${year}`;
}

export function rotuloCurtoDoMes({ year, month }: Mes, comAno = false) {
  return comAno ? `${MESES_CURTOS[month - 1]} ${year}` : MESES_CURTOS[month - 1]!;
}

function dataBr(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** "de abril a setembro de 2026", em partes, para cada tela montar a frase dela. */
export function rotuloDoPeriodo(meses: Mes[]) {
  const primeiro = meses[0]!;
  const ultimo = meses[meses.length - 1]!;
  const mesmoAno = primeiro.year === ultimo.year;
  return {
    de: mesmoAno ? NOMES_DOS_MESES[primeiro.month - 1]! : `${NOMES_DOS_MESES[primeiro.month - 1]} de ${primeiro.year}`,
    ate: `${NOMES_DOS_MESES[ultimo.month - 1]} de ${ultimo.year}`,
    inicio: dataBr(inicioDoMes(primeiro)),
    fim: dataBr(ultimoDiaDoMes(ultimo)),
  };
}

/* ------------------------------------------------------------------------ */

/** Uma linha do agregado do banco: conta × mês × (transferência ou não). */
export type LinhaMensal = {
  accountId: number | null;
  /** "2026-04" */
  mes: string;
  transferencia: boolean;
  entradas: number;
  saidas: number;
};

export type ContaBase = {
  id: number;
  name: string;
  institution: string;
  accountType: string;
  isActive: boolean;
  initialBalance: number;
  /** O que estava pago antes do início do período, já com a regra do saldo inicial com data. */
  pagoAntes: number;
};

export type MesDoRelatorio = {
  chave: string;
  rotulo: string;
  rotuloCurto: string;
  entradas: number;
  saidas: number;
};

export type ContaDoRelatorio = {
  id: number;
  nome: string;
  detalhe: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  /** O saldo ao fim de cada mês da janela, um ponto por mês. */
  curva: number[];
};

const TIPOS_DE_CONTA: Record<string, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  carteira: "Carteira",
  cartao: "Cartão",
  gateway: "Gateway de pagamento",
  outro: "Outra conta",
};

export function detalheDaConta(conta: { institution: string; accountType: string }) {
  const tipo = TIPOS_DE_CONTA[conta.accountType] ?? "Conta";
  return conta.institution ? `${tipo} · ${conta.institution}` : tipo;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

/**
 * As séries do consolidado: entradas e saídas por mês SEM transferência.
 * Transferência entre contas próprias move saldo, não é receita nem despesa.
 * Lançamento sem conta entra aqui — é dinheiro da empresa mesmo assim.
 */
export function mesesConsolidados(meses: Mes[], linhas: LinhaMensal[]): MesDoRelatorio[] {
  return meses.map(m => {
    const chave = chaveDoMes(m);
    let entradas = 0;
    let saidas = 0;
    for (const l of linhas) {
      if (l.mes !== chave || l.transferencia) continue;
      entradas += l.entradas;
      saidas += l.saidas;
    }
    return { chave, rotulo: rotuloDoMes(m), rotuloCurto: rotuloCurtoDoMes(m), entradas: centavos(entradas), saidas: centavos(saidas) };
  });
}

/**
 * Uma linha por conta, COM transferência: para a conta, receber de outra conta
 * da empresa é entrada de verdade. Conta inativa só aparece se mexeu no período.
 */
export function contasDoRelatorio(meses: Mes[], contas: ContaBase[], linhas: LinhaMensal[]): ContaDoRelatorio[] {
  const chaves = meses.map(chaveDoMes);
  return contas
    .map(conta => {
      const minhas = linhas.filter(l => l.accountId === conta.id);
      const saldoInicial = centavos(conta.initialBalance + conta.pagoAntes);
      let saldo = saldoInicial;
      let entradas = 0;
      let saidas = 0;
      const curva = chaves.map(chave => {
        for (const l of minhas) {
          if (l.mes !== chave) continue;
          entradas += l.entradas;
          saidas += l.saidas;
          saldo += l.entradas - l.saidas;
        }
        return centavos(saldo);
      });
      return {
        id: conta.id,
        nome: conta.name,
        detalhe: detalheDaConta(conta),
        saldoInicial,
        entradas: centavos(entradas),
        saidas: centavos(saidas),
        curva,
        mexeu: minhas.length > 0,
        ativa: conta.isActive,
      };
    })
    .filter(c => c.ativa || c.mexeu)
    .map(({ mexeu: _m, ativa: _a, ...c }) => c);
}

export function totais(meses: readonly Pick<MesDoRelatorio, "entradas" | "saidas">[]) {
  const entradas = meses.reduce((s, m) => s + m.entradas, 0);
  const saidas = meses.reduce((s, m) => s + m.saidas, 0);
  const resultado = entradas - saidas;
  return { entradas, saidas, resultado, margem: entradas > 0 ? (resultado / entradas) * 100 : 0 };
}

/** O saldo ao fim de cada mês, partindo do saldo inicial. */
export function curvaDoSaldo<M extends Pick<MesDoRelatorio, "entradas" | "saidas">>(meses: readonly M[], saldoInicial: number) {
  let saldo = saldoInicial;
  return meses.map(m => {
    const inicial = saldo;
    saldo = centavos(saldo + m.entradas - m.saidas);
    return { ...m, saldoInicial: inicial, saldoFinal: saldo };
  });
}

/**
 * O topo do eixo de um gráfico de barras: um número "redondo" logo acima do
 * maior valor (1, 2, 2,5 ou 5 vezes uma potência de dez), para os rótulos do
 * eixo saírem legíveis em vez de "R$ 137.482".
 */
export function tetoDoEixo(maior: number) {
  if (maior <= 0) return 1000;
  const potencia = 10 ** Math.floor(Math.log10(maior));
  for (const fator of [1, 2, 2.5, 5, 10]) {
    if (fator * potencia >= maior) return fator * potencia;
  }
  return 10 * potencia;
}
