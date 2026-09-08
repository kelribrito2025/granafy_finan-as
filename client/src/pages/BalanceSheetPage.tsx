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
  DownloadIcon,
  EditIcon,
  MenuIcon,
  PlusIcon,
  SettingsIcon,
  TrendUpIcon,
  UploadIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { AuroraSurface } from "@/components/AuroraSurface";
import { usePreferences } from "@/contexts/PreferencesContext";
import { CURRENCY_LABELS } from "@shared/preferences";
import { ConnectedAccounts } from "@/components/ConnectedAccounts";
import { formatDate as formatDateWithPreferences, formatMoney as formatMoneyWithPreferences } from "@/lib/appFormat";
import { GranafyLogo } from "@/components/GranafyLogo";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  currencyInputToNumber,
  formatCurrencyInput,
  formatCurrencyValue,
} from "@/lib/currency";
import {
  assetsChangePercent,
  findBaseline,
  netWorthChange,
} from "@/lib/balanceComparison";
import {
  periodBaseline,
  periodLabels,
  periodNouns,
  todayIso,
  type Period,
} from "@/lib/period";
import { trpc } from "@/lib/trpc";
import {
  buildMovementRow,
  monthKeyOf,
  monthLabel,
  monthlyDepreciationOf,
  contributionsOf,
} from "@/lib/patrimonyMovement";
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABELS,
  DEPRECIABLE_CATEGORIES,
  type AssetCategory,
} from "@shared/assetCategory";
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
  assetCategory: AssetCategory | null;
  costCenter: string;
  costCenterId: number | null;
  sourceAccount: string;
  sourceAccountId: number | null;
  attachmentKey: string | null;
  attachmentName: string | null;
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
  assetCategory: AssetCategory | null;
  costCenterId: number | null;
  sourceAccountId: number | null;
  attachmentKey: string | null;
  attachmentName: string | null;
};

type OrganizationOptions = {
  accounts: Array<{ id: number; name: string }>;
  costCenters: Array<{ id: number; name: string }>;
};
type Tab = "overview" | "assets" | "liabilities" | "evolution";
type EvolutionRange = "12" | "24" | "tudo";
/** Colunas da movimentação. Uma constante para cabeçalho e linhas não desalinharem. */
const MOVEMENT_GRID = "grid grid-cols-[86px_minmax(0,1fr)_116px_116px_124px_28px] gap-3";
type StatementRow = { label: string; value: number; hint?: string };
type StatementSection = { title: string; total: number; rows: StatementRow[] };


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
];
const organizationItems: NavItem[] = [
  { label: "Contas e categorias", icon: SettingsIcon },
  { label: "Configurações", icon: SettingsIcon },
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
  return formatMoneyWithPreferences(value);
}

