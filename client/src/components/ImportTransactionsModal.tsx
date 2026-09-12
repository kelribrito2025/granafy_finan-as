import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CloseIcon,
  DocumentIcon,
  PlusIcon,
  UploadIcon,
} from "@/components/IconlyIcons";
import { currencyInputToNumber, formatCurrencyInput } from "@/lib/currency";
import { defaultCategoryId, PREFERRED_INCOME_ROOT } from "@/lib/defaultCategory";
import { trpc } from "@/lib/trpc";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { useLocation } from "wouter";

type TransactionType = "entrada" | "saida";
const MAX_IMPORT_FILE_BYTES = 25_000_000;
const PREVIEW_PAGE_SIZE = 100;

/** As colunas da prévia que aceitam ordenação, no nome do campo da linha. */
type SortKey = "transactionDate" | "description" | "type" | "categoryName" | "amount";
type SortState = { key: SortKey; direction: "asc" | "desc" } | null;

/* "Pão" antes de "Pagamento" só com collator: em pt-BR o acento não é letra nova. */
const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

type PreviewRow = {
  sourceIndex: number;
  transactionDate: string;
  description: string;
  contact: string;
  amount: number;
  type: TransactionType;
  externalId: string | null;
  fingerprint: string;
  categoryId: number;
  categoryName: string;
  duplicate: boolean;
  selected: boolean;
};

