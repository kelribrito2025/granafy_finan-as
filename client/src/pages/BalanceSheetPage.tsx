import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  DashboardIcon,
  DeleteIcon,
  DocumentIcon,
  EditIcon,
  MenuIcon,
  PlusIcon,
  SettingsIcon,
  TrendUpIcon,
  UsersIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  currencyInputToNumber,
  formatCurrencyInput,
  formatCurrencyValue,
} from "@/lib/currency";
import { trpc } from "@/lib/trpc";
import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type NavItem = { label: string; icon: IconlyIcon; disabled?: boolean };
type BalanceGroup =
  | "ativo_circulante"
  | "ativo_nao_circulante"
  | "passivo_circulante"
  | "passivo_nao_circulante"
  | "patrimonio_liquido";
type ItemType =
  | "bem"
  | "direito"
  | "estoque"
  | "investimento"
  | "obrigacao"
  | "capital"
  | "ajuste"
  | "outro";
type ValuationMethod = "manual" | "depreciacao_linear";
type PatrimonialItem = {
  id: number;
  name: string;
  balanceGroup: BalanceGroup;
  itemType: ItemType;
  acquisitionDate: string | null;
  acquisitionValueNumber: number;
  currentValueNumber: number;
  residualValueNumber: number;
  valuationMethod: ValuationMethod;
  usefulLifeMonths: number | null;
  notes: string | null;
  isActive: boolean;
  bookValue: number;
  accumulatedDepreciation: number;
};
type PatrimonialValues = {
  name: string;
  balanceGroup: BalanceGroup;
  itemType: ItemType;
  acquisitionDate: string | null;
  acquisitionValue: number;
  currentValue: number;
  valuationMethod: ValuationMethod;
  usefulLifeMonths: number | null;
  residualValue: number;
  notes: string;
};
type Tab = "overview" | "assets" | "liabilities" | "evolution";

const panelItems: NavItem[] = [
  { label: "Visão geral", icon: DashboardIcon },
  { label: "Fluxo de caixa", icon: TrendUpIcon, disabled: true },
  { label: "Contas a pagar", icon: ArrowDownIcon, disabled: true },
  { label: "Contas a receber", icon: ArrowUpIcon, disabled: true },
  { label: "Lançamentos", icon: DocumentIcon },
  { label: "Conciliação", icon: CheckIcon, disabled: true },
];
const analysisItems: NavItem[] = [
  { label: "DRE", icon: DocumentIcon, disabled: true },
  { label: "Balanço Patrimonial", icon: ChartIcon },
  { label: "Relatórios", icon: ChartIcon, disabled: true },
  { label: "Clientes", icon: UsersIcon, disabled: true },
];
const organizationItems: NavItem[] = [
  { label: "Contas e categorias", icon: SettingsIcon },
];

const groupLabels: Record<BalanceGroup, string> = {
  ativo_circulante: "Ativo circulante",
  ativo_nao_circulante: "Ativo não circulante",
  passivo_circulante: "Passivo circulante",
  passivo_nao_circulante: "Passivo não circulante",
  patrimonio_liquido: "Patrimônio líquido informado",
};
const groupShortLabels: Record<BalanceGroup, string> = {
  ativo_circulante: "Ativo circulante",
  ativo_nao_circulante: "Ativo não circulante",
  passivo_circulante: "Passivo circulante",
  passivo_nao_circulante: "Passivo não circulante",
  patrimonio_liquido: "Patrimônio líquido",
};
const groupStyles: Record<BalanceGroup, string> = {
  ativo_circulante: "bg-[#DFF6EA] text-[#0A7A42]",
  ativo_nao_circulante: "bg-[#E9F3ED] text-[#315B44]",
  passivo_circulante: "bg-[#FDECEA] text-[#A2352A]",
  passivo_nao_circulante: "bg-[#F7EAE7] text-[#7D362F]",
  patrimonio_liquido: "bg-[#E8EDF9] text-[#395487]",
};
const typeLabels: Record<ItemType, string> = {
  bem: "Bem da empresa",
  direito: "Direito a receber",
  estoque: "Estoque",
  investimento: "Investimento",
  obrigacao: "Obrigação",
  capital: "Capital social",
  ajuste: "Ajuste patrimonial",
  outro: "Outro",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function safeError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return error.message.includes('"code"') ? fallback : error.message;
}