function formatDecimal(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return formatDateWithPreferences(value);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? "+" : "−"} ${formatPercent(Math.abs(value))}`;
}

function formatSignedMoney(value: number) {
  return `${value >= 0 ? "+" : "−"} ${formatMoney(Math.abs(value))}`;
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
    else if (label === "Configurações") setLocation("/configuracoes");
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
          <GranafyLogo size={36} subtitle="Número Virtual LTDA" className="min-w-0 shrink-0" />
          <button type="button" aria-label="Fechar menu" onClick={onClose} className="ml-auto rounded-lg p-1 text-[#8A968D] hover:bg-[#F1F4F2] xl:hidden">
            <CloseIcon size={17} />
          </button>
        </div>
        <NavGroup title="Painel" items={panelItems} onSelect={select} />
        <NavGroup title="Análise" items={analysisItems} onSelect={select} />
        <NavGroup title="Organização" items={organizationItems} onSelect={select} />
        <ConnectedAccounts className="mt-auto" />
      </aside>
    </>
  );
}

function allowedTypes(group: BalanceGroup): ItemType[] {
  if (group.startsWith("ativo_")) return ["bem", "direito", "estoque", "investimento", "outro"];
  if (group.startsWith("passivo_")) return ["obrigacao", "outro"];
  return ["capital", "ajuste", "outro"];
}

const assetFieldClass = "h-[46px] w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[14px] outline-none focus:border-[#12B85C]";
const assetLabelClass = "mb-[7px] block text-[12.5px] font-semibold text-[#4C6355]";

const ASSET_ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const ASSET_CONTENT_TYPES: Record<string, "application/pdf" | "image/png" | "image/jpeg" | "image/webp"> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const MAX_ASSET_ATTACHMENT_BYTES = 8 * 1024 * 1024;

function assetFileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.onload = () => {
      const result = String(reader.result);
      const separator = result.indexOf(",");
      if (separator === -1) reject(new Error("Arquivo inválido"));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Espelha calculateItemBookValue do servidor, inclusive o corte do residual em
 * [0, valor de aquisição]. A prévia precisa bater com o que vai ser gravado; um
 * número aqui diferente do balanço seria pior do que não mostrar número nenhum.
 */
function monthlyDepreciation(acquisitionValue: number, residualValue: number, usefulLifeMonths: number) {
  if (usefulLifeMonths <= 0) return 0;
  const acquisition = Math.max(0, acquisitionValue);
  const residual = Math.min(acquisition, Math.max(0, residualValue));
  return (acquisition - residual) / usefulLifeMonths;
}

function AssetModal({ item, pending, options, onManageOrganization, onClose, onSave }: {
  item: PatrimonialItem | null;
  pending: boolean;
  options: OrganizationOptions;
  onManageOrganization: () => void;
  onClose: () => void;
  onSave: (values: PatrimonialValues) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [assetCategory, setAssetCategory] = useState<AssetCategory>(item?.assetCategory ?? "equipamento");
  const [costCenterId, setCostCenterId] = useState<number | null>(item?.costCenterId ?? null);
  const [balanceGroup, setBalanceGroup] = useState<BalanceGroup>(item?.balanceGroup ?? "ativo_nao_circulante");
  const [acquisitionDate, setAcquisitionDate] = useState(item?.acquisitionDate ?? today());
  const [acquisitionValue, setAcquisitionValue] = useState(item ? formatCurrencyValue(item.acquisitionValueNumber) : "0,00");
  const [currentValue, setCurrentValue] = useState(item ? formatCurrencyValue(item.currentValueNumber) : "0,00");
  const [valuationMethod, setValuationMethod] = useState<ValuationMethod>(
    item?.valuationMethod ?? (DEPRECIABLE_CATEGORIES.includes(assetCategory) ? "depreciacao_linear" : "manual")
  );
  const [usefulLifeYears, setUsefulLifeYears] = useState(() => {
    const months = item?.usefulLifeMonths ?? 60;
    return String(Math.max(1, Math.round(months / 12)));
  });
  const [residualValue, setResidualValue] = useState(item ? formatCurrencyValue(item.residualValueNumber) : "0,00");
  const [sourceAccountId, setSourceAccountId] = useState<number | null>(item?.sourceAccountId ?? null);
  const [attachmentKey, setAttachmentKey] = useState(item?.attachmentKey ?? null);
  const [attachmentName, setAttachmentName] = useState(item?.attachmentName ?? null);
  const [notes, setNotes] = useState(item?.notes ?? "");
  const uploadAttachment = trpc.transactions.uploadAttachment.useMutation();

  const depreciates = valuationMethod === "depreciacao_linear";
  const usefulLifeMonths = Math.max(1, Math.min(100, Number(usefulLifeYears) || 1)) * 12;
  const acquisitionNumber = currencyInputToNumber(acquisitionValue);
  const residualNumber = currencyInputToNumber(residualValue);
  const monthly = depreciates && Number.isFinite(acquisitionNumber) && Number.isFinite(residualNumber)
    ? monthlyDepreciation(acquisitionNumber, residualNumber, usefulLifeMonths)
    : 0;

  const changeCategory = (next: AssetCategory) => {
    setAssetCategory(next);
    // Estoque e investimento não depreciam; só sugerimos, o usuário pode trocar.
    if (!item && !DEPRECIABLE_CATEGORIES.includes(next)) setValuationMethod("manual");
  };

  const pickAttachment = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_ASSET_ATTACHMENT_BYTES) return toast.error("O anexo deve ter no máximo 8 MB");
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const contentType = ASSET_CONTENT_TYPES[extension];
    if (!contentType) return toast.error("Anexe um PDF ou uma imagem PNG, JPG ou WEBP");
    try {
      const stored = await uploadAttachment.mutateAsync({
        fileName: file.name,
        contentType,
        dataBase64: await assetFileToBase64(file),
        folder: "bens",
      });
      setAttachmentKey(stored.key);
      setAttachmentName(stored.name);
      toast.success("Nota fiscal anexada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o anexo");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!Number.isFinite(acquisitionNumber) || acquisitionNumber <= 0) {
      return toast.error("Informe um valor de aquisição maior que zero");
    }
    if (depreciates && residualNumber > acquisitionNumber) {
      return toast.error("O valor residual não pode superar o valor de aquisição");
    }
    try {
      await onSave({
        name: name.trim(),
        balanceGroup,
        itemType: "bem",
        acquisitionDate,
        acquisitionValue: acquisitionNumber,
        // Sem depreciação o valor contábil é o valor atual informado; com ela, o
        // valor de aquisição é o ponto de partida do cálculo.
        currentValue: depreciates ? acquisitionNumber : currencyInputToNumber(currentValue),
        valuationMethod,
        usefulLifeMonths: depreciates ? usefulLifeMonths : null,
        residualValue: depreciates ? residualNumber : 0,
        notes,
        assetCategory,
        costCenterId,
        sourceAccountId,
        attachmentKey,
        attachmentName,
      });
    } catch (error) {
      toast.error(safeError(error, "Não foi possível salvar o bem."));
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="asset-modal-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px] sm:p-8" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="modal-enter flex max-h-full w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] bg-white text-[#0B1F14] shadow-[0_24px_60px_rgba(11,31,20,.22)]">
        <div className="flex shrink-0 items-center gap-3 border-b border-[#EDF1EE] px-6 py-5">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[#DFF6EA] text-[#0A7A42]"><ChartIcon size={19} /></span>
          <div className="min-w-0">
            <h2 id="asset-modal-title" className="text-[18px] font-bold tracking-[-.01em]">{item ? "Editar bem" : "Cadastrar bem"}</h2>
            <p className="text-[12.5px] text-[#8A968D]">
              {depreciates ? "Entra no imobilizado e passa a depreciar automaticamente" : "Entra no balanço pelo valor que você informar"}
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F2] text-[#28382E] hover:bg-[#E7ECE9]"><CloseIcon size={16} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-[18px] overflow-y-auto px-6 py-5">
          <label className="block">
            <span className={assetLabelClass}>Descrição do bem</span>
            <input autoFocus required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Servidor Dell PowerEdge R760" className={assetFieldClass} />
          </label>

          <div className="flex gap-3.5">
            <label className="min-w-0 flex-1">
              <span className={assetLabelClass}>Categoria</span>
              <select value={assetCategory} onChange={event => changeCategory(event.target.value as AssetCategory)} className={assetFieldClass}>
                {ASSET_CATEGORIES.map(value => <option key={value} value={value}>{ASSET_CATEGORY_LABELS[value]}</option>)}
              </select>
            </label>
            <label className="min-w-0 flex-1">
              <span className={assetLabelClass}>Centro de custo</span>
              <select value={costCenterId ?? ""} onChange={event => setCostCenterId(Number(event.target.value) || null)} className={assetFieldClass}>
                <option value="">Nenhum</option>
                {options.costCenters.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
          </div>

          <div className="flex gap-3.5">
            <label className="min-w-0 flex-1">
              <span className={assetLabelClass}>Data de aquisição</span>
              <input required type="date" max={today()} value={acquisitionDate} onChange={event => setAcquisitionDate(event.target.value)} className={assetFieldClass} />
            </label>
            <label className="min-w-0 flex-1">
              <span className={assetLabelClass}>Valor de aquisição</span>
              <div className="flex h-[46px] items-center gap-2 rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 focus-within:border-[#12B85C]">
                <span className="text-[13px] text-[#8A968D]">R$</span>
                <input required inputMode="decimal" value={acquisitionValue} onFocus={event => event.currentTarget.select()} onChange={event => setAcquisitionValue(formatCurrencyInput(event.target.value))} className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none" />
              </div>
            </label>
          </div>

          <div>
            <span className={assetLabelClass}>Método de depreciação</span>
            <div className="flex gap-2">
              {([["depreciacao_linear", "Linear"], ["manual", "Não deprecia"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValuationMethod(value)}
                  aria-pressed={valuationMethod === value}
                  className={`h-[42px] flex-1 rounded-xl text-[13px] transition ${valuationMethod === value ? "bg-[#12B85C] font-bold text-white" : "border border-[#E3EAE5] text-[#4C6355] hover:bg-[#F8FAF9]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {depreciates ? (
            <div className="flex gap-3.5">
              <label className="min-w-0 flex-1">
                <span className={assetLabelClass}>Vida útil</span>
                <div className="flex h-[46px] items-center gap-2 rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 focus-within:border-[#12B85C]">
                  <input required type="number" min={1} max={100} value={usefulLifeYears} onChange={event => setUsefulLifeYears(event.target.value)} className="w-[52px] min-w-0 bg-transparent text-[14px] font-semibold outline-none" />
                  <span className="truncate text-[13px] text-[#8A968D]">anos · {usefulLifeMonths} meses</span>
                </div>
              </label>
              <label className="min-w-0 flex-1">
                <span className={assetLabelClass}>Valor residual</span>
                <div className="flex h-[46px] items-center gap-2 rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 focus-within:border-[#12B85C]">
                  <span className="text-[13px] text-[#8A968D]">R$</span>
                  <input inputMode="decimal" value={residualValue} onFocus={event => event.currentTarget.select()} onChange={event => setResidualValue(formatCurrencyInput(event.target.value))} className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none" />
                </div>
              </label>
            </div>
          ) : (
            <label className="block">
              <span className={assetLabelClass}>Valor atual no balanço</span>
              <div className="flex h-[46px] items-center gap-2 rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 focus-within:border-[#12B85C]">
                <span className="text-[13px] text-[#8A968D]">R$</span>
                <input inputMode="decimal" value={currentValue} onFocus={event => event.currentTarget.select()} onChange={event => setCurrentValue(formatCurrencyInput(event.target.value))} className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none" />
              </div>
            </label>
          )}

          <div>
            <span className={assetLabelClass}>Grupo no balanço</span>
            <div className="flex gap-2">
              {([["ativo_nao_circulante", "Não circulante"], ["ativo_circulante", "Circulante"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBalanceGroup(value)}
                  aria-pressed={balanceGroup === value}
                  className={`h-[42px] flex-1 rounded-xl text-[13px] transition ${balanceGroup === value ? "bg-[#DFF6EA] font-bold text-[#0A7A42]" : "border border-[#E3EAE5] text-[#4C6355] hover:bg-[#F8FAF9]"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3.5">
            <label className="min-w-0 flex-1">
              <span className={assetLabelClass}>Conta de origem</span>
              <select value={sourceAccountId ?? ""} onChange={event => setSourceAccountId(Number(event.target.value) || null)} className={assetFieldClass}>
                <option value="">Não informar</option>
                {options.accounts.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
            <div className="min-w-0 flex-1">
              <span className={assetLabelClass}>Nota fiscal</span>
              {attachmentName ? (
                <div className="flex h-[46px] items-center gap-2 rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5">
                  <DocumentIcon size={15} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#0A7A42]">{attachmentName}</span>
                  <button type="button" aria-label="Remover anexo" onClick={() => { setAttachmentKey(null); setAttachmentName(null); }} className="shrink-0 rounded-lg p-1 text-[#8A968D] hover:bg-[#E7ECE9]"><CloseIcon size={14} /></button>
                </div>
              ) : (
                <label className={`flex h-[46px] cursor-pointer items-center gap-2 rounded-xl border border-dashed border-[#C9D5CD] px-3.5 ${uploadAttachment.isPending ? "opacity-60" : "hover:bg-[#F8FAF9]"}`}>
                  <UploadIcon size={15} />
                  <span className="truncate text-[13px] font-semibold text-[#0A7A42]">{uploadAttachment.isPending ? "Enviando..." : "Anexar PDF ou imagem"}</span>
                  <input type="file" accept={ASSET_ATTACHMENT_ACCEPT} disabled={uploadAttachment.isPending} onChange={event => { void pickAttachment(event.target.files?.[0]); event.target.value = ""; }} className="hidden" />
                </label>
              )}
            </div>
          </div>

          <label className="block">
            <span className={assetLabelClass}>Observações</span>
            <textarea maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Nota fiscal, número de série, contrato ou responsável" className="min-h-[74px] w-full resize-y rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 py-3 text-[14px] outline-none focus:border-[#12B85C]" />
          </label>

          {depreciates && monthly > 0 && (
            <div className="flex items-start gap-3 rounded-[14px] bg-[#F1FBF6] p-3.5">
              <span className="mt-0.5 shrink-0 text-[#0A7A42]"><CheckIcon size={16} /></span>
              <div>
                <strong className="block text-[12.5px] font-semibold text-[#0A7A42]">
                  Depreciação estimada: {formatMoney(monthly)} por mês
                </strong>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-[#4C6355]">
                  O bem entra no imobilizado por {formatMoney(acquisitionNumber)} e chega a {formatMoney(Math.min(acquisitionNumber, Math.max(0, residualNumber)))} ao fim dos {usefulLifeMonths} meses.
                </span>
              </div>
            </div>
          )}

          {options.accounts.length === 0 && (
            <button type="button" onClick={onManageOrganization} className="w-full rounded-xl bg-[#FFF8E8] px-3 py-2.5 text-left text-[11px] font-bold text-[#725517]">
              Cadastre uma conta financeira para poder informar a origem do pagamento
            </button>
          )}
        </div>

        <div className="flex shrink-0 gap-3 border-t border-[#EDF1EE] px-6 py-4">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-xl border border-[#E3EAE5] text-[14px] font-semibold text-[#28382E] hover:bg-[#F8FAF9]">Cancelar</button>
          <button type="submit" disabled={pending || uploadAttachment.isPending} className="h-12 flex-[2] rounded-xl bg-[#12B85C] text-[14px] font-bold text-white hover:bg-[#0F9E4E] disabled:opacity-60">
            {pending ? "Salvando..." : item ? "Salvar bem" : "Cadastrar bem"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Obrigações, capital social e ajustes não têm depreciação, categoria de
 * imobilizado nem nota fiscal — o formulário enxuto existe para eles não
 * ficarem sem tela de cadastro depois que o modal de bem virou específico.
 */
function LiabilityModal({ item, initialGroup, pending, onClose, onSave }: {
  item: PatrimonialItem | null;
  initialGroup: BalanceGroup;
  pending: boolean;
  onClose: () => void;
  onSave: (values: PatrimonialValues) => Promise<void>;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [balanceGroup, setBalanceGroup] = useState<BalanceGroup>(item?.balanceGroup ?? initialGroup);
  const [itemType, setItemType] = useState<ItemType>(item?.itemType ?? "obrigacao");
  const [currentValue, setCurrentValue] = useState(item ? formatCurrencyValue(item.currentValueNumber) : "0,00");
  const [acquisitionDate, setAcquisitionDate] = useState(item?.acquisitionDate ?? today());
  const [notes, setNotes] = useState(item?.notes ?? "");

  const allowedTypes: ItemType[] = balanceGroup.startsWith("passivo_")
    ? ["obrigacao", "outro"]
    : ["capital", "ajuste", "outro"];

  const changeGroup = (group: BalanceGroup) => {
    setBalanceGroup(group);
    const types: ItemType[] = group.startsWith("passivo_") ? ["obrigacao", "outro"] : ["capital", "ajuste", "outro"];
    if (!types.includes(itemType)) setItemType(types[0]);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = currencyInputToNumber(currentValue);
    if (!Number.isFinite(value)) return toast.error("Revise o valor informado.");
    try {
      await onSave({
        name: name.trim(),
        balanceGroup,
        itemType,
        acquisitionDate,
        acquisitionValue: value,
        currentValue: value,
        valuationMethod: "manual",
        usefulLifeMonths: null,
        residualValue: 0,
        notes,
        assetCategory: null,
        costCenterId: null,
        sourceAccountId: null,
        attachmentKey: null,
        attachmentName: null,
      });
    } catch (error) {
      toast.error(safeError(error, "Não foi possível salvar a linha do balanço."));
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="liability-modal-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px] sm:p-8" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="modal-enter flex max-h-full w-full max-w-[460px] flex-col overflow-hidden rounded-[20px] bg-white text-[#0B1F14] shadow-[0_24px_60px_rgba(11,31,20,.22)]">
        <div className="flex shrink-0 items-center gap-3 border-b border-[#EDF1EE] px-6 py-5">
          <div className="min-w-0">
            <h2 id="liability-modal-title" className="text-[18px] font-bold tracking-[-.01em]">
              {item ? "Editar linha do balanço" : "Nova obrigação ou linha de PL"}
            </h2>
            <p className="text-[12.5px] text-[#8A968D]">Dívidas, capital social e ajustes patrimoniais</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F2] text-[#28382E] hover:bg-[#E7ECE9]"><CloseIcon size={16} /></button>
        </div>

        <div className="min-h-0 flex-1 space-y-[18px] overflow-y-auto px-6 py-5">
          <label className="block">
            <span className={assetLabelClass}>Nome</span>
            <input autoFocus required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Empréstimo Inter PJ" className={assetFieldClass} />
          </label>
          <div className="flex gap-3.5">
            <label className="min-w-0 flex-1">
              <span className={assetLabelClass}>Grupo</span>
              <select value={balanceGroup} onChange={event => changeGroup(event.target.value as BalanceGroup)} className={assetFieldClass}>
                <option value="passivo_circulante">Passivo circulante</option>
                <option value="passivo_nao_circulante">Passivo não circulante</option>
                <option value="patrimonio_liquido">Patrimônio líquido</option>
              </select>
            </label>
            <label className="min-w-0 flex-1">
              <span className={assetLabelClass}>Tipo</span>
              <select value={itemType} onChange={event => setItemType(event.target.value as ItemType)} className={assetFieldClass}>
                {allowedTypes.map(value => <option key={value} value={value}>{typeLabels[value]}</option>)}
              </select>
            </label>
          </div>
          <div className="flex gap-3.5">
            <label className="min-w-0 flex-1">
              <span className={assetLabelClass}>Data</span>
              <input required type="date" max={today()} value={acquisitionDate} onChange={event => setAcquisitionDate(event.target.value)} className={assetFieldClass} />
            </label>
            <label className="min-w-0 flex-1">
              <span className={assetLabelClass}>Valor</span>
              <div className="flex h-[46px] items-center gap-2 rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 focus-within:border-[#12B85C]">
                <span className="text-[13px] text-[#8A968D]">R$</span>
                <input required inputMode="decimal" value={currentValue} onFocus={event => event.currentTarget.select()} onChange={event => setCurrentValue(formatCurrencyInput(event.target.value))} className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold outline-none" />
              </div>
            </label>
          </div>
          <label className="block">
            <span className={assetLabelClass}>Observações</span>
            <textarea maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Contrato, credor, vencimento ou responsável" className="min-h-[74px] w-full resize-y rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 py-3 text-[14px] outline-none focus:border-[#12B85C]" />
          </label>
        </div>

        <div className="flex shrink-0 gap-3 border-t border-[#EDF1EE] px-6 py-4">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-xl border border-[#E3EAE5] text-[14px] font-semibold text-[#28382E] hover:bg-[#F8FAF9]">Cancelar</button>
          <button type="submit" disabled={pending} className="h-12 flex-[2] rounded-xl bg-[#12B85C] text-[14px] font-bold text-white hover:bg-[#0F9E4E] disabled:opacity-60">
            {pending ? "Salvando..." : "Salvar"}
          </button>
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

type EvolutionPoint = { referenceDate: string; netWorth: number };

/**
 * Área + linha sobre o cartão escuro, no formato do modelo. Um ponto só não
 * desenha linha: dois pixels ligados por nada sugeririam uma tendência que o
 * histórico ainda não tem.
 */
function EvolutionChart({ points }: { points: EvolutionPoint[] }) {
  const chart = useMemo(() => {
    if (points.length === 0) return null;
    const width = 720;
    const height = 190;
    const topPadding = 22;
    const values = points.map(point => point.netWorth);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      // Série plana: centraliza em vez de dividir por zero.
      min -= Math.max(1, Math.abs(min) * 0.1);
      max += Math.max(1, Math.abs(max) * 0.1);
    }
    const plotted = points.map((point, index) => ({
      ...point,
      x: points.length === 1 ? width / 2 : (index * width) / (points.length - 1),
      y: height - ((point.netWorth - min) / (max - min)) * (height - topPadding),
    }));
    return { width, height, plotted };
  }, [points]);

  if (!chart) return null;
  const line = chart.plotted.map(point => `${point.x},${point.y}`).join(" ");
  const last = chart.plotted[chart.plotted.length - 1];

  return (
    <div className="relative h-[190px] border-b border-[#1F3D2B]">
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Evolução do patrimônio líquido"
      >
        {[47, 95, 143].map(y => <line key={y} x1="0" y1={y} x2={chart.width} y2={y} stroke="#1F3D2B" strokeWidth="1" />)}
        {chart.plotted.length > 1 && (
          <>
            <polygon points={`${line} ${chart.width},${chart.height} 0,${chart.height}`} fill="#12B85C" opacity=".16" />
            <polyline points={line} fill="none" stroke="#12B85C" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </>
        )}
        <circle cx={last.x} cy={last.y} r="5" fill="#7EE2A8" />
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

function StatementLine({ row, share }: { row: StatementRow; share: number | null }) {
  const negative = row.value < 0;
  return (
    <div className="flex items-center gap-2 rounded-[12px] px-3 py-2.5 transition hover:bg-[#F8FAF9]">
      <span className="min-w-0 flex-1 truncate text-[13.5px]">
        {row.label}
        {row.hint && (
          <span className="ml-1.5 text-[9.5px] font-semibold uppercase tracking-[.08em] text-[#B3BFB7]">
            {row.hint}
          </span>
        )}
      </span>
      {share != null && (
        <span className="w-[46px] shrink-0 text-right text-[12px] text-[#8A968D] sm:w-[58px]">{formatPercent(share)}</span>
      )}
      <span className={`w-[92px] shrink-0 text-right text-[13.5px] font-semibold sm:w-[112px] ${negative ? "text-[#B3261E]" : ""}`}>
        {formatDecimal(row.value)}
      </span>
    </div>
  );
}

function StatementBlock({ sections, tone, shareBase }: {
  sections: StatementSection[];
  tone: "asset" | "liability";
  shareBase: number | null;
}) {
  const headerClass = tone === "asset"
    ? "bg-[#F1FBF6] text-[#0A7A42]"
    : "bg-[#FDECEA] text-[#8E1F16]";
  return (
    <div className="flex flex-col gap-1.5">
      {sections.map((section, index) => (
        <div key={section.title} className={`flex flex-col gap-1.5 ${index > 0 ? "mt-2" : ""}`}>
          <div className={`flex items-center gap-2 rounded-[12px] px-3 py-2.5 ${headerClass}`}>
            <span className="min-w-0 flex-1 text-[12px] font-semibold uppercase tracking-[.06em]">{section.title}</span>
            <span className="shrink-0 text-[13px] font-bold">{formatMoney(section.total)}</span>
          </div>
          {section.rows.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-[#8A968D]">Nenhum item cadastrado neste grupo.</p>
          ) : (
            section.rows.map(row => (
              <StatementLine
                key={`${section.title}-${row.label}`}
                row={row}
                share={shareBase && shareBase > 0 ? (row.value / shareBase) * 100 : null}
              />
            ))
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * `highlight` põe o cartão sobre a superfície aurora — o mesmo destaque do
 * caixa disponível na visão geral. Sobre esse fundo as cores de sinal saem de
 * cena: verde ou vermelho sobre verde escuro não se lê.
 */
function KpiCard({ icon: Icon, chipClass, label, value, valueClass, caption, captionClass, highlight = false }: {
  icon: IconlyIcon;
  chipClass: string;
  label: string;
  value: string;
  valueClass?: string;
  caption: string;
  captionClass?: string;
  highlight?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] ${highlight ? "bg-white/12 text-[#7EE2A8]" : chipClass}`}>
          <Icon size={17} />
        </span>
        <span className={`truncate text-[12.5px] font-semibold ${highlight ? "text-[#8FB39E]" : "text-[#4C6355]"}`}>{label}</span>
      </div>
      <strong className={`text-[26px] font-bold tracking-[-.02em] ${highlight ? "text-white" : valueClass ?? ""}`}>{value}</strong>
      <span className={`text-[12px] font-semibold ${highlight ? "text-[#C5DACE]" : captionClass ?? "text-[#8A968D]"}`}>{caption}</span>
    </>
  );

  if (highlight) {
    return (
      <AuroraSurface className="rounded-[20px] p-5">
        <div className="flex flex-1 flex-col gap-3">{content}</div>
      </AuroraSurface>
    );
  }
  return <article className="flex flex-col gap-3 rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3]">{content}</article>;
}

export default function BalanceSheetPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  const [period, setPeriod] = useState<Period>("mensal");
  const [itemModal, setItemModal] = useState(false);
  const [snapshotModal, setSnapshotModal] = useState(false);
  const [evolutionRange, setEvolutionRange] = useState<EvolutionRange>("12");
  const preferences = usePreferences();
  const [editingItem, setEditingItem] = useState<PatrimonialItem | null>(null);
  const [newItemGroup, setNewItemGroup] = useState<BalanceGroup>("ativo_nao_circulante");
  const utils = trpc.useUtils();
  const overviewQuery = trpc.balanceSheet.overview.useQuery(undefined);
  const organizationQuery = trpc.organization.options.useQuery();
  const organizationOptions: OrganizationOptions = {
    accounts: organizationQuery.data?.accounts ?? [],
    costCenters: organizationQuery.data?.costCenters ?? [],
  };
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

  // Bem e obrigação têm formulários diferentes; o grupo decide qual abrir.
  const openNew = (group?: BalanceGroup) => {
    setEditingItem(null);
    setNewItemGroup(group ?? "ativo_nao_circulante");
    setItemModal(true);
    if (group?.startsWith("passivo_")) setTab("liabilities");
  };
  const openEdit = (item: PatrimonialItem) => {
    setEditingItem(item);
    setNewItemGroup(item.balanceGroup);
    setItemModal(true);
  };
  const editingIsAsset = editingItem
    ? editingItem.balanceGroup.startsWith("ativo_")
    : newItemGroup.startsWith("ativo_");
  const saveItem = async (values: PatrimonialValues) => {
    if (editingItem) await updateItem.mutateAsync({ id: editingItem.id, ...values });
    else await createItem.mutateAsync(values);
    setItemModal(false);
    setEditingItem(null);
    toast.success(editingIsAsset
      ? (editingItem ? "Bem atualizado" : "Bem cadastrado no imobilizado")
      : (editingItem ? "Linha do balanço atualizada" : "Linha do balanço cadastrada"));
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

  const totals = {
    cashAndEquivalents: summary?.cashAndEquivalents ?? 0,
    financialCurrentLiabilities: summary?.financialCurrentLiabilities ?? 0,
    currentAssets: summary?.currentAssets ?? 0,
    nonCurrentAssets: summary?.nonCurrentAssets ?? 0,
    currentLiabilities: summary?.currentLiabilities ?? 0,
    nonCurrentLiabilities: summary?.nonCurrentLiabilities ?? 0,
    declaredEquity: summary?.declaredEquity ?? 0,
    totalAssets: summary?.totalAssets ?? 0,
    totalLiabilities: summary?.totalLiabilities ?? 0,
    netWorth: summary?.netWorth ?? 0,
    balanceDifference: summary?.balanceDifference ?? 0,
  };
  const activeItems = items.filter(item => item.isActive);
  const rowsOf = (group: BalanceGroup): StatementRow[] =>
    activeItems
      .filter(item => item.balanceGroup === group)
      .map(item => ({ label: item.name, value: item.bookValue }));

  const assetSections: StatementSection[] = [
    {
      title: "Ativo circulante",
      total: totals.currentAssets,
      rows: [
        ...(totals.cashAndEquivalents !== 0
          ? [{ label: "Caixa e equivalentes", value: totals.cashAndEquivalents, hint: "automático" }]
          : []),
        ...rowsOf("ativo_circulante"),
      ],
    },
    {
      title: "Ativo não circulante",
      total: totals.nonCurrentAssets,
      rows: rowsOf("ativo_nao_circulante"),
    },
  ];
  const liabilitySections: StatementSection[] = [
    {
      title: "Passivo circulante",
      total: totals.currentLiabilities,
      rows: [
        ...(totals.financialCurrentLiabilities !== 0
          ? [{ label: "Contas a pagar em aberto", value: totals.financialCurrentLiabilities, hint: "automático" }]
          : []),
        ...rowsOf("passivo_circulante"),
      ],
    },
    {
      title: "Passivo não circulante",
      total: totals.nonCurrentLiabilities,
      rows: rowsOf("passivo_nao_circulante"),
    },
  ];
  const equityRows: StatementRow[] = [
    ...rowsOf("patrimonio_liquido"),
    ...(Math.abs(totals.balanceDifference) >= 0.01
      ? [{ label: "Resultado acumulado", value: totals.balanceDifference, hint: "calculado" }]
      : []),
  ];
  const accumulatedDepreciation = activeItems
    .filter(item => item.balanceGroup.startsWith("ativo_"))
    .reduce((sum, item) => sum + item.accumulatedDepreciation, 0);

  // Compara com o último fechamento salvo até o fim do período anterior. Sem esse
  // fechamento a variação não é exibida, em vez de inventar uma base.
  const referenceDate = data?.referenceDate ?? todayIso();
  const baselineDate = periodBaseline(period, referenceDate);
  const baseline = findBaseline(data?.history ?? [], baselineDate);
  const assetsChange = assetsChangePercent(totals.totalAssets, baseline);
  const netWorthDelta = netWorthChange(totals.netWorth, baseline);
  const assetsCaption = assetsChange == null || !baseline
    ? "Circulante e não circulante"
    : `${formatSignedPercent(assetsChange)} vs. ${formatDate(baseline.referenceDate)}`;
  const netWorthCaption = netWorthDelta == null
    ? "Ativos menos passivos"
    : `${formatSignedMoney(netWorthDelta)} ${periodNouns[period]}`;
  const liabilitiesCaption = summary?.debtRatio == null
    ? "Obrigações de curto e longo prazo"
    : `${formatPercent(summary.debtRatio)} do ativo`;

  // A janela do gráfico e das métricas. "Tudo" não corta nada.
  const evolution = useMemo(() => {
    const history = data?.history ?? [];
    const months = evolutionRange === "tudo" ? null : Number(evolutionRange);
    const cutoff = months
      ? new Date(Date.UTC(
          Number(referenceDate.slice(0, 4)),
          Number(referenceDate.slice(5, 7)) - 1 - months,
          Number(referenceDate.slice(8, 10))
        )).toISOString().slice(0, 10)
      : null;
    const points = cutoff ? history.filter(snapshot => snapshot.referenceDate >= cutoff) : history;

    const movementItems = activeItems
      .filter(item => item.balanceGroup.startsWith("ativo_"))
      .map(item => ({
        name: item.name,
        isActive: item.isActive,
        acquisitionDate: item.acquisitionDate,
        acquisitionValueNumber: item.acquisitionValueNumber,
        residualValueNumber: item.residualValueNumber,
        usefulLifeMonths: item.usefulLifeMonths,
        valuationMethod: item.valuationMethod,
      }));

    // Os meses da janela, do mais antigo até a referência. Sem corte de data
    // ("Tudo") a janela precisa alcançar a aquisição mais antiga: começar no
    // primeiro fechamento fazia "Tudo" somar menos aportes que "12 meses",
    // porque um bem comprado antes do primeiro fechamento ficava de fora.
    const monthsInRange: string[] = [];
    const earliestAcquisition = movementItems
      .map(item => item.acquisitionDate)
      .filter((date): date is string => Boolean(date))
      .sort()[0];
    const start = cutoff
      ?? [points[0]?.referenceDate, earliestAcquisition]
        .filter((date): date is string => Boolean(date))
        .sort()[0]
      ?? referenceDate;
    let cursor = monthKeyOf(start);
    const end = monthKeyOf(referenceDate);
    for (let guard = 0; guard < 600 && cursor <= end; guard += 1) {
      monthsInRange.push(cursor);
      const [year, month] = cursor.split("-").map(Number);
      cursor = month === 12
        ? `${year + 1}-01`
        : `${year}-${String(month + 1).padStart(2, "0")}`;
    }

    const oldest = points.length > 1 ? points[0].netWorth : null;
    return {
      points,
      growth: oldest ? ((totals.netWorth - oldest) / Math.abs(oldest)) * 100 : null,
      growthSince: points.length > 1 ? points[0].referenceDate : null,
      contributions: monthsInRange.reduce((sum, key) => sum + contributionsOf(movementItems, key), 0),
      depreciation: monthsInRange.reduce(
        (sum, key) => sum + movementItems.reduce((inner, item) => inner + monthlyDepreciationOf(item, key), 0),
        0
      ),
      assetCount: movementItems.length,
      movementItems,
    };
  }, [activeItems, data?.history, evolutionRange, referenceDate, totals.netWorth]);

  // Cada fechamento salvo vira uma linha, do mais recente para o mais antigo.
  const movementRows = useMemo(
    () => (data?.history ?? [])
      .slice()
      .reverse()
      .map(snapshot => ({
        ...buildMovementRow(evolution.movementItems, monthKeyOf(snapshot.referenceDate)),
        snapshot,
      })),
    [data?.history, evolution.movementItems]
  );

  const exportBalanceSheet = () => {
    const reference = referenceDate;
    const lines: string[][] = [["Grupo", "Linha", "Valor"]];
    const pushSections = (sections: StatementSection[]) => {
      for (const section of sections) {
        lines.push([section.title, "Total do grupo", section.total.toFixed(2)]);
        for (const row of section.rows) lines.push([section.title, row.label, row.value.toFixed(2)]);
      }
    };
    pushSections(assetSections);
    pushSections(liabilitySections);
    lines.push(["Patrimônio líquido", "Total do grupo", totals.netWorth.toFixed(2)]);
    for (const row of equityRows) lines.push(["Patrimônio líquido", row.label, row.value.toFixed(2)]);
    if (accumulatedDepreciation > 0) {
      lines.push(["Informativo", "Depreciação acumulada já deduzida", accumulatedDepreciation.toFixed(2)]);
    }
    lines.push(["Totais", "Ativo total", totals.totalAssets.toFixed(2)]);
    lines.push(["Totais", "Passivo total", totals.totalLiabilities.toFixed(2)]);
    lines.push(["Totais", "Patrimônio líquido", totals.netWorth.toFixed(2)]);
    const csv = lines
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `balanco-patrimonial-${reference}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><MenuIcon size={18} /></button>
            <div className="mr-auto">
              <h1 className="text-[24px] font-bold tracking-[-.02em]">Balanço patrimonial</h1>
              <p className="mt-0.5 text-[12.5px] text-[#8A968D]">
                Posição em {formatDate(referenceDate)} · valores em {CURRENCY_LABELS[preferences.currency].name.toLowerCase()}
              </p>
              <p className="mt-0.5 text-[11px] text-[#B3BFB7]">
                {baseline
                  ? `Comparando com o fechamento de ${formatDate(baseline.referenceDate)}`
                  : `Sem fechamento salvo até ${formatDate(baselineDate)} para comparar`}
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-[12px] bg-white p-1.5 ring-1 ring-[#E1E8E3]">
              {(["mensal", "trimestral", "anual"] as Period[]).map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  aria-pressed={period === value}
                  className={`rounded-[9px] px-3.5 py-[7px] text-[12.5px] transition ${
                    period === value
                      ? "bg-[#12B85C] font-bold text-white"
                      : "text-[#4C6355] hover:bg-[#F1FBF6]"
                  }`}
                >
                  {periodLabels[value]}
                </button>
              ))}
            </div>
            <button type="button" onClick={exportBalanceSheet} className="flex h-10 items-center gap-2 rounded-[12px] bg-white px-3.5 text-[12.5px] font-semibold text-[#28382E] ring-1 ring-[#E1E8E3] hover:bg-[#F1FBF6]"><DownloadIcon size={15} />Exportar</button>
            <button type="button" onClick={() => openNew()} className="flex h-10 items-center gap-2 rounded-[12px] bg-[#12B85C] px-4 text-[13px] font-bold text-white hover:bg-[#0F9E4E]"><PlusIcon size={15} />Cadastrar bem</button>
            <ProfileMenu />
          </header>

          {overviewQuery.isLoading && <section className="flex min-h-[520px] flex-1 items-center justify-center gap-3 rounded-[20px] bg-white text-[12px] text-[#718077] ring-1 ring-[#E1E8E3]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#12B85C]/20 border-t-[#12B85C]" />Carregando patrimônio...</section>}
          {overviewQuery.isError && <section className="flex min-h-[520px] flex-1 flex-col items-center justify-center rounded-[20px] bg-white ring-1 ring-[#E1E8E3]"><strong className="text-[#B3261E]">Não foi possível carregar o balanço</strong><button type="button" onClick={() => overviewQuery.refetch()} className="mt-3 rounded-xl bg-[#FDECEA] px-4 py-2 text-[12px] font-bold text-[#8E1F16]">Tentar novamente</button></section>}

          {!overviewQuery.isLoading && !overviewQuery.isError && (
            <>
              <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  highlight
                  icon={ChartIcon}
                  chipClass="bg-[#DFF6EA] text-[#0A7A42]"
                  label="Ativo total"
                  value={formatMoney(totals.totalAssets)}
                  caption={assetsCaption}
                  captionClass={
                    assetsChange == null
                      ? "text-[#8A968D]"
                      : assetsChange >= 0
                        ? "text-[#0A7A42]"
                        : "text-[#B3261E]"
                  }
                />
                <KpiCard
                  icon={ArrowDownIcon}
                  chipClass="bg-[#FDECEA] text-[#B3261E]"
                  label="Passivo total"
                  value={formatMoney(totals.totalLiabilities)}
                  valueClass="text-[#B3261E]"
                  caption={liabilitiesCaption}
                />
                <KpiCard
                  icon={TrendUpIcon}
                  chipClass="bg-[#DFF6EA] text-[#0A7A42]"
                  label="Patrimônio líquido"
                  value={formatMoney(totals.netWorth)}
                  valueClass={totals.netWorth >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}
                  caption={netWorthCaption}
                  captionClass={
                    netWorthDelta == null
                      ? "text-[#8A968D]"
                      : netWorthDelta >= 0
                        ? "text-[#0A7A42]"
                        : "text-[#B3261E]"
                  }
                />
                <KpiCard
                  icon={DashboardIcon}
                  chipClass="bg-[#F1F4F2] text-[#28382E]"
                  label="Liquidez corrente"
                  value={summary?.liquidityRatio == null ? "—" : formatDecimal(summary.liquidityRatio)}
                  caption="ativo circ. ÷ passivo circ."
                />
              </section>

              <section className="flex overflow-x-auto rounded-[14px] bg-white p-1 ring-1 ring-[#E1E8E3] sm:w-fit">
                {([[
                  "overview", "Visão do balanço"
                ], ["assets", "Bens e direitos"], ["liabilities", "Obrigações e PL"], ["evolution", "Evolução"]] as Array<[Tab, string]>).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} className={`whitespace-nowrap rounded-[10px] px-4 py-2.5 text-[12px] font-bold ${tab === value ? "bg-[#DFF6EA] text-[#0A7A42]" : "text-[#718077]"}`}>{label}</button>)}
              </section>

              {tab === "overview" && (
                <section className="grid flex-1 items-start gap-5 xl:grid-cols-2">
                  <article className="min-w-0 rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3]">
                    <div className="flex items-center gap-3">
                      <h2 className="text-[15px] font-bold">Ativo</h2>
                      <span className="ml-auto text-[15px] font-bold">{formatMoney(totals.totalAssets)}</span>
                    </div>
                    <div className="mt-3.5">
                      <StatementBlock sections={assetSections} tone="asset" shareBase={totals.totalAssets} />
                    </div>
                    {accumulatedDepreciation > 0 && (
                      <div className="mt-3 flex items-center gap-2 rounded-[12px] bg-[#F8FAF9] px-3 py-2.5">
                        <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-[#718077]">
                          Depreciação acumulada já deduzida dos valores acima
                        </span>
                        <span className="shrink-0 text-[12.5px] font-semibold text-[#B3261E]">
                          − {formatDecimal(accumulatedDepreciation)}
                        </span>
                      </div>
                    )}
                    <p className="mt-3 text-[11px] leading-relaxed text-[#8A968D]">
                      {data?.accountCount ?? 0}{" "}
                      {(data?.accountCount ?? 0) === 1
                        ? "conta financeira entra no caixa automaticamente"
                        : "contas financeiras entram no caixa automaticamente"}
                      . Não cadastre esse saldo outra vez como bem.
                    </p>
                  </article>

                  <div className="flex min-w-0 flex-col gap-5">
                    <article className="min-w-0 rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3]">
                      <div className="flex items-center gap-3">
                        <h2 className="text-[15px] font-bold">Passivo</h2>
                        <span className="ml-auto text-[15px] font-bold text-[#B3261E]">
                          {formatMoney(totals.totalLiabilities)}
                        </span>
                      </div>
                      <div className="mt-3.5">
                        <StatementBlock sections={liabilitySections} tone="liability" shareBase={null} />
                      </div>
                    </article>

                    <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3]">
                      <div className="flex items-center gap-3">
                        <h2 className="text-[15px] font-bold">Patrimônio líquido</h2>
                        <span className={`ml-auto text-[15px] font-bold ${totals.netWorth >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>
                          {formatMoney(totals.netWorth)}
                        </span>
                      </div>
                      <div className="mt-3.5 flex flex-col gap-1.5">
                        {equityRows.length === 0 ? (
                          <p className="px-3 py-2 text-[12px] text-[#8A968D]">
                            Nenhuma linha de patrimônio líquido cadastrada.
                          </p>
                        ) : (
                          equityRows.map(row => <StatementLine key={row.label} row={row} share={null} />)
                        )}
                      </div>
                      <div className="mt-3.5 flex items-center gap-2.5 rounded-[14px] bg-[#F1FBF6] p-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#0A7A42]">
                          <CheckIcon size={15} />
                        </span>
                        <span className="min-w-0 flex-1 text-[12.5px] font-semibold text-[#0A7A42]">
                          Balanço fechado: ativo = passivo + PL
                        </span>
                        <span className="shrink-0 text-[12.5px] font-bold text-[#0A7A42]">
                          {formatDecimal(totals.totalAssets)}
                        </span>
                      </div>
                      {Math.abs(totals.balanceDifference) >= 0.01 && (
                        <p className="mt-2 rounded-[12px] bg-[#FFF8E8] px-3 py-2.5 text-[11px] leading-relaxed text-[#725517]">
                          O PL informado nos cadastros é {formatMoney(totals.declaredEquity)}. A diferença de{" "}
                          {formatMoney(totals.balanceDifference)} entra acima como resultado acumulado.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => setSnapshotModal(true)}
                        className="mt-2 w-full rounded-[12px] bg-[#F1F4F2] px-3 py-2.5 text-[12px] font-bold text-[#4C6355] hover:bg-[#E8EEEA]"
                      >
                        Registrar esta posição no histórico
                      </button>
                    </article>
                  </div>
                </section>
              )}

              {(tab === "assets" || tab === "liabilities") && <section className="min-h-[430px] flex-1 rounded-[20px] bg-white p-4 ring-1 ring-[#E1E8E3] sm:p-5"><div className="mb-4 flex items-center"><div><h2 className="text-[15px] font-bold">{tab === "assets" ? "Bens e direitos da empresa" : "Obrigações e patrimônio líquido"}</h2><p className="mt-0.5 text-[11.5px] text-[#8A968D]">{tab === "assets" ? "Ativos circulantes, imobilizados, estoques e investimentos" : "Dívidas de curto e longo prazo, capital e ajustes"}</p></div><span className="ml-auto rounded-lg bg-[#F1F4F2] px-2.5 py-1 text-[10.5px] font-bold text-[#607067]">{tab === "assets" ? assetItems.length : liabilityItems.length} {(tab === "assets" ? assetItems.length : liabilityItems.length) === 1 ? "cadastrado" : "cadastrados"}</span></div><ItemList items={tab === "assets" ? assetItems : liabilityItems} emptyTitle={tab === "assets" ? "Nenhum bem ou direito cadastrado" : "Nenhuma obrigação ou linha de PL"} emptyText={tab === "assets" ? "Cadastre imóveis, veículos, equipamentos, estoque, investimentos e outros bens da empresa." : "Cadastre fornecedores, empréstimos, financiamentos, capital social e ajustes patrimoniais."} onCreate={() => openNew(tab === "assets" ? "ativo_nao_circulante" : "passivo_circulante")} onEdit={openEdit} onToggle={item => toggleItem.mutate({ id: item.id })} onDelete={handleDelete} /></section>}

              {tab === "evolution" && (
                <section className="flex flex-1 flex-col gap-5">
                  <article className="flex flex-col gap-[18px] rounded-[20px] bg-[#0B1F14] p-6 text-white">
                    <div className="flex flex-wrap items-center gap-3">
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8FB39E]">
                          Evolução do patrimônio líquido
                        </span>
                        <strong className="mt-1 block text-[34px] font-bold leading-[1.1] tracking-[-.03em]">
                          {formatMoney(totals.netWorth)}
                        </strong>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5 rounded-[12px] bg-[#12321F] p-1.5">
                        {(["12", "24", "tudo"] as const).map(value => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setEvolutionRange(value)}
                            aria-pressed={evolutionRange === value}
                            className={`rounded-[9px] px-3 py-1.5 text-[12.5px] transition ${
                              evolutionRange === value ? "bg-[#12B85C] font-bold text-white" : "text-[#A9CBBA] hover:bg-[#1A4229]"
                            }`}
                          >
                            {value === "tudo" ? "Tudo" : `${value} meses`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-8 gap-y-4">
                      <div>
                        <span className="block text-[11px] text-[#8FB39E]">
                          {evolution.growthSince ? `Crescimento desde ${formatDate(evolution.growthSince)}` : "Crescimento"}
                        </span>
                        <strong className={`mt-0.5 block text-[17px] font-bold ${evolution.growth == null ? "text-white" : evolution.growth >= 0 ? "text-[#7EE2A8]" : "text-[#F4A497]"}`}>
                          {evolution.growth == null ? "—" : formatSignedPercent(evolution.growth)}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[#8FB39E]">Aporte de bens</span>
                        <strong className="mt-0.5 block text-[17px] font-bold">{formatMoney(evolution.contributions)}</strong>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[#8FB39E]">Depreciação no período</span>
                        <strong className={`mt-0.5 block text-[17px] font-bold ${evolution.depreciation > 0 ? "text-[#F4A497]" : "text-white"}`}>
                          {evolution.depreciation > 0 ? `− ${formatMoney(evolution.depreciation)}` : formatMoney(0)}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[11px] text-[#8FB39E]">Itens no imobilizado</span>
                        <strong className="mt-0.5 block text-[17px] font-bold">{evolution.assetCount}</strong>
                      </div>
                    </div>

                    {evolution.points.length === 0 ? (
                      <div className="flex min-h-[190px] flex-col items-center justify-center rounded-[14px] border border-dashed border-[#1F3D2B] px-6 text-center">
                        <strong className="text-[14px]">A evolução começa no primeiro fechamento</strong>
                        <p className="mt-1 max-w-[400px] text-[12px] leading-relaxed text-[#C5DACE]">
                          Registre a posição atual para criar o primeiro ponto real do histórico. O gráfico só usa posições que você salvou.
                        </p>
                        <button type="button" onClick={() => setSnapshotModal(true)} className="mt-4 rounded-xl bg-[#12B85C] px-4 py-2.5 text-[12.5px] font-bold text-white hover:bg-[#0F9E4E]">
                          Registrar primeira posição
                        </button>
                      </div>
                    ) : (
                      <>
                        <EvolutionChart points={evolution.points} />
                        <div className="flex text-[11.5px] text-[#8FB39E]">
                          {evolution.points.map((point, index) => (
                            <span
                              key={point.referenceDate}
                              className={`flex-1 ${index === evolution.points.length - 1 ? "text-right font-semibold text-white" : ""}`}
                            >
                              {monthLabel(monthKeyOf(point.referenceDate))}
                            </span>
                          ))}
                        </div>
                        {evolution.points.length === 1 && (
                          <p className="text-[11.5px] text-[#C5DACE]">
                            Um único fechamento salvo: a linha aparece a partir do segundo.
                          </p>
                        )}
                      </>
                    )}
                  </article>

                  <article className="flex flex-1 flex-col gap-3.5 rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3]">
                    <div className="flex items-center gap-3">
                      <h2 className="text-[15px] font-bold">Movimentação do patrimônio</h2>
                      <button type="button" onClick={() => setSnapshotModal(true)} className="ml-auto text-[12.5px] font-semibold text-[#0A7A42] hover:underline">
                        Registrar posição
                      </button>
                    </div>

                    {movementRows.length === 0 ? (
                      <p className="rounded-[14px] bg-[#F8FAF9] p-4 text-[12px] leading-relaxed text-[#8A968D]">
                        Nenhum fechamento registrado até o momento. Cada posição salva vira uma linha aqui.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="min-w-[680px]">
                          <div className={`${MOVEMENT_GRID} border-b border-[#F1F4F2] px-3 pb-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]`}>
                            <span>Mês</span>
                            <span>Principal movimento</span>
                            <span className="text-right">Aportes</span>
                            <span className="text-right">Depreciação</span>
                            <span className="text-right">Patrimônio</span>
                            <span />
                          </div>
                          <div className="flex flex-col gap-1 pt-1">
                            {movementRows.map((row, index) => (
                              <div key={row.snapshot.id} className={`${MOVEMENT_GRID} items-center rounded-[14px] px-3 py-2.5 text-[13.5px] ${index === 0 ? "bg-[#F1FBF6]" : "bg-[#F8FAF9]"}`}>
                                <span className={index === 0 ? "font-bold text-[#0A7A42]" : "text-[#8A968D]"}>{row.label}</span>
                                <span className={`truncate ${index === 0 ? "font-semibold text-[#0A7A42]" : ""}`} title={row.movement}>{row.movement}</span>
                                <span className={`text-right font-semibold ${row.contributions > 0 ? (index === 0 ? "text-[#0A7A42]" : "") : "text-[#8A968D]"}`}>
                                  {row.contributions > 0 ? `+ ${formatDecimal(row.contributions)}` : "—"}
                                </span>
                                <span className={`text-right ${row.depreciation > 0 ? "text-[#B3261E]" : "text-[#8A968D]"}`}>
                                  {row.depreciation > 0 ? formatDecimal(row.depreciation) : "—"}
                                </span>
                                <span className={`text-right font-bold ${index === 0 ? "text-[#0A7A42]" : ""}`}>{formatDecimal(row.snapshot.netWorth)}</span>
                                <button
                                  type="button"
                                  aria-label={`Excluir fechamento de ${formatDate(row.snapshot.referenceDate)}`}
                                  onClick={async () => {
                                    if (!window.confirm(`Excluir o fechamento de ${formatDate(row.snapshot.referenceDate)}? Os bens e obrigações não são afetados.`)) return;
                                    await deleteSnapshot.mutateAsync({ id: row.snapshot.id });
                                    toast.success("Fechamento removido");
                                  }}
                                  className="flex h-7 w-7 items-center justify-center justify-self-end rounded-lg text-[#B3BFB7] hover:bg-[#FDECEA] hover:text-[#B3261E]"
                                >
                                  <DeleteIcon size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-[11px] leading-relaxed text-[#8A968D]">
                      Aportes e depreciação são calculados a partir das datas de aquisição e da vida útil dos bens. O patrimônio é o valor salvo em cada fechamento.
                    </p>
                  </article>
                </section>
              )}
            </>
          )}
        </section>
      </div>
      {itemModal && (editingIsAsset
        ? <AssetModal item={editingItem} pending={createItem.isPending || updateItem.isPending} options={organizationOptions} onManageOrganization={() => setLocation("/organizacao")} onClose={() => { setItemModal(false); setEditingItem(null); }} onSave={saveItem} />
        : <LiabilityModal item={editingItem} initialGroup={newItemGroup} pending={createItem.isPending || updateItem.isPending} onClose={() => { setItemModal(false); setEditingItem(null); }} onSave={saveItem} />)}
      {snapshotModal && <SnapshotModal pending={captureSnapshot.isPending} onClose={() => setSnapshotModal(false)} onSave={saveSnapshot} />}
    </main>
  );
}