type ImportTransactionsModalProps = {
  onClose: () => void;
  onImported: () => Promise<void> | void;
  onManageOrganization: () => void;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function decodeFile(buffer: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

/**
 * Cabeçalho que ordena a prévia.
 *
 * O clique cicla crescente → decrescente → ordem do arquivo. O terceiro estado
 * existe porque num extrato a ordem original é informação: é a sequência em que
 * o banco lançou, e é por ela que a pessoa confere contra o papel.
 */
function SortableHeader({ column, label, sort, onSort, className }: {
  column: SortKey;
  label: string;
  sort: SortState;
  onSort: (column: SortKey) => void;
  className: string;
}) {
  const active = sort?.key === column;
  const alignRight = className.includes("text-right");
  return (
    <th className={className} aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`flex w-full items-center gap-1 text-[10px] uppercase tracking-[.04em] transition hover:text-[#0A7A42] ${alignRight ? "justify-end" : ""} ${active ? "font-bold text-[#0A7A42]" : "text-[#8A968D]"}`}
      >
        {label}
        {/* A seta some quando a coluna não ordena — três setas cinzas ao mesmo
            tempo escondem justamente qual delas está valendo. */}
        <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={active ? "" : "opacity-0"}>
          <path
            d={active && sort!.direction === "desc" ? "M2.5 4.5 6 8l3.5-3.5" : "M2.5 7.5 6 4l3.5 3.5"}
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </th>
  );
}

export default function ImportTransactionsModal({ onClose, onImported, onManageOrganization }: ImportTransactionsModalProps) {
  const optionsQuery = trpc.organization.options.useQuery();
  const previewMutation = trpc.imports.preview.useMutation();
  const confirmMutation = trpc.imports.confirm.useMutation();
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<"csv" | "ofx">("ofx");
  /*
   * O texto do arquivo, lido uma vez na escolha.
   *
   * A prévia roda sozinha assim que arquivo, conta e categorias estão
   * escolhidos — e roda de novo se qualquer um deles mudar, porque duplicata
   * depende da conta e a categoria inicial depende das duas categorias. Ler o
   * arquivo em cada rodada seria decodificar 25 MB a cada troca de select.
   */
  const [conteudo, setConteudo] = useState<string | null>(null);
  /** A combinação que a última prévia analisou — evita rodar duas vezes o mesmo. */
  const [analisado, setAnalisado] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState("");
  const [incomeCategoryId, setIncomeCategoryId] = useState("");
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  // O saldo declarado pelo arquivo viaja da prévia para a confirmação; é o que
  // a conciliação usa depois para comparar com o saldo do sistema.
  const [statementBalance, setStatementBalance] = useState<{ balance: number; asOf: string } | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [sort, setSort] = useState<SortState>(null);
  const [step, setStep] = useState<"setup" | "preview">("setup");
  const [result, setResult] = useState<{ importedCount: number; duplicateCount: number } | null>(null);
  const options = optionsQuery.data ?? { accounts: [], categories: [] };
  const selectedRows = rows.filter(row => row.selected && !row.duplicate);
  const selectedTotal = selectedRows.reduce((sum, row) => sum + row.amount, 0);
  const allSelected = selectedRows.length > 0 && rows.filter(row => !row.duplicate).every(row => row.selected);
  const previewPageCount = Math.max(1, Math.ceil(rows.length / PREVIEW_PAGE_SIZE));

  /*
   * A ordenação reordena índices, não as linhas.
   *
   * Toda edição da prévia — categoria, natureza, descrição, seleção — escreve
   * em `rows` pela posição. Se a tabela ordenasse uma cópia das linhas, a
   * posição da linha desenhada deixaria de ser a posição real e a troca de
   * categoria cairia em outro lançamento, sem aviso nenhum.
   */
  const sortedIndexes = useMemo(() => {
    const indexes = rows.map((_, index) => index);
    if (!sort) return indexes;
    const factor = sort.direction === "asc" ? 1 : -1;
    return indexes.sort((left, right) => {
      const a = rows[left];
      const b = rows[right];
      const compared = sort.key === "amount"
        ? a.amount - b.amount
        : COLLATOR.compare(a[sort.key], b[sort.key]);
      // Empate volta para a ordem do arquivo: 420 tarifas do mesmo dia com o
      // mesmo valor não podem se embaralhar a cada clique.
      return compared === 0 ? left - right : compared * factor;
    });
  }, [rows, sort]);

  const previewIndexes = sortedIndexes.slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE);

  const toggleSort = (column: SortKey) => {
    // Volta para a primeira página: ordenar e continuar na página 5 mostra o
    // meio de uma lista que a pessoa acabou de reorganizar.
    setPreviewPage(0);
    setSort(current => {
      if (current?.key !== column) return { key: column, direction: "asc" };
      return current.direction === "asc" ? { key: column, direction: "desc" } : null;
    });
  };
  const incomeCategories = useMemo(() => options.categories.filter(category => category.type === "entrada" || category.type === "ambos"), [options.categories]);
  const expenseCategories = useMemo(() => options.categories.filter(category => category.type === "saida" || category.type === "ambos"), [options.categories]);

  useEffect(() => {
    if (!accountId && options.accounts.length === 1) setAccountId(String(options.accounts[0].id));
    if (!incomeCategoryId) setIncomeCategoryId(defaultCategoryId(incomeCategories, PREFERRED_INCOME_ROOT));
    // Do lado da despesa não existe raiz óbvia num extrato: o filtro basta.
    if (!expenseCategoryId) setExpenseCategoryId(defaultCategoryId(expenseCategories));
  }, [accountId, expenseCategories, expenseCategoryId, incomeCategories, incomeCategoryId, options.accounts]);

  const aceitarArquivo = async (selected: File) => {
    const extension = selected.name.split(".").pop()?.toLowerCase();
    if (extension !== "csv" && extension !== "ofx") {
      toast.error("Selecione um arquivo .OFX ou .CSV");
      return false;
    }
    if (selected.size > MAX_IMPORT_FILE_BYTES) {
      toast.error("O arquivo deve ter no máximo 25 MB");
      return false;
    }
    setFile(selected);
    setFormat(extension);
    setRows([]);
    setStatementBalance(null);
    setAnalisado(null);
    setConteudo(decodeFile(await selected.arrayBuffer()));
    return true;
  };

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!(await aceitarArquivo(selected))) event.target.value = "";
  };

  const [arrastando, setArrastando] = useState(false);
  const soltarArquivo = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setArrastando(false);
    const selected = event.dataTransfer.files?.[0];
    if (selected) await aceitarArquivo(selected);
  };

  /*
   * O saldo digitado quando o arquivo não declara nenhum.
   *
   * CSV nunca declara, e nem todo OFX traz `LEDGERBAL`. Importar sem ele
   * deixa a conciliação do mês sem contra o que comparar — e o pior é que
   * isso não aparece: a tela só escreve "—" e a pessoa segue achando que
   * está conferido.
   */
  const [saldoDigitado, setSaldoDigitado] = useState("");

  const chaveDaAnalise = file && conteudo !== null && accountId && incomeCategoryId && expenseCategoryId
    ? `${file.name}:${file.size}:${accountId}:${incomeCategoryId}:${expenseCategoryId}`
    : null;

  useEffect(() => {
    if (!chaveDaAnalise || chaveDaAnalise === analisado || previewMutation.isPending || !file || conteudo === null) return;
    setAnalisado(chaveDaAnalise);
    previewMutation.mutateAsync({
      fileName: file.name,
      format,
      content: conteudo,
      accountId: Number(accountId),
      incomeCategoryId: Number(incomeCategoryId),
      expenseCategoryId: Number(expenseCategoryId),
      classification: "auto",
    }).then(response => {
      if (response.rows.length === 0) {
        setAnalisado(null);
        setFile(null);
        setConteudo(null);
        toast.error("O arquivo não tem nenhum lançamento");
        return;
      }
      setRows(response.rows.map(row => ({ ...row, selected: !row.duplicate })));
      setStatementBalance(response.statementBalance);
      setSaldoDigitado("");
      setPreviewPage(0);
    }).catch(error => {
      setRows([]);
      setAnalisado(null);
      setFile(null);
      setConteudo(null);
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaAnalise, analisado, previewMutation.isPending]);

  const analisada = Boolean(chaveDaAnalise) && chaveDaAnalise === analisado && !previewMutation.isPending && rows.length > 0;
  const duplicadas = rows.filter(row => row.duplicate).length;
  const creditos = rows.filter(row => row.type === "entrada").length;
  const debitos = rows.length - creditos;
  const periodo = useMemo(() => {
    if (rows.length === 0) return null;
    let menor = rows[0].transactionDate;
    let maior = rows[0].transactionDate;
    for (const row of rows) {
      if (row.transactionDate < menor) menor = row.transactionDate;
      if (row.transactionDate > maior) maior = row.transactionDate;
    }
    const curta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    return `${curta(menor)} e ${curta(maior)}`;
  }, [rows]);

  const categoryForType = (type: TransactionType, preferredId?: number) => {
    const preferred = options.categories.find(category => category.id === preferredId);
    if (preferred && (preferred.type === "ambos" || preferred.type === type)) return preferred;
    return options.categories.find(category => category.type === "ambos" || category.type === type);
  };

  const updateRowType = (index: number, type: TransactionType) => {
    const row = rows[index];
    const category = categoryForType(type, row.categoryId);
    if (!category) return toast.error(`Cadastre uma categoria de ${type === "entrada" ? "receita" : "despesa"} para continuar`);
    setRows(current => current.map((item, itemIndex) => itemIndex === index ? {
      ...item,
      type,
      amount: type === "entrada" ? Math.abs(item.amount) : -Math.abs(item.amount),
      categoryId: category.id,
      categoryName: category.name,
    } : item));
  };

  const applyTypeToAll = (type: TransactionType) => {
    const fallback = categoryForType(type);
    if (!fallback) return toast.error(`Cadastre uma categoria de ${type === "entrada" ? "receita" : "despesa"} para continuar`);
    setRows(current => current.map(item => {
      if (item.duplicate) return item;
      const category = categoryForType(type, item.categoryId) ?? fallback;
      return {
        ...item,
        type,
        amount: type === "entrada" ? Math.abs(item.amount) : -Math.abs(item.amount),
        categoryId: category.id,
        categoryName: category.name,
      };
    }));
  };

  /** A data mais recente do arquivo: é a ela que o saldo final se refere. */
  const ultimaDataDoArquivo = useMemo(
    () => rows.reduce((maior, row) => (row.transactionDate > maior ? row.transactionDate : maior), ""),
    [rows]
  );

  const confirm = async () => {
    if (!file || selectedRows.length === 0) return toast.error("Selecione ao menos um lançamento novo");
    const digitado = saldoDigitado.trim();
    let saldoFinal = statementBalance;
    if (!saldoFinal && digitado) {
      const numero = currencyInputToNumber(digitado);
      if (!Number.isFinite(numero)) return toast.error("O saldo informado não é um valor válido");
      saldoFinal = { balance: numero, asOf: ultimaDataDoArquivo };
    }
    try {
      const response = await confirmMutation.mutateAsync({
        fileName: file.name,
        format,
        accountId: Number(accountId),
        duplicateCount: rows.filter(row => row.duplicate).length,
        statementBalance: saldoFinal,
        rows: selectedRows.map(({ categoryName: _categoryName, duplicate: _duplicate, selected: _selected, ...row }) => row),
      });
      setResult(response);
      await onImported();
      toast.success(`${response.importedCount} lançamento${response.importedCount === 1 ? " importado" : "s importados"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a importação");
    }
  };

  /*
   * Os pré-requisitos: sem conta ou sem categoria de cada lado, não há como
   * importar — o servidor exige os três ids. Em vez de um aviso vermelho ao
   * lado de um formulário que não vai funcionar, o modal vira a lista do que
   * falta, com o botão que resolve cada item.
   */
  const carregandoOpcoes = optionsQuery.isLoading;
  const temConta = options.accounts.length > 0;
  const temCategorias = incomeCategories.length > 0 && expenseCategories.length > 0;
  const faltaPreRequisito = !carregandoOpcoes && (!temConta || !temCategorias);
  const pendentes = Number(!temConta) + Number(!temCategorias);

  const subtitulo = result
    ? "Os dados já estão disponíveis no seu extrato."
    : step === "preview"
      ? "Confira natureza e categoria antes de gravar."
      : faltaPreRequisito
        ? "falta um passo antes de enviar o arquivo"
        : previewMutation.isPending
          ? "Lendo o arquivo…"
          : analisada
            ? `${format.toUpperCase()} reconhecido · ${rows.length} ${rows.length === 1 ? "lançamento" : "lançamentos"}${periodo ? ` entre ${periodo}` : ""}`
            : "OFX ou CSV · o GranaFy reconhece créditos e débitos sozinho";

  const passo = step === "preview" ? 3 : analisada ? 2 : 1;
  const Pontos = () => (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      {[1, 2, 3].map(n => <span key={n} className={`h-[7px] w-[7px] rounded-full ${n <= passo ? "bg-[#12B85C]" : "bg-[#C9D4CD]"}`} />)}
      <span className="truncate text-[12px] text-[#8A968D]">Passo {passo} de 3</span>
    </div>
  );

  const selectClass = "h-[46px] w-full min-w-0 appearance-none rounded-[12px] border border-[#E3EBE6] bg-white bg-[position:right_13px_center] bg-no-repeat pl-3.5 pr-9 text-[13.5px] text-[#0B1F14] outline-none focus-visible:ring-2 focus-visible:ring-[#12B85C]";
  /* O chevron do select: um url() com espaços não vira classe utilitária, vai inline. */
  const chevron = { backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%234C6355' stroke-width='2'><path d='M6 9l6 6 6-6'/></svg>\")" };
  const rotulo = "text-[11px] font-bold uppercase tracking-[.08em] text-[#8A968D]";

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07150d]/50 p-3 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className={`modal-enter flex max-h-[calc(100dvh-24px)] w-full flex-col overflow-hidden rounded-[20px] bg-white text-[#0B1F14] shadow-[0_20px_50px_rgba(11,31,20,.24)] ${!result && step === "preview" ? "h-[calc(100dvh-24px)] max-w-[980px]" : "max-w-[520px]"}`}>
        <header className="flex shrink-0 items-start gap-3 border-b border-[#F1F4F2] px-[22px] pb-[18px] pt-[22px]">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] bg-[#DFF6EA] text-[#0A7A42]"><UploadIcon size={18} /></span>
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <h2 id="import-title" className="text-[17px] font-bold tracking-[-.01em]">{result ? "Importação concluída" : step === "preview" ? "Revise os lançamentos" : "Importar extrato"}</h2>
            <p className="text-[12.5px] leading-snug text-[#8A968D]">{subtitulo}</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[#F1F4F2] text-[#28382E] transition hover:bg-[#E3EBE6]"><CloseIcon size={15} /></button>
        </header>

        {result ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center p-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#DFF6EA] text-[#0A7A42]"><CheckIcon size={30} /></span>
            <strong className="mt-5 text-2xl">{result.importedCount} lançamento{result.importedCount === 1 ? "" : "s"} importado{result.importedCount === 1 ? "" : "s"}</strong>
            <p className="mt-2 text-[12.5px] text-[#718077]">{result.duplicateCount > 0 ? `${result.duplicateCount} duplicata${result.duplicateCount === 1 ? " foi ignorada" : "s foram ignoradas"}.` : "Nenhuma duplicata foi encontrada."}</p>
            <button type="button" onClick={onClose} className="mt-6 rounded-xl bg-[#12B85C] px-6 py-3 text-[13px] font-bold text-white">Ver lançamentos</button>
          </div>
        ) : step === "setup" ? (
          <>
            <div className="flex flex-col gap-[18px] overflow-y-auto px-[22px] py-5">
              <input ref={inputArquivo} aria-label="Selecionar arquivo OFX ou CSV" type="file" accept=".ofx,.csv,text/csv,application/x-ofx" onChange={chooseFile} className="sr-only" />

              {faltaPreRequisito && (
                <>
                  <div className="flex flex-col gap-3 rounded-[14px] border border-[#E3EBE6] bg-[#F8FAF9] p-4">
                    <span className="text-[13.5px] font-bold">Para importar você precisa de:</span>
                    <div className="flex items-center gap-[11px] text-[13px]">
                      {temConta
                        ? <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#12B85C] text-white"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg></span>
                        : <span className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px] border-[#C9D4CD] bg-white" />}
                      <span className={`min-w-0 flex-1 leading-snug ${temConta ? "text-[#4C6355]" : "font-semibold text-[#28382E]"}`}>
                        Uma conta bancária cadastrada
                        {temConta && <strong className="font-bold text-[#0A7A42]"> · {options.accounts.length === 1 ? "1 pronta" : `${options.accounts.length} prontas`}</strong>}
                      </span>
                      {!temConta && <button type="button" onClick={() => setLocation("/organizacao?nova=conta")} className="h-[34px] shrink-0 whitespace-nowrap rounded-[10px] border-[1.5px] border-[#12B85C] bg-white px-[13px] text-[12.5px] font-bold text-[#0A7A42] transition hover:bg-[#DFF6EA]">Cadastrar</button>}
                    </div>
                    <div className="flex items-center gap-[11px] text-[13px]">
                      {temCategorias
                        ? <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#12B85C] text-white"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg></span>
                        : <span className="h-[22px] w-[22px] shrink-0 rounded-full border-[1.5px] border-[#C9D4CD] bg-white" />}
                      <span className={`min-w-0 flex-1 leading-snug ${temCategorias ? "text-[#4C6355]" : "font-semibold text-[#28382E]"}`}>
                        Categorias de receita e despesa ativas
                        {temCategorias && <strong className="font-bold text-[#0A7A42]"> · {options.categories.length} prontas</strong>}
                      </span>
                      {!temCategorias && <button type="button" onClick={onManageOrganization} className="h-[34px] shrink-0 whitespace-nowrap rounded-[10px] border-[1.5px] border-[#12B85C] bg-white px-[13px] text-[12.5px] font-bold text-[#0A7A42] transition hover:bg-[#DFF6EA]">Cadastrar</button>}
                    </div>
                  </div>
                  <div className="pointer-events-none flex flex-col items-center gap-3 rounded-[16px] border-[1.5px] border-dashed border-[#B9C7BE] bg-[#F8FAF9] px-5 py-[26px] text-center opacity-45">
                    <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#E3EBE6] bg-white text-[#4C6355]"><DocumentIcon size={20} /></span>
                    <div className="flex flex-col gap-[3px]">
                      <span className="text-[14.5px] font-bold">Arraste o extrato aqui</span>
                      <span className="text-[12px] text-[#8A968D]">liberado depois de cadastrar {temConta ? "as categorias" : "a conta"}</span>
                    </div>
                  </div>
                  <span className="text-[12px] leading-relaxed text-[#8A968D]">
                    {temConta
                      ? "Categorias de receita e de despesa são o palpite inicial de cada lançamento. Depois você volta direto para esta importação."
                      : "Leva menos de um minuto: banco, tipo de conta e saldo inicial. Depois você volta direto para esta importação."}
                  </span>
                </>
              )}

              {!faltaPreRequisito && (
                <>
                  {file ? (
                    <div className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-[#12B85C] bg-[#F1FBF6] px-3.5 py-[13px]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#12B85C] text-[9.5px] font-bold tracking-[.04em] text-white">{format.toUpperCase()}</span>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13.5px] font-bold text-[#0A7A42]">{file.name}</span>
                        <span className="text-[12px] text-[#4C6355]">
                          {(file.size / 1024).toFixed(0)} KB
                          {analisada && ` · ${rows.length} ${rows.length === 1 ? "lançamento" : "lançamentos"} · ${debitos} ${debitos === 1 ? "débito" : "débitos"} e ${creditos} ${creditos === 1 ? "crédito" : "créditos"}`}
                          {previewMutation.isPending && " · lendo…"}
                        </span>
                      </div>
                      <button type="button" onClick={() => inputArquivo.current?.click()} className="shrink-0 text-[12.5px] font-bold text-[#0A7A42] hover:underline">Trocar</button>
                    </div>
                  ) : (
                    <div
                      onDragOver={event => { event.preventDefault(); setArrastando(true); }}
                      onDragLeave={() => setArrastando(false)}
                      onDrop={soltarArquivo}
                      className={`flex flex-col items-center gap-3 rounded-[16px] border-[1.5px] border-dashed px-5 py-[26px] text-center transition ${arrastando ? "border-[#12B85C] bg-[#F1FBF6]" : "border-[#B9C7BE] bg-[#F8FAF9] hover:border-[#12B85C] hover:bg-[#F1FBF6]"}`}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#E3EBE6] bg-white text-[#4C6355]"><DocumentIcon size={20} /></span>
                      <div className="flex flex-col gap-[3px]">
                        <span className="text-[14.5px] font-bold">Arraste o extrato aqui</span>
                        <span className="text-[12px] text-[#8A968D]">OFX ou CSV · até 25 MB</span>
                      </div>
                      <button type="button" onClick={() => inputArquivo.current?.click()} className="h-10 whitespace-nowrap rounded-[11px] border-[1.5px] border-[#12B85C] bg-white px-[18px] text-[13.5px] font-bold text-[#0A7A42] transition hover:bg-[#DFF6EA]">Escolher arquivo</button>
                    </div>
                  )}

                  <label className="flex min-w-0 flex-col gap-[7px]">
                    <span className={rotulo}>Conta de destino</span>
                    <select value={accountId} onChange={event => setAccountId(event.target.value)} className={selectClass} style={chevron}>
                      <option value="">Selecione a conta</option>
                      {options.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
                    </select>
                  </label>

                  <div className="flex min-w-0 flex-col gap-[7px]">
                    <span className={rotulo}>Categoria inicial · entradas e saídas</span>
                    <div className="grid grid-cols-2 gap-3">
                      <select aria-label="Categoria para entradas" value={incomeCategoryId} onChange={event => setIncomeCategoryId(event.target.value)} className={selectClass} style={chevron}>
                        <option value="">Receita</option>
                        {incomeCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                      <select aria-label="Categoria para saídas" value={expenseCategoryId} onChange={event => setExpenseCategoryId(event.target.value)} className={selectClass} style={chevron}>
                        <option value="">Despesa</option>
                        {expenseCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </div>
                    {!(analisada && duplicadas > 0) && (
                      <span className="text-[12px] leading-relaxed text-[#8A968D]">Um palpite para começar: crédito vira receita, débito vira despesa. Você ajusta lançamento por lançamento na revisão.</span>
                    )}
                  </div>

                  {analisada && duplicadas > 0 && (
                    <div className="flex gap-2.5 rounded-[12px] bg-[#F8FAF9] px-3.5 py-3 text-[12.5px] leading-relaxed text-[#4C6355]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 16v-5" /><path d="M12 8h.01" /></svg>
                      <span><strong className="text-[#28382E]">{duplicadas} {duplicadas === 1 ? "lançamento parece" : "lançamentos parecem"}</strong> já existir no GranaFy e {duplicadas === 1 ? "virá marcado como duplicado" : "virão marcados como duplicados"} na revisão.</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <footer className="flex shrink-0 items-center gap-2.5 border-t border-[#F1F4F2] bg-[#F8FAF9] px-[22px] py-4">
              {faltaPreRequisito
                ? <span className="min-w-0 flex-1 truncate text-[12px] text-[#8A968D]">{pendentes} de 2 pré-requisitos {pendentes === 1 ? "pendente" : "pendentes"}</span>
                : <Pontos />}
              <button type="button" onClick={onClose} className="h-11 shrink-0 rounded-[12px] border border-[#E3EBE6] bg-white px-[18px] text-[13.5px] font-semibold text-[#28382E] transition hover:bg-[#F1F4F2]">Cancelar</button>
              {faltaPreRequisito ? (
                <button type="button" onClick={() => (temConta ? onManageOrganization() : setLocation("/organizacao?nova=conta"))} className="flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[12px] bg-[#12B85C] px-5 text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E]">
                  <PlusIcon size={15} />
                  {temConta ? "Cadastrar categorias" : "Cadastrar conta"}
                </button>
              ) : (
                <button type="button" disabled={!analisada} onClick={() => setStep("preview")} className="h-11 shrink-0 whitespace-nowrap rounded-[12px] bg-[#12B85C] px-5 text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:cursor-not-allowed disabled:bg-[#E3EBE6] disabled:text-[#8A968D]">
                  {previewMutation.isPending ? "Lendo…" : analisada ? `Revisar ${rows.length} ${rows.length === 1 ? "lançamento" : "lançamentos"}` : "Revisar lançamentos"}
                </button>
              )}
            </footer>
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-[#E8EEEA] bg-[#F8FAF9] px-5 py-3 sm:grid-cols-4 sm:px-6">
              <div><span className="block text-[9.5px] text-[#8A968D]">Arquivo</span><strong className="block truncate text-[11.5px]">{file?.name}</strong></div>
              <div><span className="block text-[9.5px] text-[#8A968D]">Selecionados</span><strong className="text-[11.5px]">{selectedRows.length} de {rows.length}</strong></div>
              <div><span className="block text-[9.5px] text-[#8A968D]">Duplicatas</span><strong className="text-[11.5px] text-[#B87500]">{rows.filter(row => row.duplicate).length}</strong></div>
              <div><span className="block text-[9.5px] text-[#8A968D]">Total líquido</span><strong className={`text-[11.5px] ${selectedTotal >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(selectedTotal)}</strong></div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#E8EEEA] px-5 py-2.5 sm:px-6">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[.06em] text-[#8A968D]">Aplicar a todos</span>
              <button type="button" onClick={() => applyTypeToAll("entrada")} className="rounded-lg bg-[#DFF6EA] px-3 py-2 text-[10.5px] font-bold text-[#0A7A42]">Receitas</button>
              <button type="button" onClick={() => applyTypeToAll("saida")} className="rounded-lg bg-[#FDECEA] px-3 py-2 text-[10.5px] font-bold text-[#B3261E]">Despesas</button>
              <span className="ml-auto text-[10px] text-[#8A968D]">Também é possível ajustar uma linha por vez.</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[920px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-white"><tr className="border-b border-[#E8EEEA] text-[10px] uppercase tracking-[.04em] text-[#8A968D]"><th className="w-12 px-5 py-3"><input aria-label="Selecionar todos" type="checkbox" checked={allSelected} onChange={() => setRows(current => current.map(row => row.duplicate ? row : { ...row, selected: !allSelected }))} className="h-4 w-4 accent-[#12B85C]" /></th>
                  <SortableHeader column="transactionDate" label="Data" sort={sort} onSort={toggleSort} className="w-24 py-3" />
                  <SortableHeader column="description" label="Descrição" sort={sort} onSort={toggleSort} className="min-w-[220px] py-3" />
                  <SortableHeader column="type" label="Natureza" sort={sort} onSort={toggleSort} className="w-28 py-3" />
                  <SortableHeader column="categoryName" label="Categoria" sort={sort} onSort={toggleSort} className="w-48 py-3" />
                  <SortableHeader column="amount" label="Valor" sort={sort} onSort={toggleSort} className="w-28 py-3 text-right" />
                  {/* Situação não ordena: só tem dois valores e o filtro visual
                      já separa duplicata de novo pela cor da linha. */}
                  <th className="w-24 px-5 py-3 text-center">Situação</th>
                </tr></thead>
                <tbody>{previewIndexes.map(index => { const row = rows[index]; return <tr key={`${row.fingerprint}-${index}`} className={`border-b border-[#EDF1EE] text-[11.5px] ${row.duplicate ? "bg-[#FFF9EB] opacity-70" : row.selected ? "bg-[#F8FCFA]" : ""}`}>
                  <td className="px-5 py-2.5"><input aria-label={`Selecionar linha ${row.sourceIndex}`} disabled={row.duplicate} type="checkbox" checked={row.selected} onChange={() => setRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, selected: !item.selected } : item))} className="h-4 w-4 accent-[#12B85C]" /></td>
                  <td className="py-2.5"><input aria-label={`Data da linha ${row.sourceIndex}`} type="date" value={row.transactionDate} disabled={row.duplicate} onChange={event => setRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, transactionDate: event.target.value } : item))} className="w-[116px] bg-transparent text-[11px] outline-none disabled:cursor-not-allowed" /></td>
                  <td className="py-2.5 pr-3"><div className="flex items-center gap-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${row.type === "saida" ? "bg-[#FDECEA] text-[#B3261E]" : "bg-[#DFF6EA] text-[#0A7A42]"}`}>{row.type === "saida" ? <ArrowDownIcon size={14} /> : <ArrowUpIcon size={14} />}</span><input aria-label={`Descrição da linha ${row.sourceIndex}`} value={row.description} disabled={row.duplicate} onChange={event => setRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} className="min-w-0 flex-1 bg-transparent font-semibold outline-none disabled:cursor-not-allowed" /></div></td>
                  <td className="py-2.5 pr-3"><select aria-label={`Natureza da linha ${row.sourceIndex}`} value={row.type} disabled={row.duplicate} onChange={event => updateRowType(index, event.target.value as TransactionType)} className={`h-8 w-full rounded-lg px-2 text-[10.5px] font-bold outline-none disabled:cursor-not-allowed ${row.type === "entrada" ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FDECEA] text-[#B3261E]"}`}><option value="entrada">Receita</option><option value="saida">Despesa</option></select></td>
                  <td className="py-2.5 pr-3"><select aria-label={`Categoria da linha ${row.sourceIndex}`} value={row.categoryId} disabled={row.duplicate} onChange={event => { const id = Number(event.target.value); const categoryName = options.categories.find(category => category.id === id)?.name ?? row.categoryName; setRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, categoryId: id, categoryName } : item)); }} className="h-8 w-full rounded-lg bg-[#F1F4F2] px-2 text-[10.5px] outline-none disabled:cursor-not-allowed">{options.categories.filter(category => category.type === "ambos" || category.type === row.type).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></td>
                  <td className={`py-2.5 text-right font-bold ${row.type === "entrada" ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(row.amount)}</td>
                  <td className="px-5 py-2.5 text-center">{row.duplicate ? <span className="rounded-md bg-[#FFF0C9] px-2 py-1 text-[9.5px] font-bold text-[#936000]">Duplicata</span> : <span className="rounded-md bg-[#DFF6EA] px-2 py-1 text-[9.5px] font-bold text-[#0A7A42]">Novo</span>}</td>
                </tr>; })}</tbody>
              </table>
            </div>
            <footer className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-[#E8EEEA] bg-white px-5 py-3 sm:px-6">
              <button type="button" onClick={() => setStep("setup")} className="rounded-xl bg-[#F1F4F2] px-4 py-2.5 text-[12px] font-bold text-[#4C6355]">Voltar</button>
              <div className="flex items-center gap-2" aria-label="Passo 3 de 3">
                {[1, 2, 3].map(n => <span key={n} className="h-[7px] w-[7px] rounded-full bg-[#12B85C]" />)}
                <span className="text-[11px] text-[#8A968D]">Passo 3 de 3</span>
              </div>
              {rows.length > PREVIEW_PAGE_SIZE && <div className="flex items-center gap-1.5 rounded-xl bg-[#F1F4F2] p-1"><button type="button" aria-label="Página anterior" disabled={previewPage === 0} onClick={() => setPreviewPage(page => Math.max(0, page - 1))} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#4C6355] disabled:opacity-35">←</button><span className="min-w-[150px] text-center text-[10.5px] font-semibold text-[#607067]">Página {previewPage + 1} de {previewPageCount} · {previewPage * PREVIEW_PAGE_SIZE + 1}–{Math.min((previewPage + 1) * PREVIEW_PAGE_SIZE, rows.length)}</span><button type="button" aria-label="Próxima página" disabled={previewPage >= previewPageCount - 1} onClick={() => setPreviewPage(page => Math.min(previewPageCount - 1, page + 1))} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#4C6355] disabled:opacity-35">→</button></div>}
              {statementBalance ? (
                <p className="mr-auto text-[10.5px] text-[#8A968D]">
                  Saldo do extrato reconhecido: <strong className="font-bold text-[#0A7A42]">{statementBalance.balance.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong> em {statementBalance.asOf.split("-").reverse().join("/")}
                </p>
              ) : (
                <label className="mr-auto flex flex-wrap items-center gap-2">
                  <span className="text-[10.5px] leading-tight text-[#8A4B00]">
                    <strong className="font-bold">Este arquivo não declara saldo.</strong> Sem ele a conciliação do mês
                    não aponta diferença. Informe o saldo do banco em {ultimaDataDoArquivo.split("-").reverse().join("/")}:
                  </span>
                  <span className="flex h-9 items-center gap-1.5 rounded-lg border border-[#E0C48A] bg-[#FFF9EB] px-2.5">
                    <span className="text-[10.5px] font-semibold text-[#8A4B00]">R$</span>
                    <input
                      inputMode="decimal"
                      value={saldoDigitado}
                      onChange={event => setSaldoDigitado(formatCurrencyInput(event.target.value))}
                      placeholder="opcional"
                      aria-label="Saldo do extrato no fim do período"
                      className="w-[92px] bg-transparent text-[12px] font-bold text-[#8A4B00] outline-none placeholder:font-normal placeholder:text-[#B08A4A]"
                    />
                  </span>
                </label>
              )}
              <button type="button" disabled={confirmMutation.isPending || selectedRows.length === 0} onClick={confirm} className="rounded-xl bg-[#12B85C] px-5 py-2.5 text-[12px] font-bold text-white disabled:opacity-45">{confirmMutation.isPending ? `Importando ${selectedRows.length}...` : `Importar ${selectedRows.length} lançamento${selectedRows.length === 1 ? "" : "s"}`}</button>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