function NavGroup({ title, items, onSelect }: {
  title: string;
  items: NavItem[];
  onSelect: (label: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[.1em] text-[#B3BFB7]">
        {title}
      </span>
      {items.map(({ label, icon: Icon, disabled = false }) => {
        const selected = label === "Balanço Patrimonial";
        return (
          <button
            key={label}
            type="button"
            disabled={disabled}
            aria-disabled={disabled}
            title={disabled ? "Página em desenvolvimento" : undefined}
            onClick={() => onSelect(label)}
            className={`flex w-full items-center gap-[11px] rounded-xl px-3 py-[10px] text-left text-[13px] transition active:scale-[.98] ${
              selected
                ? "bg-[#12B85C] font-bold text-white"
                : disabled
                  ? "cursor-not-allowed text-[#A8B1AB] opacity-55"
                : "text-[#28382E] hover:bg-[#F1FBF6]"
            }`}
          >
            <Icon size={16} />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const select = (label: string) => {
    onClose();
    if (label === "Visão geral") setLocation("/");
    else if (label === "Lançamentos") setLocation("/lancamentos");
    else if (label === "Contas e categorias") setLocation("/organizacao");
    else if (label !== "Balanço Patrimonial") toast.info(`${label} ainda não está disponível.`);
  };
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-[#07150d]/35 backdrop-blur-[2px] xl:hidden"
          onClick={onClose}
        />
      )}
      <aside className={`fixed inset-y-3 left-3 z-50 flex w-[236px] shrink-0 flex-col gap-[14px] overflow-hidden rounded-[20px] bg-white px-[14px] py-5 shadow-[0_18px_44px_rgba(11,31,20,.16)] transition-transform xl:sticky xl:inset-auto xl:top-5 xl:h-[calc(100vh-40px)] xl:translate-x-0 xl:shadow-none ${open ? "translate-x-0" : "-translate-x-[260px]"}`}>
        <div className="flex items-center gap-2.5 px-1.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#12B85C] text-[15px] font-bold text-white">NV</span>
          <div className="min-w-0">
            <strong className="block truncate text-sm">NV Financeiro</strong>
            <span className="block truncate text-[11px] text-[#8A968D]">Número Virtual LTDA</span>
          </div>
          <button type="button" aria-label="Fechar menu" onClick={onClose} className="ml-auto rounded-lg p-1 text-[#8A968D] hover:bg-[#F1F4F2] xl:hidden">
            <CloseIcon size={17} />
          </button>
        </div>
        <NavGroup title="Painel" items={panelItems} onSelect={select} />
        <NavGroup title="Análise" items={analysisItems} onSelect={select} />
        <NavGroup title="Organização" items={organizationItems} onSelect={select} />
        <div className="mt-auto rounded-2xl bg-[#F1FBF6] p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#0A7A42]">Banco conectado</span>
          <div className="mt-2 flex items-center gap-2 text-[12px] text-[#4C6355]">
            <span className="h-2 w-2 rounded-full bg-[#12B85C]" />TiDB Cloud
          </div>
        </div>
      </aside>
    </>
  );
}

function allowedTypes(group: BalanceGroup): ItemType[] {
  if (group.startsWith("ativo_")) return ["bem", "direito", "estoque", "investimento", "outro"];
  if (group.startsWith("passivo_")) return ["obrigacao", "outro"];
  return ["capital", "ajuste", "outro"];
}

function ItemModal({ item, initialGroup, pending, onClose, onSave }: {
  item: PatrimonialItem | null;
  initialGroup: BalanceGroup;
  pending: boolean;
  onClose: () => void;
  onSave: (values: PatrimonialValues) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [balanceGroup, setBalanceGroup] = useState<BalanceGroup>(item?.balanceGroup ?? initialGroup);
  const [itemType, setItemType] = useState<ItemType>(
    item?.itemType ?? allowedTypes(initialGroup)[0]
  );
  const [acquisitionDate, setAcquisitionDate] = useState(item?.acquisitionDate ?? "");
  const [acquisitionValue, setAcquisitionValue] = useState(item ? formatCurrencyValue(item.acquisitionValueNumber) : "0,00");
  const [currentValue, setCurrentValue] = useState(item ? formatCurrencyValue(item.currentValueNumber) : "0,00");
  const [valuationMethod, setValuationMethod] = useState<ValuationMethod>(item?.valuationMethod ?? "manual");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(item?.usefulLifeMonths?.toString() ?? "60");
  const [residualValue, setResidualValue] = useState(item ? formatCurrencyValue(item.residualValueNumber) : "0,00");
  const [notes, setNotes] = useState(item?.notes ?? "");

  const changeGroup = (group: BalanceGroup) => {
    setBalanceGroup(group);
    const types = allowedTypes(group);
    if (!types.includes(itemType)) setItemType(types[0]);
    if (!group.startsWith("ativo_")) setValuationMethod("manual");
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const acquisition = currencyInputToNumber(acquisitionValue);
    const current = currencyInputToNumber(currentValue);
    const residual = currencyInputToNumber(residualValue);
    if (![acquisition, current, residual].every(Number.isFinite)) {
      toast.error("Revise os valores monetários informados.");
      return;
    }
    try {
      await onSave({
        name: name.trim(),
        balanceGroup,
        itemType,
        acquisitionDate: acquisitionDate || null,
        acquisitionValue: acquisition,
        currentValue: current,
        valuationMethod,
        usefulLifeMonths: valuationMethod === "depreciacao_linear"
          ? Number(usefulLifeMonths)
          : null,
        residualValue: residual,
        notes,
      });
    } catch (error) {
      toast.error(safeError(error, "Não foi possível salvar o item patrimonial."));
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="item-modal-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="modal-enter max-h-[calc(100vh-32px)] w-full max-w-[680px] overflow-y-auto rounded-[22px] bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Cadastro patrimonial</p>
            <h2 id="item-modal-title" className="mt-1 text-xl font-bold">{item ? "Editar item" : "Novo item patrimonial"}</h2>
            <p className="mt-1 text-xs text-[#8A968D]">Cadastre bens, direitos, obrigações, capital e ajustes.</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355]"><CloseIcon size={17} /></button>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Nome do item</span>
            <input autoFocus required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Veículo de entregas" className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3] focus:ring-2 focus:ring-[#12B85C]" />
          </label>
          <label>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Grupo patrimonial</span>
            <select value={balanceGroup} onChange={event => changeGroup(event.target.value as BalanceGroup)} className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]">
              {Object.entries(groupLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Tipo</span>
            <select value={itemType} onChange={event => setItemType(event.target.value as ItemType)} className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]">
              {allowedTypes(balanceGroup).map(value => <option key={value} value={value}>{typeLabels[value]}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Data de aquisição</span>
            <input type="date" max={today()} value={acquisitionDate} onChange={event => setAcquisitionDate(event.target.value)} className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]" />
          </label>
          <label>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Valor de aquisição</span>
            <input value={acquisitionValue} onFocus={event => event.currentTarget.select()} onChange={event => setAcquisitionValue(formatCurrencyInput(event.target.value))} inputMode="decimal" className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]" />
          </label>
          <label>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Valor atual</span>
            <input value={currentValue} onFocus={event => event.currentTarget.select()} onChange={event => setCurrentValue(formatCurrencyInput(event.target.value))} inputMode="decimal" className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]" />
          </label>
          <label>
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Avaliação</span>
            <select value={valuationMethod} onChange={event => setValuationMethod(event.target.value as ValuationMethod)} className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]">
              <option value="manual">Valor atual informado</option>
              {balanceGroup.startsWith("ativo_") && <option value="depreciacao_linear">Depreciação linear automática</option>}
            </select>
          </label>
          {valuationMethod === "depreciacao_linear" && (
            <>
              <label>
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Vida útil em meses</span>
                <input required type="number" min={1} max={1200} value={usefulLifeMonths} onChange={event => setUsefulLifeMonths(event.target.value)} className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]" />
              </label>
              <label>
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Valor residual</span>
                <input value={residualValue} onFocus={event => event.currentTarget.select()} onChange={event => setResidualValue(formatCurrencyInput(event.target.value))} inputMode="decimal" className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]" />
              </label>
              <p className="sm:col-span-2 rounded-xl bg-[#F1FBF6] px-3.5 py-3 text-[11px] leading-relaxed text-[#4C6355]">
                O valor contábil será calculado pela data, vida útil e valor residual. O valor atual fica como segurança caso os dados de depreciação sejam removidos.
              </p>
            </>
          )}
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Observações</span>
            <textarea maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Detalhes, matrícula, contrato, localização ou responsável" className="min-h-[82px] w-full resize-y rounded-xl bg-[#F8FAF9] px-3.5 py-3 text-[13px] outline-none ring-1 ring-[#E1E8E3] focus:ring-2 focus:ring-[#12B85C]" />
          </label>
        </div>
        <div className="mt-6 flex gap-2.5">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355]">Cancelar</button>
          <button disabled={pending} type="submit" className="flex-1 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "Salvando..." : "Salvar item"}</button>
        </div>
      </form>
    </div>
  );
}

function SnapshotModal({ pending, onClose, onSave }: {
  pending: boolean;
  onClose: () => void;
  onSave: (date: string) => Promise<void>;
}) {
  const [date, setDate] = useState(today());
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form onSubmit={async event => { event.preventDefault(); await onSave(date); }} className="modal-enter w-full max-w-[440px] rounded-[22px] bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Evolução real</p><h2 className="mt-1 text-xl font-bold">Registrar posição</h2><p className="mt-1 text-xs leading-relaxed text-[#8A968D]">Salve os valores atuais como um fechamento histórico nesta data.</p></div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355]"><CloseIcon size={17} /></button>
        </div>
        <label className="mt-5 block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Data de referência</span><input required type="date" max={today()} value={date} onChange={event => setDate(event.target.value)} className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3] focus:ring-2 focus:ring-[#12B85C]" /></label>
        <p className="mt-3 rounded-xl bg-[#F8FAF9] p-3 text-[11px] leading-relaxed text-[#718077]">Se já existir uma posição nessa data, ela será atualizada. Os demais fechamentos permanecem intactos.</p>
        <div className="mt-5 flex gap-2.5"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355]">Cancelar</button><button disabled={pending} type="submit" className="flex-1 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "Registrando..." : "Registrar posição"}</button></div>
      </form>
    </div>
  );
}

