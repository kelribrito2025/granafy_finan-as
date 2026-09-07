import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CloseIcon,
  DocumentIcon,
  UploadIcon,
} from "@/components/IconlyIcons";
import { trpc } from "@/lib/trpc";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type TransactionType = "entrada" | "saida";

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

export default function ImportTransactionsModal({ onClose, onImported, onManageOrganization }: ImportTransactionsModalProps) {
  const optionsQuery = trpc.organization.options.useQuery();
  const previewMutation = trpc.imports.preview.useMutation();
  const confirmMutation = trpc.imports.confirm.useMutation();
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<"csv" | "ofx">("ofx");
  const [accountId, setAccountId] = useState("");
  const [incomeCategoryId, setIncomeCategoryId] = useState("");
  const [expenseCategoryId, setExpenseCategoryId] = useState("");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [step, setStep] = useState<"setup" | "preview">("setup");
  const [result, setResult] = useState<{ importedCount: number; duplicateCount: number } | null>(null);
  const options = optionsQuery.data ?? { accounts: [], categories: [] };
  const selectedRows = rows.filter(row => row.selected && !row.duplicate);
  const selectedTotal = selectedRows.reduce((sum, row) => sum + row.amount, 0);
  const allSelected = selectedRows.length > 0 && rows.filter(row => !row.duplicate).every(row => row.selected);
  const incomeCategories = useMemo(() => options.categories.filter(category => category.type === "entrada" || category.type === "ambos"), [options.categories]);
  const expenseCategories = useMemo(() => options.categories.filter(category => category.type === "saida" || category.type === "ambos"), [options.categories]);

  useEffect(() => {
    if (!accountId && options.accounts.length === 1) setAccountId(String(options.accounts[0].id));
    if (!incomeCategoryId && incomeCategories[0]) setIncomeCategoryId(String(incomeCategories[0].id));
    if (!expenseCategoryId && expenseCategories[0]) setExpenseCategoryId(String(expenseCategories[0].id));
  }, [accountId, expenseCategories, expenseCategoryId, incomeCategories, incomeCategoryId, options.accounts]);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    const extension = selected.name.split(".").pop()?.toLowerCase();
    if (extension !== "csv" && extension !== "ofx") {
      toast.error("Selecione um arquivo .OFX ou .CSV");
      event.target.value = "";
      return;
    }
    if (selected.size > 5_000_000) {
      toast.error("O arquivo deve ter no máximo 5 MB");
      event.target.value = "";
      return;
    }
    setFile(selected);
    setFormat(extension);
    setRows([]);
  };

  const preview = async () => {
    if (!file || !accountId || !incomeCategoryId || !expenseCategoryId) return toast.error("Selecione arquivo, conta e as categorias de receita e despesa");
    try {
      const content = decodeFile(await file.arrayBuffer());
      const response = await previewMutation.mutateAsync({
        fileName: file.name,
        format,
        content,
        accountId: Number(accountId),
        incomeCategoryId: Number(incomeCategoryId),
        expenseCategoryId: Number(expenseCategoryId),
        classification: "auto",
      });
      setRows(response.rows.map(row => ({ ...row, selected: !row.duplicate })));
      setStep("preview");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo");
    }
  };

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

  const confirm = async () => {
    if (!file || selectedRows.length === 0) return toast.error("Selecione ao menos um lançamento novo");
    try {
      const response = await confirmMutation.mutateAsync({
        fileName: file.name,
        format,
        accountId: Number(accountId),
        duplicateCount: rows.filter(row => row.duplicate).length,
        rows: selectedRows.map(({ categoryName: _categoryName, duplicate: _duplicate, selected: _selected, ...row }) => row),
      });
      setResult(response);
      await onImported();
      toast.success(`${response.importedCount} lançamento${response.importedCount === 1 ? " importado" : "s importados"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir a importação");
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07150d]/50 p-3 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="modal-enter flex max-h-[calc(100vh-24px)] w-full max-w-[980px] flex-col overflow-hidden rounded-[22px] bg-white text-[#0B1F14]">
        <header className="flex items-start gap-4 border-b border-[#E8EEEA] px-5 py-4 sm:px-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#DFF6EA] text-[#0A7A42]"><UploadIcon size={20} /></span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Importação bancária</p>
            <h2 id="import-title" className="mt-0.5 text-xl font-bold">{result ? "Importação concluída" : step === "setup" ? "Importar OFX ou CSV" : "Revise os lançamentos"}</h2>
            <p className="mt-0.5 text-[11.5px] text-[#8A968D]">{result ? "Os dados já estão disponíveis no seu extrato." : step === "setup" ? "Créditos e débitos do OFX são reconhecidos automaticamente." : "Confira natureza e categoria antes de gravar."}</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355] hover:bg-[#E8EEEA]"><CloseIcon size={17} /></button>
        </header>

        {result ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center p-6 text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#DFF6EA] text-[#0A7A42]"><CheckIcon size={30} /></span>
            <strong className="mt-5 text-2xl">{result.importedCount} lançamento{result.importedCount === 1 ? "" : "s"} importado{result.importedCount === 1 ? "" : "s"}</strong>
            <p className="mt-2 text-[12.5px] text-[#718077]">{result.duplicateCount > 0 ? `${result.duplicateCount} duplicata${result.duplicateCount === 1 ? " foi ignorada" : "s foram ignoradas"}.` : "Nenhuma duplicata foi encontrada."}</p>
            <button type="button" onClick={onClose} className="mt-6 rounded-xl bg-[#12B85C] px-6 py-3 text-[13px] font-bold text-white">Ver lançamentos</button>
          </div>
        ) : step === "setup" ? (
          <div className="overflow-y-auto p-5 sm:p-6">
            <div className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
              <div>
                <label className={`flex min-h-[210px] w-full cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed p-6 text-center transition ${file ? "border-[#12B85C] bg-[#F1FBF6]" : "border-[#C9D5CD] bg-[#F8FAF9] hover:border-[#12B85C]"}`}>
                  <input aria-label="Selecionar arquivo OFX ou CSV" type="file" accept=".ofx,.csv,text/csv,application/x-ofx" onChange={chooseFile} className="sr-only" />
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#0A7A42] ring-1 ring-[#DDE8E1]"><DocumentIcon size={23} /></span>
                  <strong className="mt-4 text-[14px]">{file?.name ?? "Selecione seu arquivo bancário"}</strong>
                  <span className="mt-1 text-[11.5px] text-[#8A968D]">{file ? `${(file.size / 1024).toFixed(1)} KB · ${format.toUpperCase()}` : "OFX ou CSV · máximo de 5 MB"}</span>
                  <span className="mt-4 rounded-[10px] bg-[#0B1F14] px-4 py-2 text-[11.5px] font-bold text-white">{file ? "Trocar arquivo" : "Escolher arquivo"}</span>
                </label>
                <div className="mt-3 rounded-xl bg-[#FFF8E8] p-3 text-[11px] leading-5 text-[#7A5A14]"><strong>Classificação automática:</strong> crédito usa a categoria de receita; débito usa a categoria de despesa. Na revisão você poderá ajustar cada lançamento.</div>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Formato</span>
                  <div className="grid grid-cols-2 rounded-xl bg-[#F1F4F2] p-1">{(["ofx", "csv"] as const).map(value => <button key={value} type="button" onClick={() => setFormat(value)} className={`rounded-[9px] py-2.5 text-[11.5px] font-bold uppercase ${format === value ? "bg-white text-[#0A7A42]" : "text-[#718077]"}`}>{value}</button>)}</div>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Conta de destino</span>
                  <select value={accountId} onChange={event => setAccountId(event.target.value)} className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[12.5px] outline-none ring-1 ring-[#E1E8E3] focus:ring-2 focus:ring-[#12B85C]"><option value="">Selecione a conta</option>{options.accounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.institution ? ` · ${account.institution}` : ""}</option>)}</select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#0A7A42]">Categoria para entradas · Receitas</span>
                  <select value={incomeCategoryId} onChange={event => setIncomeCategoryId(event.target.value)} className="h-11 w-full rounded-xl bg-[#F1FBF6] px-3.5 text-[12.5px] outline-none ring-1 ring-[#BDE8CF] focus:ring-2 focus:ring-[#12B85C]"><option value="">Selecione a categoria de receita</option>{incomeCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#B3261E]">Categoria para saídas · Despesas</span>
                  <select value={expenseCategoryId} onChange={event => setExpenseCategoryId(event.target.value)} className="h-11 w-full rounded-xl bg-[#FFF8F7] px-3.5 text-[12.5px] outline-none ring-1 ring-[#F1C7C2] focus:ring-2 focus:ring-[#E5533D]"><option value="">Selecione a categoria de despesa</option>{expenseCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
                </label>
                {optionsQuery.isLoading && <p className="text-[11px] text-[#8A968D]">Carregando suas contas e categorias...</p>}
                {!optionsQuery.isLoading && (options.accounts.length === 0 || incomeCategories.length === 0 || expenseCategories.length === 0) && <div className="rounded-xl bg-[#FDECEA] p-3"><strong className="block text-[11.5px] text-[#8E1F16]">Cadastre antes de importar</strong><p className="mt-1 text-[10.5px] leading-4 text-[#9D5A54]">Você precisa de uma conta e categorias ativas de receita e despesa.</p><button type="button" onClick={onManageOrganization} className="mt-2 text-[11px] font-bold text-[#8E1F16]">Gerenciar agora</button></div>}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2.5"><button type="button" onClick={onClose} className="rounded-xl bg-[#F1F4F2] px-5 py-3 text-[12.5px] font-bold text-[#4C6355]">Cancelar</button><button type="button" disabled={previewMutation.isPending || !file || !accountId || !incomeCategoryId || !expenseCategoryId} onClick={preview} className="rounded-xl bg-[#12B85C] px-5 py-3 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">{previewMutation.isPending ? "Analisando..." : "Revisar lançamentos"}</button></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 border-b border-[#E8EEEA] bg-[#F8FAF9] px-5 py-3 sm:grid-cols-4 sm:px-6">
              <div><span className="block text-[9.5px] text-[#8A968D]">Arquivo</span><strong className="block truncate text-[11.5px]">{file?.name}</strong></div>
              <div><span className="block text-[9.5px] text-[#8A968D]">Selecionados</span><strong className="text-[11.5px]">{selectedRows.length} de {rows.length}</strong></div>
              <div><span className="block text-[9.5px] text-[#8A968D]">Duplicatas</span><strong className="text-[11.5px] text-[#B87500]">{rows.filter(row => row.duplicate).length}</strong></div>
              <div><span className="block text-[9.5px] text-[#8A968D]">Total líquido</span><strong className={`text-[11.5px] ${selectedTotal >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(selectedTotal)}</strong></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-[#E8EEEA] px-5 py-2.5 sm:px-6">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-[.06em] text-[#8A968D]">Aplicar a todos</span>
              <button type="button" onClick={() => applyTypeToAll("entrada")} className="rounded-lg bg-[#DFF6EA] px-3 py-2 text-[10.5px] font-bold text-[#0A7A42]">Receitas</button>
              <button type="button" onClick={() => applyTypeToAll("saida")} className="rounded-lg bg-[#FDECEA] px-3 py-2 text-[10.5px] font-bold text-[#B3261E]">Despesas</button>
              <span className="ml-auto text-[10px] text-[#8A968D]">Também é possível ajustar uma linha por vez.</span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[920px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-white"><tr className="border-b border-[#E8EEEA] text-[10px] uppercase tracking-[.04em] text-[#8A968D]"><th className="w-12 px-5 py-3"><input aria-label="Selecionar todos" type="checkbox" checked={allSelected} onChange={() => setRows(current => current.map(row => row.duplicate ? row : { ...row, selected: !allSelected }))} className="h-4 w-4 accent-[#12B85C]" /></th><th className="w-24 py-3">Data</th><th className="min-w-[220px] py-3">Descrição</th><th className="w-28 py-3">Natureza</th><th className="w-48 py-3">Categoria</th><th className="w-28 py-3 text-right">Valor</th><th className="w-24 px-5 py-3 text-center">Situação</th></tr></thead>
                <tbody>{rows.map((row, index) => <tr key={`${row.fingerprint}-${index}`} className={`border-b border-[#EDF1EE] text-[11.5px] ${row.duplicate ? "bg-[#FFF9EB] opacity-70" : row.selected ? "bg-[#F8FCFA]" : ""}`}>
                  <td className="px-5 py-2.5"><input aria-label={`Selecionar linha ${row.sourceIndex}`} disabled={row.duplicate} type="checkbox" checked={row.selected} onChange={() => setRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, selected: !item.selected } : item))} className="h-4 w-4 accent-[#12B85C]" /></td>
                  <td className="py-2.5"><input aria-label={`Data da linha ${row.sourceIndex}`} type="date" value={row.transactionDate} disabled={row.duplicate} onChange={event => setRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, transactionDate: event.target.value } : item))} className="w-[116px] bg-transparent text-[11px] outline-none disabled:cursor-not-allowed" /></td>
                  <td className="py-2.5 pr-3"><div className="flex items-center gap-2"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${row.type === "saida" ? "bg-[#FDECEA] text-[#B3261E]" : "bg-[#DFF6EA] text-[#0A7A42]"}`}>{row.type === "saida" ? <ArrowDownIcon size={14} /> : <ArrowUpIcon size={14} />}</span><input aria-label={`Descrição da linha ${row.sourceIndex}`} value={row.description} disabled={row.duplicate} onChange={event => setRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} className="min-w-0 flex-1 bg-transparent font-semibold outline-none disabled:cursor-not-allowed" /></div></td>
                  <td className="py-2.5 pr-3"><select aria-label={`Natureza da linha ${row.sourceIndex}`} value={row.type} disabled={row.duplicate} onChange={event => updateRowType(index, event.target.value as TransactionType)} className={`h-8 w-full rounded-lg px-2 text-[10.5px] font-bold outline-none disabled:cursor-not-allowed ${row.type === "entrada" ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FDECEA] text-[#B3261E]"}`}><option value="entrada">Receita</option><option value="saida">Despesa</option></select></td>
                  <td className="py-2.5 pr-3"><select aria-label={`Categoria da linha ${row.sourceIndex}`} value={row.categoryId} disabled={row.duplicate} onChange={event => { const id = Number(event.target.value); const categoryName = options.categories.find(category => category.id === id)?.name ?? row.categoryName; setRows(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, categoryId: id, categoryName } : item)); }} className="h-8 w-full rounded-lg bg-[#F1F4F2] px-2 text-[10.5px] outline-none disabled:cursor-not-allowed">{options.categories.filter(category => category.type === "ambos" || category.type === row.type).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></td>
                  <td className={`py-2.5 text-right font-bold ${row.type === "entrada" ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(row.amount)}</td>
                  <td className="px-5 py-2.5 text-center">{row.duplicate ? <span className="rounded-md bg-[#FFF0C9] px-2 py-1 text-[9.5px] font-bold text-[#936000]">Duplicata</span> : <span className="rounded-md bg-[#DFF6EA] px-2 py-1 text-[9.5px] font-bold text-[#0A7A42]">Novo</span>}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <footer className="flex flex-wrap items-center gap-2.5 border-t border-[#E8EEEA] bg-white px-5 py-4 sm:px-6"><button type="button" onClick={() => setStep("setup")} className="rounded-xl bg-[#F1F4F2] px-4 py-2.5 text-[12px] font-bold text-[#4C6355]">Voltar</button><p className="mr-auto text-[10.5px] text-[#8A968D]">Somente itens selecionados e ainda não importados serão salvos.</p><button type="button" disabled={confirmMutation.isPending || selectedRows.length === 0} onClick={confirm} className="rounded-xl bg-[#12B85C] px-5 py-2.5 text-[12px] font-bold text-white disabled:opacity-45">{confirmMutation.isPending ? "Importando..." : `Importar ${selectedRows.length} lançamento${selectedRows.length === 1 ? "" : "s"}`}</button></footer>
          </>
        )}
      </section>
    </div>
  );
}
