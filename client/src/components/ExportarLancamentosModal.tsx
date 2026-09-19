import { CloseIcon, DownloadIcon } from "@/components/IconlyIcons";
import { ModalIcon } from "@/components/ModalIcon";
import { BankMark } from "@/lib/bancos";
import { formatMoney } from "@/lib/appFormat";
import { toast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";
import { deslocarMes, fimExclusivoDoMes, inicioDoMes, rotuloCurtoDoMes, type Mes } from "@shared/relatorios";
import { useMemo, useState } from "react";

/*
 * Exportar lançamentos.
 *
 * Abre como o "Novo lançamento": painel à direita, com o mesmo fundo e a
 * mesma entrada. A pessoa escolhe contas, período, situação e formato; o
 * arquivo é montado no navegador com o que o servidor devolve para o recorte.
 *
 *   Excel  — .xlsx de verdade (SheetJS, carregado só na hora).
 *   CSV    — texto com ";" e BOM, que o Excel em português abre certo.
 *   PDF    — o relatório abre numa janela de impressão; "Salvar como PDF" é
 *            do próprio navegador, sem biblioteca e sem servidor.
 */

type Periodo = "6m" | "mes" | "anterior" | "12m" | "ano" | "personalizado";
type Situacao = "todos" | "Pago" | "Pendente";
type Formato = "xlsx" | "csv" | "pdf";

const PERIODOS: Array<[Periodo, string]> = [
  ["6m", "Últimos 6 meses"],
  ["mes", "Mês atual"],
  ["anterior", "Mês anterior"],
  ["12m", "Últimos 12 meses"],
  ["ano", "Ano"],
  ["personalizado", "Personalizado"],
];

const FORMATOS: Array<{ id: Formato; nome: string; descricao: string }> = [
  { id: "xlsx", nome: "Excel", descricao: ".xlsx com colunas separadas" },
  { id: "csv", nome: "CSV", descricao: "texto puro, abre em qualquer lugar" },
  { id: "pdf", nome: "PDF", descricao: "relatório pronto para imprimir" },
];

type ContaOpcao = { id: number; name: string; institution: string; color: string };

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const sel = "h-11 w-full appearance-none rounded-[12px] border border-[#E3EBE6] bg-white px-3.5 pr-9 text-[13.5px] outline-none focus:ring-2 focus:ring-[#12B85C] bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%234C6355' stroke-width='2'><path d='M6 9l6 6 6-6'/></svg>\")] bg-[right_13px_center] bg-no-repeat";
const rotulo = "text-[11px] font-bold uppercase tracking-[.08em] text-[#8A968D]";

/** O recorte [start, end) a partir da opção escolhida; `mes` é o mês aberto na tela. */
function recorteDe(periodo: Periodo, mes: Mes, custom: { de: string; ate: string }) {
  if (periodo === "personalizado") {
    if (!custom.de || !custom.ate) return null;
    const fim = new Date(`${custom.ate}T00:00:00Z`);
    fim.setUTCDate(fim.getUTCDate() + 1);
    return { start: custom.de, end: fim.toISOString().slice(0, 10), rotulo: `${dataBr(custom.de)} a ${dataBr(custom.ate)}` };
  }
  if (periodo === "mes") return { start: inicioDoMes(mes), end: fimExclusivoDoMes(mes), rotulo: rotuloCurtoDoMes(mes, true).toLowerCase() };
  if (periodo === "anterior") { const m = deslocarMes(mes, -1); return { start: inicioDoMes(m), end: fimExclusivoDoMes(m), rotulo: rotuloCurtoDoMes(m, true).toLowerCase() }; }
  if (periodo === "ano") return { start: `${mes.year}-01-01`, end: `${mes.year + 1}-01-01`, rotulo: `ano de ${mes.year}` };
  const quantos = periodo === "6m" ? 6 : 12;
  return { start: inicioDoMes(deslocarMes(mes, -(quantos - 1))), end: fimExclusivoDoMes(mes), rotulo: `últimos ${quantos} meses` };
}

export function ExportarLancamentosModal({ mes, contas, onClose, onExportado }: {
  /** O mês aberto na tela: base de "Mês atual", "Mês anterior" e "Ano". */
  mes: Mes;
  contas: readonly ContaOpcao[];
  onClose: () => void;
  onExportado: () => void;
}) {
  const [periodo, setPeriodo] = useState<Periodo>("6m");
  const [custom, setCustom] = useState({ de: inicioDoMes(mes), ate: new Date(`${fimExclusivoDoMes(mes)}T00:00:00Z`).toISOString().slice(0, 10) });
  const [situacao, setSituacao] = useState<Situacao>("todos");
  const [formato, setFormato] = useState<Formato>("xlsx");
  const [desmarcadas, setDesmarcadas] = useState<Set<number>>(new Set());
  const [incluir, setIncluir] = useState({ classificacao: true, contato: true, totais: false });
  const [gerando, setGerando] = useState(false);

  const recorte = useMemo(() => recorteDe(periodo, mes, custom), [periodo, mes, custom]);
  const utils = trpc.useUtils();
  const resumo = trpc.transactions.resumoExportacao.useQuery(
    { start: recorte?.start ?? "", end: recorte?.end ?? "", status: situacao },
    { enabled: recorte !== null, staleTime: 30_000 },
  );

  /* As contas com lançamento no recorte, na ordem do cadastro; "Sem conta" no fim. */
  const linhasDeConta = useMemo(() => {
    const contagem = new Map((resumo.data?.contas ?? []).map(c => [c.accountId, c.count]));
    const lista = contas.map(c => ({ id: c.id, nome: c.name, detalhe: c.institution, cor: c.color, count: contagem.get(c.id) ?? 0 }));
    if (contagem.has(0)) lista.push({ id: 0, nome: "Sem conta", detalhe: "lançamentos sem conta informada", cor: "#8A968D", count: contagem.get(0) ?? 0 });
    return lista;
  }, [contas, resumo.data]);
  const selecionadas = linhasDeConta.filter(c => !desmarcadas.has(c.id));
  const totalSelecionado = selecionadas.reduce((s, c) => s + c.count, 0);
  const todasMarcadas = desmarcadas.size === 0;

  const alternar = (id: number) => setDesmarcadas(atual => {
    const proximo = new Set(atual);
    if (proximo.has(id)) proximo.delete(id); else proximo.add(id);
    return proximo;
  });
  const alternarTodas = () => setDesmarcadas(todasMarcadas ? new Set(linhasDeConta.map(c => c.id)) : new Set());

  const formatoEscolhido = FORMATOS.find(f => f.id === formato)!;
  const resumoBaixo = `${formatoEscolhido.nome} (.${formato}) · ${recorte?.rotulo ?? "escolha as datas"}${situacao !== "todos" ? ` · somente ${situacao === "Pago" ? "pagos" : "pendentes"}` : ""}`;
  const resumoAlto = !recorte
    ? "Informe o período"
    : selecionadas.length === 0
      ? "Nenhuma conta selecionada"
      : `${totalSelecionado.toLocaleString("pt-BR")} lançamento${totalSelecionado === 1 ? "" : "s"} · ${todasMarcadas ? "todas as contas" : `${selecionadas.length} ${selecionadas.length === 1 ? "conta" : "contas"}`}`;

  const exportar = async () => {
    if (!recorte || selecionadas.length === 0) return;
    setGerando(true);
    try {
      const dados = await utils.transactions.exportar.fetch({ start: recorte.start, end: recorte.end, status: situacao, accountIds: selecionadas.map(c => c.id) });
      if (dados.items.length === 0) { toast.info("Não há lançamentos nesse recorte."); return; }
      const nome = `lancamentos-${recorte.start}-a-${recorte.end}${situacao !== "todos" ? `-${situacao.toLowerCase()}` : ""}`;
      const tabela = montarTabela(dados.items, incluir);
      if (formato === "csv") baixarCsv(tabela, `${nome}.csv`);
      else if (formato === "xlsx") await baixarXlsx(tabela, `${nome}.xlsx`, recorte.rotulo);
      else imprimirPdf(tabela, { titulo: "Lançamentos", periodo: recorte.rotulo, situacao, contas: selecionadas.map(c => c.nome) });
      if (dados.truncado) toast.warning(`O arquivo tem as primeiras ${dados.items.length.toLocaleString("pt-BR")} linhas de ${dados.total.toLocaleString("pt-BR")}. Reduza o período para exportar tudo.`);
      else toast.success(formato === "pdf" ? "Relatório aberto para impressão" : "Arquivo gerado");
      onExportado();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível exportar");
    } finally {
      setGerando(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="exportar-title" className="drawer-backdrop-enter fixed inset-0 z-[80] flex justify-end bg-[#07150d]/45 p-3 backdrop-blur-[3px] sm:p-4" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="drawer-enter flex h-full w-full max-w-[560px] flex-col overflow-hidden rounded-[20px] bg-white text-[#0B1F14] shadow-[0_24px_60px_rgba(11,31,20,.22)]">
        <div className="flex shrink-0 items-start gap-3 border-b border-[#F1F4F2] px-[22px] pb-[18px] pt-[22px]">
          <ModalIcon icon={DownloadIcon} />
          <div className="min-w-0 flex-1">
            <h2 id="exportar-title" className="text-[17px] font-bold tracking-[-.01em]">Exportar lançamentos</h2>
            <p className="mt-0.5 text-[12.5px] leading-[1.45] text-[#8A968D]">escolha as contas, o período e o formato do arquivo</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#F1F4F2] text-[#28382E] transition hover:bg-[#E3EBE6]"><CloseIcon size={15} /></button>
        </div>

        {/* Cada bloco mantém a altura (shrink-0): sem isso o flex os esmagava em vez de deixar a área rolar. */}
        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[22px] py-5 [&>*]:shrink-0">
          <div className="flex flex-col gap-[9px]">
            <div className="flex items-baseline gap-2.5">
              <span className={rotulo}>Contas bancárias</span>
              <button type="button" onClick={alternarTodas} className="ml-auto whitespace-nowrap text-[11.5px] font-bold text-[#0A7A42] hover:underline">{todasMarcadas ? "Desmarcar todas" : "Marcar todas"}</button>
            </div>
            <div className="flex flex-col gap-[7px]">
              {linhasDeConta.length === 0 && <p className="rounded-[12px] bg-[#F8FAF9] p-3 text-[12.5px] text-[#8A968D]">Nenhuma conta cadastrada.</p>}
              {linhasDeConta.map(c => {
                const on = !desmarcadas.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => alternar(c.id)}
                    className={`flex items-center gap-[11px] rounded-[12px] px-[13px] py-[11px] text-left transition ${on ? "bg-[#F1FBF6] ring-[1.5px] ring-[#12B85C]" : "bg-white ring-1 ring-[#E3EBE6] hover:bg-[#F8FAF9]"}`}
                  >
                    <span className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-[6px] ${on ? "bg-[#12B85C]" : "bg-white ring-[1.5px] ring-[#C9D4CD]"}`}>
                      {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4"><path d="M20 6L9 17l-5-5" /></svg>}
                    </span>
                    <BankMark institution={c.detalhe || c.nome} color={c.cor} size="compact" fallback={c.nome.slice(0, 2).toUpperCase()} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b className="truncate text-[13.5px] font-semibold">{c.nome}</b>
                      {c.detalhe && <span className="truncate text-[11.5px] text-[#8A968D]">{c.detalhe}</span>}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-[12px] text-[#4C6355]">{resumo.isLoading ? "…" : `${c.count.toLocaleString("pt-BR")} lanç.`}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-[9px]">
              <span className={rotulo}>Período</span>
              <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)} className={sel}>
                {PERIODOS.map(([valor, nome]) => <option key={valor} value={valor}>{valor === "ano" ? `Ano de ${mes.year}` : nome}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-[9px]">
              <span className={rotulo}>Situação</span>
              <select value={situacao} onChange={e => setSituacao(e.target.value as Situacao)} className={sel}>
                <option value="todos">Todos os lançamentos</option>
                <option value="Pago">Somente pagos</option>
                <option value="Pendente">Somente pendentes</option>
              </select>
            </label>
          </div>
          {periodo === "personalizado" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-[9px]"><span className={rotulo}>De</span><input type="date" value={custom.de} onChange={e => setCustom(c => ({ ...c, de: e.target.value }))} className="h-11 rounded-[12px] border border-[#E3EBE6] px-3.5 text-[13.5px] outline-none focus:ring-2 focus:ring-[#12B85C]" /></label>
              <label className="flex flex-col gap-[9px]"><span className={rotulo}>Até</span><input type="date" value={custom.ate} onChange={e => setCustom(c => ({ ...c, ate: e.target.value }))} className="h-11 rounded-[12px] border border-[#E3EBE6] px-3.5 text-[13.5px] outline-none focus:ring-2 focus:ring-[#12B85C]" /></label>
            </div>
          )}

          <div className="flex flex-col gap-[9px]">
            <span className={rotulo}>Formato do arquivo</span>
            <div className="grid grid-cols-3 gap-2">
              {FORMATOS.map(f => {
                const on = formato === f.id;
                return (
                  <button key={f.id} type="button" aria-pressed={on} onClick={() => setFormato(f.id)} className={`flex flex-col items-start gap-[7px] rounded-[12px] p-[13px] text-left transition ${on ? "bg-[#F1FBF6] ring-[1.5px] ring-[#12B85C]" : "bg-white ring-1 ring-[#E3EBE6] hover:bg-[#F8FAF9]"}`}>
                    <span className={`flex h-[30px] w-[30px] items-center justify-center rounded-[9px] ${on ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#F1F4F2] text-[#4C6355]"}`}><IconeFormato formato={f.id} /></span>
                    <span className={`text-[13px] font-bold ${on ? "text-[#0A7A42]" : ""}`}>{f.nome}</span>
                    <span className="text-[11.5px] leading-[1.4] text-[#8A968D]">{f.descricao}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-[9px]">
            <span className={rotulo}>Incluir no arquivo</span>
            <div className="flex flex-col gap-2">
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#28382E]"><input type="checkbox" checked={incluir.classificacao} onChange={e => setIncluir(i => ({ ...i, classificacao: e.target.checked }))} className="h-[17px] w-[17px] accent-[#12B85C]" /> Categoria e centro de custo</label>
              <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#28382E]"><input type="checkbox" checked={incluir.contato} onChange={e => setIncluir(i => ({ ...i, contato: e.target.checked }))} className="h-[17px] w-[17px] accent-[#12B85C]" /> Contato e anexo</label>
              {selecionadas.length > 1 && (
                <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-[#28382E]"><input type="checkbox" checked={incluir.totais} onChange={e => setIncluir(i => ({ ...i, totais: e.target.checked }))} className="h-[17px] w-[17px] accent-[#12B85C]" /> Linha de totais por conta</label>
              )}
            </div>
          </div>

          <div className="flex gap-2.5 rounded-[12px] bg-[#F8FAF9] px-3.5 py-3 text-[12.5px] leading-[1.5] text-[#4C6355]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4C6355" strokeWidth="2" className="mt-px shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 16v-5" /><path d="M12 8h.01" /></svg>
            <span>
              {formato === "pdf"
                ? <>O <b className="text-[#28382E]">PDF</b> sai com o layout do relatório e abre na impressão do navegador, onde você escolhe “Salvar como PDF”. Para editar os dados, use Excel ou CSV.</>
                : <>O arquivo traz até <b className="text-[#28382E]">{(resumo.data?.limite ?? 20_000).toLocaleString("pt-BR")} lançamentos</b>. Acima disso, reduza o período e exporte em partes.</>}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 border-t border-[#F1F4F2] bg-[#F8FAF9] px-[22px] py-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <b className="truncate text-[13px] font-bold">{resumoAlto}</b>
            <span className="truncate text-[11.5px] text-[#8A968D]">{resumoBaixo}</span>
          </div>
          <button type="button" onClick={onClose} className="h-11 whitespace-nowrap rounded-[12px] border border-[#E3EBE6] bg-white px-[18px] text-[13.5px] font-semibold text-[#28382E] transition hover:bg-[#F1F4F2]">Cancelar</button>
          <button type="button" disabled={gerando || !recorte || selecionadas.length === 0 || totalSelecionado === 0} onClick={exportar} className="flex h-11 items-center gap-2 whitespace-nowrap rounded-[12px] bg-[#12B85C] px-5 text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:cursor-not-allowed disabled:bg-[#E3EBE6] disabled:text-[#8A968D]">
            <DownloadIcon size={16} />{gerando ? "Gerando…" : "Exportar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconeFormato({ formato }: { formato: Formato }) {
  if (formato === "xlsx") return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 9v12" /></svg>;
  if (formato === "csv") return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V6z" /><path d="M14 2v4h5" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>;
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V6z" /><path d="M14 2v4h5" /><path d="M8 17h8" /><path d="M8 13h3" /></svg>;
}

/* ------------------------------------------------------------------------ */
/* Montagem do arquivo                                                       */

type Linha = {
  transactionDate: string;
  type: string;
  description: string;
  contact: string;
  category: string;
  costCenter: string;
  account: string;
  status: string;
  amount: number;
  attachmentName: string | null;
};

type Tabela = { cabecalho: string[]; linhas: Array<Array<string | number>>; colunaValor: number };

const TIPO: Record<string, string> = { entrada: "Entrada", saida: "Saída", transferencia: "Transferência" };

/** As colunas do arquivo, na ordem, com as linhas de total por conta quando pedidas. */
function montarTabela(items: Linha[], incluir: { classificacao: boolean; contato: boolean; totais: boolean }): Tabela {
  const cabecalho = ["Data", "Tipo", "Descrição"];
  if (incluir.contato) cabecalho.push("Contato");
  if (incluir.classificacao) cabecalho.push("Categoria", "Centro de custo");
  cabecalho.push("Conta", "Situação", "Valor");
  if (incluir.contato) cabecalho.push("Anexo");
  const colunaValor = cabecalho.indexOf("Valor");

  const linhaDe = (t: Linha): Array<string | number> => {
    const l: Array<string | number> = [dataBr(t.transactionDate), TIPO[t.type] ?? t.type, t.description];
    if (incluir.contato) l.push(t.contact);
    if (incluir.classificacao) l.push(t.category, t.costCenter);
    l.push(t.account || "Sem conta", t.status, t.amount);
    if (incluir.contato) l.push(t.attachmentName ?? "");
    return l;
  };

  const ordenados = [...items].sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.account.localeCompare(b.account));
  if (!incluir.totais) return { cabecalho, linhas: ordenados.map(linhaDe), colunaValor };

  const linhas: Array<Array<string | number>> = [];
  const porConta = new Map<string, Linha[]>();
  for (const t of ordenados) {
    const chave = t.account || "Sem conta";
    porConta.set(chave, [...(porConta.get(chave) ?? []), t]);
  }
  for (const [conta, doGrupo] of [...porConta.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))) {
    for (const t of doGrupo) linhas.push(linhaDe(t));
    const total = doGrupo.reduce((s, t) => s + t.amount, 0);
    const linhaTotal: Array<string | number> = cabecalho.map(() => "");
    linhaTotal[2] = `Total · ${conta}`;
    linhaTotal[colunaValor] = Math.round(total * 100) / 100;
    linhas.push(linhaTotal);
  }
  return { cabecalho, linhas, colunaValor };
}

function baixar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

function baixarCsv(tabela: Tabela, nome: string) {
  const celula = (v: string | number, i: number) => {
    if (typeof v === "number") return v.toFixed(2).replace(".", ",");
    return `"${String(v).replace(/"/g, '""')}"`;
  };
  const csv = [tabela.cabecalho, ...tabela.linhas].map(l => l.map(celula).join(";")).join("\n");
  baixar(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }), nome);
}

async function baixarXlsx(tabela: Tabela, nome: string, periodo: string) {
  const XLSX = await import("xlsx");
  const folha = XLSX.utils.aoa_to_sheet([tabela.cabecalho, ...tabela.linhas]);
  /* Valor como número com duas casas: a coluna soma no Excel sem conversão. */
  const linhas = tabela.linhas.length;
  for (let r = 1; r <= linhas; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: tabela.colunaValor });
    const celula = folha[ref];
    if (celula && typeof celula.v === "number") celula.z = "#,##0.00";
  }
  folha["!cols"] = tabela.cabecalho.map(h => ({ wch: h === "Descrição" ? 40 : h === "Categoria" ? 28 : h === "Data" ? 11 : 16 }));
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, folha, "Lançamentos");
  const saida = XLSX.write(livro, { bookType: "xlsx", type: "array" });
  baixar(new Blob([saida], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nome);
  void periodo;
}

function escapar(texto: string) {
  return texto.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c] ?? c);
}

/** O relatório numa janela nova, pronta para imprimir ou salvar como PDF. */
function imprimirPdf(tabela: Tabela, meta: { titulo: string; periodo: string; situacao: Situacao; contas: string[] }) {
  const janela = window.open("", "_blank", "width=1100,height=800");
  if (!janela) { toast.error("O navegador bloqueou a janela do relatório. Permita pop-ups para este site."); return; }
  const total = tabela.linhas.filter(l => !String(l[2]).startsWith("Total · ")).reduce((s, l) => s + Number(l[tabela.colunaValor] || 0), 0);
  const cabecalho = tabela.cabecalho.map((h, i) => `<th class="${i === tabela.colunaValor ? "num" : ""}">${escapar(h)}</th>`).join("");
  const corpo = tabela.linhas.map(l => {
    const totalLinha = String(l[2]).startsWith("Total · ");
    return `<tr class="${totalLinha ? "total" : ""}">${l.map((v, i) => {
      if (i === tabela.colunaValor) { const n = Number(v); return `<td class="num ${n < 0 ? "neg" : "pos"}">${v === "" ? "" : formatMoney(n)}</td>`; }
      return `<td>${escapar(String(v))}</td>`;
    }).join("")}</tr>`;
  }).join("");
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapar(meta.titulo)} · ${escapar(meta.periodo)}</title>
<style>
  body{font-family:Roboto,"Helvetica Neue",Arial,sans-serif;color:#0B1F14;margin:28px}
  h1{font-size:20px;margin:0 0 4px}
  .sub{font-size:12px;color:#4C6355;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  th{text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#8A968D;border-bottom:1px solid #E3EBE6;padding:6px 6px}
  td{padding:6px;border-bottom:1px solid #F1F4F2;vertical-align:top}
  .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .pos{color:#0A7A42}.neg{color:#B3261E}
  tr.total td{font-weight:700;background:#F8FAF9}
  .rodape{margin-top:14px;display:flex;justify-content:space-between;font-size:12px;color:#4C6355}
  @media print{body{margin:12mm} tr{page-break-inside:avoid}}
</style></head><body>
<h1>${escapar(meta.titulo)}</h1>
<div class="sub">${escapar(meta.periodo)}${meta.situacao !== "todos" ? ` · somente ${meta.situacao === "Pago" ? "pagos" : "pendentes"}` : ""} · ${escapar(meta.contas.join(", "))}</div>
<table><thead><tr>${cabecalho}</tr></thead><tbody>${corpo}</tbody></table>
<div class="rodape"><span>${tabela.linhas.filter(l => !String(l[2]).startsWith("Total · ")).length.toLocaleString("pt-BR")} lançamentos</span><span>Resultado do recorte: <b class="${total < 0 ? "neg" : "pos"}">${formatMoney(total)}</b></span></div>
<script>window.addEventListener("load",()=>{setTimeout(()=>window.print(),150)});</script>
</body></html>`);
  janela.document.close();
}