function EvolutionChart({ history }: { history: Array<{ referenceDate: string; netWorth: number }> }) {
  const chart = useMemo(() => {
    if (!history.length) return null;
    const values = history.map(item => item.netWorth);
    let min = Math.min(...values, 0);
    let max = Math.max(...values, 0);
    if (min === max) { min -= 1; max += 1; }
    const width = 680;
    const height = 210;
    const horizontalPadding = 34;
    const verticalPadding = 28;
    const points = history.map((item, index) => {
      const x = history.length === 1
        ? width / 2
        : horizontalPadding + index * ((width - horizontalPadding * 2) / (history.length - 1));
      const y = verticalPadding + (max - item.netWorth) * ((height - verticalPadding * 2) / (max - min));
      return { ...item, x, y };
    });
    const zeroY = verticalPadding + max * ((height - verticalPadding * 2) / (max - min));
    return { points, zeroY, width, height };
  }, [history]);
  if (!chart) return null;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="min-w-[620px]" role="img" aria-label="Evolução do patrimônio líquido">
        <defs><linearGradient id="patrimony-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#12B85C" stopOpacity=".24" /><stop offset="1" stopColor="#12B85C" stopOpacity="0" /></linearGradient></defs>
        <line x1="34" x2="646" y1={chart.zeroY} y2={chart.zeroY} stroke="#D9E3DC" strokeDasharray="5 5" />
        {chart.points.length > 1 && <polygon points={`${chart.points.map(point => `${point.x},${point.y}`).join(" ")} ${chart.points.at(-1)?.x},182 ${chart.points[0].x},182`} fill="url(#patrimony-area)" />}
        {chart.points.length > 1 && <polyline points={chart.points.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#12B85C" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
        {chart.points.map(point => <g key={point.referenceDate}><circle cx={point.x} cy={point.y} r="6" fill="white" stroke="#12B85C" strokeWidth="4" /><text x={point.x} y="202" textAnchor="middle" fontSize="10" fill="#718077">{formatDate(point.referenceDate).slice(0, 5)}</text></g>)}
      </svg>
    </div>
  );
}

function ItemList({ items, emptyTitle, emptyText, onCreate, onEdit, onToggle, onDelete }: {
  items: PatrimonialItem[];
  emptyTitle: string;
  emptyText: string;
  onCreate: () => void;
  onEdit: (item: PatrimonialItem) => void;
  onToggle: (item: PatrimonialItem) => void;
  onDelete: (item: PatrimonialItem) => void;
}) {
  if (!items.length) {
    return <div className="flex min-h-[340px] flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DFF6EA] text-[#0A7A42]"><DocumentIcon size={23} /></span><strong className="mt-3 text-[14px]">{emptyTitle}</strong><p className="mt-1 max-w-[360px] text-[12px] leading-relaxed text-[#8A968D]">{emptyText}</p><button type="button" onClick={onCreate} className="mt-4 rounded-xl bg-[#12B85C] px-4 py-2.5 text-[12px] font-bold text-white">Cadastrar primeiro item</button></div>;
  }
  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {items.map(item => (
        <article key={item.id} className={`rounded-[17px] p-4 ring-1 ${item.isActive ? "bg-white ring-[#DFE6E1]" : "bg-[#F8FAF9] opacity-65 ring-[#E8EEEA]"}`}>
          <div className="flex items-start gap-3"><span className={`rounded-lg px-2.5 py-1.5 text-[9.5px] font-bold ${groupStyles[item.balanceGroup]}`}>{groupShortLabels[item.balanceGroup]}</span><span className={`ml-auto rounded-md px-2 py-1 text-[9.5px] font-bold ${item.isActive ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#ECEFEC] text-[#718077]"}`}>{item.isActive ? "Ativo" : "Inativo"}</span></div>
          <strong className="mt-3 block truncate text-[14px]">{item.name}</strong>
          <span className="mt-1 block text-[10.5px] text-[#8A968D]">{typeLabels[item.itemType]}{item.acquisitionDate ? ` · ${formatDate(item.acquisitionDate)}` : ""}</span>
          <div className="mt-4 rounded-xl bg-[#F8FAF9] p-3"><span className="text-[10.5px] text-[#8A968D]">Valor contábil atual</span><strong className={`mt-0.5 block text-xl ${item.balanceGroup.startsWith("passivo_") ? "text-[#B3261E]" : "text-[#0A7A42]"}`}>{formatMoney(item.bookValue)}</strong>{item.accumulatedDepreciation > 0 && <span className="mt-1 block text-[10px] text-[#8A968D]">Depreciação acumulada: {formatMoney(item.accumulatedDepreciation)}</span>}</div>
          <div className="mt-3 flex gap-2"><button type="button" onClick={() => onToggle(item)} className="flex-1 rounded-[10px] bg-[#F1F4F2] px-2 py-2 text-[11px] font-bold text-[#4C6355]">{item.isActive ? "Desativar" : "Ativar"}</button><button type="button" aria-label={`Editar ${item.name}`} onClick={() => onEdit(item)} className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F1F4F2] text-[#4C6355]"><EditIcon size={14} /></button><button type="button" aria-label={`Excluir ${item.name}`} onClick={() => onDelete(item)} className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#FDECEA] text-[#B3261E]"><DeleteIcon size={14} /></button></div>
        </article>
      ))}
    </div>
  );
}

export default function BalanceSheetPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [itemModal, setItemModal] = useState(false);
  const [snapshotModal, setSnapshotModal] = useState(false);
  const [editingItem, setEditingItem] = useState<PatrimonialItem | null>(null);
  const [newItemGroup, setNewItemGroup] = useState<BalanceGroup>("ativo_nao_circulante");
  const utils = trpc.useUtils();
  const overviewQuery = trpc.balanceSheet.overview.useQuery(undefined);
  const data = overviewQuery.data;
  const refresh = async () => { await utils.balanceSheet.overview.invalidate(); };
  const createItem = trpc.balanceSheet.createItem.useMutation({ onSuccess: refresh });
  const updateItem = trpc.balanceSheet.updateItem.useMutation({ onSuccess: refresh });
  const toggleItem = trpc.balanceSheet.toggleItem.useMutation({ onSuccess: refresh });
  const deleteItem = trpc.balanceSheet.deleteItem.useMutation({ onSuccess: refresh });
  const captureSnapshot = trpc.balanceSheet.captureSnapshot.useMutation({ onSuccess: refresh });
  const deleteSnapshot = trpc.balanceSheet.deleteSnapshot.useMutation({ onSuccess: refresh });
  const items = (data?.items ?? []) as PatrimonialItem[];
  const assetItems = items.filter(item => item.balanceGroup.startsWith("ativo_"));
  const liabilityItems = items.filter(item => item.balanceGroup.startsWith("passivo_") || item.balanceGroup === "patrimonio_liquido");
  const initials = (user?.name || user?.email || "NV").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
  const summary = data?.summary;
  const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] active:scale-95";

  const openNew = (group?: BalanceGroup) => {
    setEditingItem(null);
    setNewItemGroup(group ?? "ativo_nao_circulante");
    setItemModal(true);
    if (group?.startsWith("passivo_")) setTab("liabilities");
  };
  const saveItem = async (values: PatrimonialValues) => {
    if (editingItem) await updateItem.mutateAsync({ id: editingItem.id, ...values });
    else await createItem.mutateAsync(values);
    setItemModal(false);
    setEditingItem(null);
    toast.success(editingItem ? "Item patrimonial atualizado" : "Item patrimonial cadastrado");
  };
  const handleDelete = async (item: PatrimonialItem) => {
    if (!window.confirm(`Excluir “${item.name}”? Os fechamentos históricos serão preservados.`)) return;
    try { await deleteItem.mutateAsync({ id: item.id }); toast.success("Item patrimonial excluído"); }
    catch (error) { toast.error(safeError(error, "Não foi possível excluir o item.")); }
  };
  const saveSnapshot = async (referenceDate: string) => {
    try { await captureSnapshot.mutateAsync({ referenceDate }); setSnapshotModal(false); setTab("evolution"); toast.success("Posição patrimonial registrada"); }
    catch (error) { toast.error(safeError(error, "Não foi possível registrar a posição.")); }
  };

  const groupTotals: Record<BalanceGroup, number> = {
    ativo_circulante: summary?.currentAssets ?? 0,
    ativo_nao_circulante: summary?.nonCurrentAssets ?? 0,
    passivo_circulante: summary?.currentLiabilities ?? 0,
    passivo_nao_circulante: summary?.nonCurrentLiabilities ?? 0,
    patrimonio_liquido: summary?.declaredEquity ?? 0,
  };

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><MenuIcon size={18} /></button>
            <div className="mr-auto"><h1 className="text-[24px] font-bold tracking-[-.035em] sm:text-[28px]">Balanço Patrimonial</h1><p className="mt-0.5 text-[12px] text-[#8A968D]">Bens, obrigações e evolução do patrimônio da empresa</p></div>
            <button type="button" onClick={() => setSnapshotModal(true)} className="flex h-10 items-center gap-2 rounded-[12px] bg-white px-3.5 text-[12.5px] font-bold text-[#0A7A42] ring-1 ring-[#CFE2D7] hover:bg-[#F1FBF6]"><ChartIcon size={15} />Registrar posição</button>
            <button type="button" onClick={() => openNew()} className="flex h-10 items-center gap-2 rounded-[12px] bg-[#12B85C] px-4 text-[13px] font-bold text-white hover:bg-[#0F9E4E]"><PlusIcon size={15} />Novo item</button>
            <div className="relative"><button type="button" aria-label="Abrir conta" onClick={() => setAccountOpen(value => !value)} className="flex h-10 min-w-10 items-center justify-center rounded-[12px] bg-[#0B1F14] px-2.5 text-[11px] font-bold text-white">{initials || "NV"}</button>{accountOpen && <div className="absolute right-0 top-12 z-40 w-[250px] rounded-[17px] bg-white p-3 shadow-[0_20px_50px_rgba(11,31,20,.18)]"><div className="rounded-xl bg-[#F8FAF9] p-3"><strong className="block truncate text-[12px]">{user?.name || "Sua conta"}</strong><span className="mt-0.5 block truncate text-[10.5px] text-[#8A968D]">{user?.email}</span></div><ThemeToggle className="mt-2 rounded-xl bg-[#F8FAF9] p-2" /><button type="button" onClick={async () => { await logout(); setLocation("/login", { replace: true }); }} className="mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-[12px] font-semibold text-[#8E1F16] hover:bg-[#FDECEA]">Sair <ChevronRightIcon size={14} /></button></div>}</div>
          </header>

          {overviewQuery.isLoading && <section className="flex min-h-[520px] flex-1 items-center justify-center gap-3 rounded-[20px] bg-white text-[12px] text-[#718077] ring-1 ring-[#E1E8E3]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#12B85C]/20 border-t-[#12B85C]" />Carregando patrimônio...</section>}
          {overviewQuery.isError && <section className="flex min-h-[520px] flex-1 flex-col items-center justify-center rounded-[20px] bg-white ring-1 ring-[#E1E8E3]"><strong className="text-[#B3261E]">Não foi possível carregar o balanço</strong><button type="button" onClick={() => overviewQuery.refetch()} className="mt-3 rounded-xl bg-[#FDECEA] px-4 py-2 text-[12px] font-bold text-[#8E1F16]">Tentar novamente</button></section>}

          {!overviewQuery.isLoading && !overviewQuery.isError && (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <article className="rounded-[17px] bg-[#0B1F14] p-4 text-white"><span className="text-[11px] text-[#8FB39E]">Ativos totais</span><strong className="mt-1 block text-[22px]">{formatMoney(summary?.totalAssets ?? 0)}</strong><span className="mt-2 block text-[10px] text-[#8FB39E]">Caixa e bens sem duplicidade</span></article>
                <article className="rounded-[17px] bg-white p-4 ring-1 ring-[#E1E8E3]"><span className="text-[11px] text-[#718077]">Passivos totais</span><strong className="mt-1 block text-[22px] text-[#B3261E]">{formatMoney(summary?.totalLiabilities ?? 0)}</strong><span className="mt-2 block text-[10px] text-[#8A968D]">Obrigações e saldos devedores</span></article>
                <article className="rounded-[17px] bg-[#DFF6EA] p-4 ring-1 ring-[#C8EBD8]"><span className="text-[11px] text-[#4C6355]">Patrimônio líquido calculado</span><strong className={`mt-1 block text-[22px] ${(summary?.netWorth ?? 0) >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(summary?.netWorth ?? 0)}</strong><span className="mt-2 block text-[10px] text-[#4C6355]">Ativos menos passivos</span></article>
                <article className="rounded-[17px] bg-white p-4 ring-1 ring-[#E1E8E3]"><span className="text-[11px] text-[#718077]">Liquidez corrente</span><strong className="mt-1 block text-[22px]">{summary?.liquidityRatio == null ? "—" : `${formatDecimal(summary.liquidityRatio)}x`}</strong><span className="mt-2 block text-[10px] text-[#8A968D]">Endividamento: {summary?.debtRatio == null ? "—" : `${formatDecimal(summary.debtRatio)}%`}</span></article>
              </section>

              <section className="flex overflow-x-auto rounded-[14px] bg-white p-1 ring-1 ring-[#E1E8E3] sm:w-fit">
                {([[
                  "overview", "Visão do balanço"
                ], ["assets", "Bens e direitos"], ["liabilities", "Obrigações e PL"], ["evolution", "Evolução"]] as Array<[Tab, string]>).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`whitespace-nowrap rounded-[10px] px-4 py-2.5 text-[12px] font-bold ${tab === value ? "bg-[#DFF6EA] text-[#0A7A42]" : "text-[#718077]"}`}>{label}</button>)}
              </section>

              {tab === "overview" && <section className="grid flex-1 gap-4 xl:grid-cols-[1.25fr_.75fr]"><article className="rounded-[20px] bg-white p-4 ring-1 ring-[#E1E8E3] sm:p-5"><div className="flex items-start gap-3"><div><h2 className="text-[15px] font-bold">Estrutura patrimonial</h2><p className="mt-0.5 text-[11.5px] text-[#8A968D]">Posição calculada em {formatDate(data?.referenceDate ?? today())}</p></div><span className="ml-auto rounded-lg bg-[#F1F4F2] px-2.5 py-1 text-[10px] font-bold text-[#607067]">{data?.activeItemCount ?? 0} {(data?.activeItemCount ?? 0) === 1 ? "item ativo" : "itens ativos"}</span></div><div className="mt-5 space-y-2.5">{(Object.keys(groupLabels) as BalanceGroup[]).map(group => { const isLiability = group.startsWith("passivo_"); const value = groupTotals[group]; const denominator = isLiability ? Math.max(summary?.totalLiabilities ?? 0, 1) : Math.max(summary?.totalAssets ?? 0, 1); const width = Math.min(100, Math.max(value > 0 ? 2 : 0, (value / denominator) * 100)); return <div key={group} className="rounded-[14px] bg-[#F8FAF9] p-3.5"><div className="flex items-center gap-3"><span className={`h-2.5 w-2.5 rounded-full ${isLiability ? "bg-[#E5533D]" : group === "patrimonio_liquido" ? "bg-[#5874A9]" : "bg-[#12B85C]"}`} /><strong className="min-w-0 flex-1 text-[12px]">{groupLabels[group]}</strong><span className="text-[12px] font-bold">{formatMoney(value)}</span></div><div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#E7ECE8]"><div className={`h-full rounded-full ${isLiability ? "bg-[#E5533D]" : group === "patrimonio_liquido" ? "bg-[#5874A9]" : "bg-[#12B85C]"}`} style={{ width: `${width}%` }} /></div></div>; })}</div><div className="mt-4 rounded-[14px] border border-[#DDE9E1] bg-[#F1FBF6] p-3.5"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#0A7A42]"><CheckIcon size={16} /></span><div><strong className="block text-[11.5px]">Caixa integrado automaticamente</strong><span className="mt-0.5 block text-[10.5px] text-[#607067]">{data?.accountCount ?? 0} {(data?.accountCount ?? 0) === 1 ? "conta financeira contribui" : "contas financeiras contribuem"} com {formatMoney(summary?.cashAndEquivalents ?? 0)}. Não cadastre esse caixa novamente.</span></div></div></div></article><aside className="space-y-4"><article className="rounded-[20px] bg-white p-4 ring-1 ring-[#E1E8E3] sm:p-5"><h2 className="text-[15px] font-bold">Conferência contábil</h2><p className="mt-1 text-[11px] leading-relaxed text-[#8A968D]">Compare o patrimônio líquido informado com o valor calculado por ativos menos passivos.</p><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-[#F8FAF9] p-3"><span className="block text-[10px] text-[#8A968D]">PL informado</span><strong className="mt-1 block text-[14px]">{formatMoney(summary?.declaredEquity ?? 0)}</strong></div><div className="rounded-xl bg-[#F8FAF9] p-3"><span className="block text-[10px] text-[#8A968D]">Diferença</span><strong className={`mt-1 block text-[14px] ${(summary?.balanceDifference ?? 0) === 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(summary?.balanceDifference ?? 0)}</strong></div></div>{(summary?.balanceDifference ?? 0) !== 0 && <p className="mt-3 rounded-xl bg-[#FFF8E8] p-3 text-[10.5px] leading-relaxed text-[#725517]">A diferença pode representar resultados acumulados ainda não cadastrados, ajustes ou valores a revisar.</p>}</article><article className="rounded-[20px] bg-[#0B1F14] p-5 text-white"><span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#8FB39E]">Histórico confiável</span><strong className="mt-2 block text-[16px]">Registre uma posição após cada fechamento.</strong><p className="mt-1 text-[11px] leading-relaxed text-[#AFC4B7]">A evolução utiliza somente posições salvas por você, nunca valores simulados.</p><button type="button" onClick={() => setSnapshotModal(true)} className="mt-4 rounded-xl bg-[#12B85C] px-4 py-2.5 text-[11.5px] font-bold text-white">Registrar posição atual</button></article></aside></section>}

              {(tab === "assets" || tab === "liabilities") && <section className="min-h-[430px] flex-1 rounded-[20px] bg-white p-4 ring-1 ring-[#E1E8E3] sm:p-5"><div className="mb-4 flex items-center"><div><h2 className="text-[15px] font-bold">{tab === "assets" ? "Bens e direitos da empresa" : "Obrigações e patrimônio líquido"}</h2><p className="mt-0.5 text-[11.5px] text-[#8A968D]">{tab === "assets" ? "Ativos circulantes, imobilizados, estoques e investimentos" : "Dívidas de curto e longo prazo, capital e ajustes"}</p></div><span className="ml-auto rounded-lg bg-[#F1F4F2] px-2.5 py-1 text-[10.5px] font-bold text-[#607067]">{tab === "assets" ? assetItems.length : liabilityItems.length} {(tab === "assets" ? assetItems.length : liabilityItems.length) === 1 ? "cadastrado" : "cadastrados"}</span></div><ItemList items={tab === "assets" ? assetItems : liabilityItems} emptyTitle={tab === "assets" ? "Nenhum bem ou direito cadastrado" : "Nenhuma obrigação ou linha de PL"} emptyText={tab === "assets" ? "Cadastre imóveis, veículos, equipamentos, estoque, investimentos e outros bens da empresa." : "Cadastre fornecedores, empréstimos, financiamentos, capital social e ajustes patrimoniais."} onCreate={() => openNew(tab === "assets" ? "ativo_nao_circulante" : "passivo_circulante")} onEdit={item => { setEditingItem(item); setItemModal(true); }} onToggle={item => toggleItem.mutate({ id: item.id })} onDelete={handleDelete} /></section>}

              {tab === "evolution" && <section className="grid flex-1 gap-4 2xl:grid-cols-[1fr_360px]"><article className="rounded-[20px] bg-white p-4 ring-1 ring-[#E1E8E3] sm:p-5"><div className="flex items-start"><div><h2 className="text-[15px] font-bold">Evolução do patrimônio líquido</h2><p className="mt-0.5 text-[11.5px] text-[#8A968D]">Ativos menos passivos em cada posição registrada</p></div><span className="ml-auto rounded-lg bg-[#DFF6EA] px-2.5 py-1 text-[10px] font-bold text-[#0A7A42]">{data?.history.length ?? 0} {(data?.history.length ?? 0) === 1 ? "posição" : "posições"}</span></div>{(data?.history.length ?? 0) === 0 ? <div className="flex min-h-[340px] flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DFF6EA] text-[#0A7A42]"><ChartIcon size={23} /></span><strong className="mt-3 text-[14px]">A evolução começa no primeiro fechamento</strong><p className="mt-1 max-w-[360px] text-[12px] leading-relaxed text-[#8A968D]">Registre a posição atual para criar o primeiro ponto real do histórico patrimonial.</p><button type="button" onClick={() => setSnapshotModal(true)} className="mt-4 rounded-xl bg-[#12B85C] px-4 py-2.5 text-[12px] font-bold text-white">Registrar primeira posição</button></div> : <div className="mt-5"><EvolutionChart history={data?.history ?? []} /><div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#EDF1EE] pt-4"><div><span className="text-[10px] text-[#8A968D]">Primeira posição</span><strong className="mt-1 block text-[13px]">{formatMoney(data?.history[0]?.netWorth ?? 0)}</strong></div><div><span className="text-[10px] text-[#8A968D]">Posição mais recente</span><strong className="mt-1 block text-[13px] text-[#0A7A42]">{formatMoney(data?.history.at(-1)?.netWorth ?? 0)}</strong></div></div></div>}</article><aside className="rounded-[20px] bg-white p-4 ring-1 ring-[#E1E8E3] sm:p-5"><div className="flex items-center"><h2 className="text-[14px] font-bold">Fechamentos</h2><button type="button" onClick={() => setSnapshotModal(true)} className="ml-auto text-[11px] font-bold text-[#0A7A42]">Adicionar</button></div><div className="mt-4 space-y-2">{data?.history.slice().reverse().map(snapshot => <div key={snapshot.id} className="rounded-[14px] bg-[#F8FAF9] p-3"><div className="flex items-start"><div><strong className="block text-[12px]">{formatDate(snapshot.referenceDate)}</strong><span className="mt-0.5 block text-[10px] text-[#8A968D]">{snapshot.itemCount} {snapshot.itemCount === 1 ? "item" : "itens"} no fechamento</span></div><button type="button" aria-label={`Excluir posição de ${formatDate(snapshot.referenceDate)}`} onClick={async () => { if (!window.confirm("Excluir esta posição histórica?")) return; await deleteSnapshot.mutateAsync({ id: snapshot.id }); toast.success("Posição removida"); }} className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-[#FDECEA] text-[#B3261E]"><DeleteIcon size={12} /></button></div><div className="mt-3 grid grid-cols-2 gap-2"><span className="text-[9.5px] text-[#718077]">Ativos <b className="block text-[10.5px] text-[#0A7A42]">{formatMoney(snapshot.totalAssets)}</b></span><span className="text-[9.5px] text-[#718077]">Patrimônio <b className={`block text-[10.5px] ${snapshot.netWorth >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(snapshot.netWorth)}</b></span></div></div>)}{(data?.history.length ?? 0) === 0 && <p className="rounded-xl bg-[#F8FAF9] p-3 text-[11px] leading-relaxed text-[#8A968D]">Nenhuma posição registrada até o momento.</p>}</div></aside></section>}
            </>
          )}
        </section>
      </div>
      {itemModal && <ItemModal item={editingItem} initialGroup={newItemGroup} pending={createItem.isPending || updateItem.isPending} onClose={() => { setItemModal(false); setEditingItem(null); }} onSave={saveItem} />}
      {snapshotModal && <SnapshotModal pending={captureSnapshot.isPending} onClose={() => setSnapshotModal(false)} onSave={saveSnapshot} />}
    </main>
  );
}
