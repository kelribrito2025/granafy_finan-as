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
import { AuroraSurface } from "@/components/AuroraSurface";
import { ConnectedAccounts } from "@/components/ConnectedAccounts";
import { GranafyLogo } from "@/components/GranafyLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { trpc } from "@/lib/trpc";
import { currencyInputToNumber, formatCurrencyInput, formatCurrencyValue } from "@/lib/currency";
import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type NavItem = { label: string; icon: IconlyIcon; disabled?: boolean };
type Account = {
  id: number;
  name: string;
  institution: string;
  accountType: "corrente" | "poupanca" | "carteira" | "cartao" | "gateway" | "outro";
  color: string;
  initialBalance: number;
  balance: number;
  transactionCount: number;
  isActive: boolean;
};
type Category = {
  id: number;
  name: string;
  type: "entrada" | "saida" | "ambos";
  color: string;
  transactionCount: number;
  total: number;
  isActive: boolean;
};
type CostCenter = {
  id: number;
  name: string;
  color: string;
  transactionCount: number;
  total: number;
  isActive: boolean;
};

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
const organizationItems: NavItem[] = [{ label: "Contas e categorias", icon: SettingsIcon }];

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function NavGroup({ title, items, onSelect }: { title: string; items: NavItem[]; onSelect: (label: string) => void }) {
  return <div className="flex flex-col gap-[3px]"><span className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#B3BFB7]">{title}</span>{items.map(({ label, icon: Icon, disabled = false }) => {
    const selected = label === "Contas e categorias";
    return <button key={label} type="button" disabled={disabled} aria-disabled={disabled} title={disabled ? "Página em desenvolvimento" : undefined} onClick={() => onSelect(label)} className={`flex w-full items-center gap-[11px] rounded-xl px-3 py-[9px] text-left text-[13px] transition active:scale-[.98] ${selected ? "bg-[#12B85C] font-bold text-white" : disabled ? "cursor-not-allowed text-[#A8B1AB] opacity-55" : "text-[#28382E] hover:bg-[#F1FBF6]"}`}><Icon size={16} /><span className="truncate">{label}</span></button>;
  })}</div>;
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const select = (label: string) => {
    onClose();
    if (label === "Visão geral") setLocation("/");
    else if (label === "Lançamentos") setLocation("/lancamentos");
    else if (label === "Balanço Patrimonial") setLocation("/balanco-patrimonial");
    else if (label !== "Contas e categorias") toast.info(`${label} ainda não está disponível.`);
  };
  return <>{open && <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-40 bg-[#07150d]/35 backdrop-blur-[2px] xl:hidden" onClick={onClose} />}<aside className={`fixed inset-y-3 left-3 z-50 flex w-[236px] shrink-0 flex-col gap-[14px] overflow-hidden rounded-[20px] bg-white px-[14px] py-5 shadow-[0_18px_44px_rgba(11,31,20,.16)] transition-transform xl:sticky xl:inset-auto xl:top-5 xl:h-[calc(100vh-40px)] xl:translate-x-0 xl:shadow-none ${open ? "translate-x-0" : "-translate-x-[260px]"}`}><div className="flex items-center gap-2.5 px-1.5"><GranafyLogo size={36} subtitle="Número Virtual LTDA" className="min-w-0 flex-1" /><button type="button" aria-label="Fechar menu" onClick={onClose} className="ml-auto rounded-lg p-1 text-[#8A968D] hover:bg-[#F1F4F2] xl:hidden"><CloseIcon size={17} /></button></div><NavGroup title="Painel" items={panelItems} onSelect={select} /><NavGroup title="Análise" items={analysisItems} onSelect={select} /><NavGroup title="Organização" items={organizationItems} onSelect={select} /><ConnectedAccounts className="mt-auto" /></aside></>;
}

type BankPreset = { id: string; name: string; initials: string; color: string; logo?: string };

const BANK_PRESETS: readonly BankPreset[] = [
  { id: "efi", name: "Efi Bank", initials: "EF", color: "#F28C28", logo: "/manus-storage/efi-bank-logo_221c9925.png" },
  { id: "conta-simples", name: "Conta Simples", initials: "CS", color: "#00A86B" },
  { id: "cloudwalk", name: "CloudWalk", initials: "CW", color: "#635BFF" },
  { id: "nubank", name: "Nubank", initials: "NU", color: "#820AD1" },
  { id: "itau", name: "Itaú", initials: "IT", color: "#EC7000" },
  { id: "bradesco", name: "Bradesco", initials: "BR", color: "#CC092F" },
] as const;

type BankPresetId = (typeof BANK_PRESETS)[number]["id"] | "outro";

function BankMark({ institution, color, compact = false }: { institution: string; color: string; compact?: boolean }) {
  const preset = BANK_PRESETS.find(item => item.name.toLowerCase() === institution.toLowerCase());
  const sizeClass = compact ? "h-7 min-w-7 rounded-lg" : "h-10 min-w-10 rounded-xl";
  if (preset?.logo) return <span className={`flex ${sizeClass} items-center justify-center overflow-hidden bg-white p-1 ring-1 ring-[#E1E8E3]`}><img src={preset.logo} alt={`Logo ${preset.name}`} className="h-full w-full object-contain" /></span>;
  return <span className={`flex ${sizeClass} items-center justify-center px-1.5 font-extrabold text-white ${compact ? "text-[9px]" : "text-[12px]"}`} style={{ backgroundColor: preset?.color ?? color }}>{preset?.initials ?? institution.slice(0, 2).toUpperCase()}</span>;
}

function AccountModal({ account, pending, onClose, onSave }: { account?: Account | null; pending: boolean; onClose: () => void; onSave: (values: { name: string; institution: string; accountType: Account["accountType"]; color: string; initialBalance: number }) => Promise<void> }) {
  const matchedPreset = BANK_PRESETS.find(item => item.name.toLowerCase() === account?.institution.toLowerCase());
  const [institutionChoice, setInstitutionChoice] = useState<BankPresetId>(matchedPreset?.id ?? "outro");
  const [name, setName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [accountType, setAccountType] = useState<Account["accountType"]>(account?.accountType ?? "corrente");
  const [color, setColor] = useState(account?.color ?? "#12B85C");
  const [initialBalance, setInitialBalance] = useState(account ? formatCurrencyValue(account.initialBalance) : "0,00");
  const [errorMessage, setErrorMessage] = useState("");

  const selectPreset = (preset: (typeof BANK_PRESETS)[number]) => {
    const shouldReplaceName = !name.trim() || name === institution;
    setInstitutionChoice(preset.id);
    setInstitution(preset.name);
    setErrorMessage("");
    if (shouldReplaceName) setName(preset.name);
    if (!account) setColor(preset.color);
  };

  const selectOther = () => {
    const shouldClearName = !account && name === institution;
    setInstitutionChoice("outro");
    setErrorMessage("");
    if (BANK_PRESETS.some(item => item.name === institution)) setInstitution("");
    if (shouldClearName) setName("");
    if (!account) setColor("#12B85C");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = currencyInputToNumber(initialBalance);
    if (!Number.isFinite(parsed)) return toast.error("Informe um saldo inicial válido");
    if (!institution.trim()) return toast.error("Selecione ou informe a instituição");
    setErrorMessage("");
    try {
      await onSave({ name: name.trim(), institution: institution.trim(), accountType, color, initialBalance: parsed });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível salvar a conta");
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="account-modal-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="modal-enter max-h-[calc(100vh-32px)] w-full max-w-[520px] overflow-y-auto rounded-[22px] bg-white p-5 sm:p-6">
        <div className="flex items-start">
          <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Conta financeira</p><h2 id="account-modal-title" className="mt-1 text-xl font-bold">{account ? "Editar conta" : "Nova conta"}</h2><p className="mt-1 text-xs text-[#8A968D]">Escolha a instituição ou cadastre outro banco.</p></div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355]"><CloseIcon size={17} /></button>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Instituição</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BANK_PRESETS.map(preset => {
              const selected = institutionChoice === preset.id;
              return <button key={preset.id} type="button" aria-pressed={selected} onClick={() => selectPreset(preset)} className={`flex min-h-[70px] flex-col items-center justify-center rounded-xl px-2 py-2.5 text-center ring-1 transition active:scale-[.98] ${selected ? "bg-[#F1FBF6] text-[#0A7A42] ring-2 ring-[#12B85C]" : "bg-[#F8FAF9] text-[#4C6355] ring-[#E1E8E3] hover:bg-[#F1F4F2]"}`}><BankMark institution={preset.name} color={preset.color} compact /><strong className="mt-1.5 text-[10.5px] leading-tight">{preset.name}</strong></button>;
            })}
            <button type="button" aria-pressed={institutionChoice === "outro"} onClick={selectOther} className={`flex min-h-[70px] flex-col items-center justify-center rounded-xl px-2 py-2.5 text-center ring-1 transition active:scale-[.98] ${institutionChoice === "outro" ? "bg-[#F1FBF6] text-[#0A7A42] ring-2 ring-[#12B85C]" : "bg-[#F8FAF9] text-[#4C6355] ring-[#E1E8E3] hover:bg-[#F1F4F2]"}`}><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#DDE5E0] text-[15px] font-bold text-[#4C6355]">+</span><strong className="mt-1.5 text-[10.5px] leading-tight">Outro</strong></button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {institutionChoice === "outro" && <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Nome da instituição</span><input autoFocus required value={institution} onChange={event => setInstitution(event.target.value)} placeholder="Digite o banco ou instituição" className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3] focus:ring-2 focus:ring-[#12B85C]" /></label>}
          <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Nome da conta</span><input autoFocus={institutionChoice !== "outro"} required value={name} onChange={event => { setName(event.target.value); setErrorMessage(""); }} placeholder="Ex.: Efi principal" className={`h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 focus:ring-2 ${errorMessage ? "ring-[#E8A39D] focus:ring-[#B3261E]" : "ring-[#E1E8E3] focus:ring-[#12B85C]"}`} /></label>
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Tipo</span><select value={accountType} onChange={event => setAccountType(event.target.value as Account["accountType"])} className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]"><option value="corrente">Conta corrente</option><option value="poupanca">Poupança</option><option value="carteira">Carteira</option><option value="cartao">Cartão</option><option value="gateway">Gateway</option><option value="outro">Outro</option></select></label>
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Saldo inicial</span><input value={initialBalance} onFocus={event => event.currentTarget.select()} onChange={event => setInitialBalance(formatCurrencyInput(event.target.value))} inputMode="decimal" className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]" /></label>
          <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Cor de identificação</span><div className="flex h-11 items-center gap-3 rounded-xl bg-[#F8FAF9] px-3 ring-1 ring-[#E1E8E3]"><input aria-label="Cor da conta" type="color" value={color} onChange={event => setColor(event.target.value)} className="h-7 w-8 cursor-pointer border-0 bg-transparent" /><span className="text-[12px] font-semibold uppercase text-[#718077]">{color}</span></div></label>
        </div>

        {errorMessage && <p role="alert" className="mt-4 rounded-xl bg-[#FDECEA] px-3.5 py-3 text-[11.5px] font-semibold text-[#8E1F16]">{errorMessage}</p>}
        <div className="mt-6 flex gap-2.5"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355]">Cancelar</button><button disabled={pending} type="submit" className="flex-1 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "Salvando..." : "Salvar conta"}</button></div>
      </form>
    </div>
  );
}

function CategoryModal({ category, pending, onClose, onSave }: { category?: Category | null; pending: boolean; onClose: () => void; onSave: (values: { name: string; type: Category["type"]; color: string }) => Promise<void> }) {
  const [name, setName] = useState(category?.name ?? "");
  const [type, setType] = useState<Category["type"]>(category?.type ?? "ambos");
  const [color, setColor] = useState(category?.color ?? "#4C6355");
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}><form onSubmit={async event => { event.preventDefault(); await onSave({ name, type, color }); }} className="modal-enter w-full max-w-[440px] rounded-[22px] bg-white p-5 sm:p-6"><div className="flex items-start"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Classificação</p><h2 className="mt-1 text-xl font-bold">{category ? "Editar categoria" : "Nova categoria"}</h2><p className="mt-1 text-xs text-[#8A968D]">Crie grupos para relatórios e importações.</p></div><button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355]"><CloseIcon size={17} /></button></div><div className="mt-5 space-y-4"><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Nome</span><input autoFocus required value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Custos de plataforma" className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3] focus:ring-2 focus:ring-[#12B85C]" /></label><div><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Aplica-se a</span><div className="grid grid-cols-3 rounded-xl bg-[#F1F4F2] p-1">{(["entrada", "saida", "ambos"] as const).map(value => <button key={value} type="button" onClick={() => setType(value)} className={`rounded-[9px] px-2 py-2 text-[11.5px] font-bold capitalize ${type === value ? "bg-white text-[#0A7A42]" : "text-[#718077]"}`}>{value === "ambos" ? "Ambos" : value}</button>)}</div></div><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Cor</span><div className="flex h-11 items-center gap-3 rounded-xl bg-[#F8FAF9] px-3 ring-1 ring-[#E1E8E3]"><input aria-label="Cor da categoria" type="color" value={color} onChange={event => setColor(event.target.value)} className="h-7 w-8 cursor-pointer border-0 bg-transparent" /><span className="text-[12px] font-semibold uppercase text-[#718077]">{color}</span></div></label></div><div className="mt-6 flex gap-2.5"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355]">Cancelar</button><button disabled={pending} type="submit" className="flex-1 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "Salvando..." : "Salvar categoria"}</button></div></form></div>;
}

function CostCenterModal({ costCenter, pending, onClose, onSave }: { costCenter?: CostCenter | null; pending: boolean; onClose: () => void; onSave: (values: { name: string; color: string }) => Promise<void> }) {
  const [name, setName] = useState(costCenter?.name ?? "");
  const [color, setColor] = useState(costCenter?.color ?? "#4C6355");
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}><form onSubmit={async event => { event.preventDefault(); await onSave({ name, color }); }} className="modal-enter w-full max-w-[440px] rounded-[22px] bg-white p-5 sm:p-6"><div className="flex items-start"><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Rateio</p><h2 className="mt-1 text-xl font-bold">{costCenter ? "Editar centro de custo" : "Novo centro de custo"}</h2><p className="mt-1 text-xs text-[#8A968D]">Separe os lançamentos por área, projeto ou unidade.</p></div><button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355]"><CloseIcon size={17} /></button></div><div className="mt-5 space-y-4"><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Nome</span><input autoFocus required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Comercial" className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3] focus:ring-2 focus:ring-[#12B85C]" /></label><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Cor</span><div className="flex h-11 items-center gap-3 rounded-xl bg-[#F8FAF9] px-3 ring-1 ring-[#E1E8E3]"><input aria-label="Cor do centro de custo" type="color" value={color} onChange={event => setColor(event.target.value)} className="h-7 w-8 cursor-pointer border-0 bg-transparent" /><span className="text-[12px] font-semibold uppercase text-[#718077]">{color}</span></div></label></div><div className="mt-6 flex gap-2.5"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355]">Cancelar</button><button disabled={pending} type="submit" className="flex-1 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "Salvando..." : "Salvar centro de custo"}</button></div></form></div>;
}

export default function OrganizationPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [tab, setTab] = useState<"accounts" | "categories" | "costCenters">("accounts");
  const [accountModal, setAccountModal] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);
  const [costCenterModal, setCostCenterModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const utils = trpc.useUtils();
  const overviewQuery = trpc.organization.overview.useQuery();
  const data = overviewQuery.data;
  const refresh = async () => { await Promise.all([utils.organization.overview.invalidate(), utils.organization.options.invalidate(), utils.transactions.list.invalidate(), utils.transactions.dashboard.invalidate()]); };
  const createAccount = trpc.organization.createAccount.useMutation({ onSuccess: refresh });
  const updateAccount = trpc.organization.updateAccount.useMutation({ onSuccess: refresh });
  const toggleAccount = trpc.organization.toggleAccount.useMutation({ onSuccess: refresh });
  const deleteAccount = trpc.organization.deleteAccount.useMutation({ onSuccess: refresh });
  const createCategory = trpc.organization.createCategory.useMutation({ onSuccess: refresh });
  const updateCategory = trpc.organization.updateCategory.useMutation({ onSuccess: refresh });
  const toggleCategory = trpc.organization.toggleCategory.useMutation({ onSuccess: refresh });
  const deleteCategory = trpc.organization.deleteCategory.useMutation({ onSuccess: refresh });
  const createCostCenter = trpc.organization.createCostCenter.useMutation({ onSuccess: refresh });
  const updateCostCenter = trpc.organization.updateCostCenter.useMutation({ onSuccess: refresh });
  const toggleCostCenter = trpc.organization.toggleCostCenter.useMutation({ onSuccess: refresh });
  const deleteCostCenter = trpc.organization.deleteCostCenter.useMutation({ onSuccess: refresh });
  const initials = (user?.name || user?.email || "NV").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
  const activeAccounts = data?.accounts.filter(item => item.isActive).length ?? 0;
  const activeCategories = data?.categories.filter(item => item.isActive).length ?? 0;
  const activeCostCenters = data?.costCenters.filter(item => item.isActive).length ?? 0;
  const totalBalance = data?.accounts.reduce((sum, item) => sum + item.balance, 0) ?? 0;
  const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] active:scale-95";

  const saveAccount = async (values: Parameters<typeof createAccount.mutateAsync>[0]) => {
    if (editingAccount) await updateAccount.mutateAsync({ id: editingAccount.id, ...values }); else await createAccount.mutateAsync(values); setAccountModal(false); setEditingAccount(null); toast.success(editingAccount ? "Conta atualizada" : "Conta criada");
  };
  const saveCategory = async (values: Parameters<typeof createCategory.mutateAsync>[0]) => {
    try { if (editingCategory) await updateCategory.mutateAsync({ id: editingCategory.id, ...values }); else await createCategory.mutateAsync(values); setCategoryModal(false); setEditingCategory(null); toast.success(editingCategory ? "Categoria atualizada" : "Categoria criada"); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar a categoria"); }
  };
  const handleDeleteAccount = async (item: Account) => { if (!window.confirm(`Excluir a conta “${item.name}”?`)) return; try { await deleteAccount.mutateAsync({ id: item.id }); toast.success("Conta excluída"); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir"); } };
  const handleDeleteCategory = async (item: Category) => { if (!window.confirm(`Excluir a categoria “${item.name}”?`)) return; try { await deleteCategory.mutateAsync({ id: item.id }); toast.success("Categoria excluída"); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir"); } };
  const saveCostCenter = async (values: Parameters<typeof createCostCenter.mutateAsync>[0]) => {
    try { if (editingCostCenter) await updateCostCenter.mutateAsync({ id: editingCostCenter.id, ...values }); else await createCostCenter.mutateAsync(values); setCostCenterModal(false); setEditingCostCenter(null); toast.success(editingCostCenter ? "Centro de custo atualizado" : "Centro de custo criado"); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar o centro de custo"); }
  };
  const handleDeleteCostCenter = async (item: CostCenter) => { if (!window.confirm(`Excluir o centro de custo “${item.name}”?`)) return; try { await deleteCostCenter.mutateAsync({ id: item.id }); toast.success("Centro de custo excluído"); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir"); } };

  return <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]"><div className="flex min-h-screen w-full gap-5 p-3 sm:p-5"><Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} /><section className="flex min-w-0 flex-1 flex-col gap-4"><header className="flex flex-wrap items-center gap-2.5"><button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><MenuIcon size={18} /></button><div className="mr-auto"><h1 className="text-[24px] font-bold tracking-[-.035em] sm:text-[28px]">Contas e categorias</h1><p className="mt-0.5 text-[12px] text-[#8A968D]">Estruture seus lançamentos e importações</p></div><button type="button" onClick={() => { if (tab === "accounts") { setEditingAccount(null); setAccountModal(true); } else if (tab === "categories") { setEditingCategory(null); setCategoryModal(true); } else { setEditingCostCenter(null); setCostCenterModal(true); } }} className="flex h-10 items-center gap-2 rounded-[12px] bg-[#12B85C] px-4 text-[13px] font-bold text-white hover:bg-[#0F9E4E]"><PlusIcon size={15} />{tab === "accounts" ? "Nova conta" : tab === "categories" ? "Nova categoria" : "Novo centro de custo"}</button><div className="relative"><button type="button" aria-label="Abrir conta" onClick={() => setAccountOpen(value => !value)} className="flex h-10 min-w-10 items-center justify-center rounded-[12px] bg-[#0B1F14] px-2.5 text-[11px] font-bold text-white">{initials || "NV"}</button>{accountOpen && <div className="absolute right-0 top-12 z-40 w-[250px] rounded-[17px] bg-white p-3 shadow-[0_20px_50px_rgba(11,31,20,.18)]"><div className="rounded-xl bg-[#F8FAF9] p-3"><strong className="block truncate text-[12px]">{user?.name || "Sua conta"}</strong><span className="mt-0.5 block truncate text-[10.5px] text-[#8A968D]">{user?.email}</span></div><ThemeToggle className="mt-2 rounded-xl bg-[#F8FAF9] p-2" /><button type="button" onClick={async () => { await logout(); setLocation("/login", { replace: true }); }} className="mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-[12px] font-semibold text-[#8E1F16] hover:bg-[#FDECEA]">Sair <ChevronRightIcon size={14} /></button></div>}</div></header><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><AuroraSurface className="rounded-[17px] p-4"><span className="text-[11px] text-[#8FB39E]">Saldo organizado</span><strong className="mt-1 block text-[22px]">{formatMoney(totalBalance)}</strong></AuroraSurface><article className="rounded-[17px] bg-white p-4 ring-1 ring-[#E1E8E3]"><span className="text-[11px] text-[#718077]">Contas ativas</span><strong className="mt-1 block text-[22px] text-[#0A7A42]">{activeAccounts}</strong></article><article className="rounded-[17px] bg-white p-4 ring-1 ring-[#E1E8E3]"><span className="text-[11px] text-[#718077]">Categorias ativas</span><strong className="mt-1 block text-[22px]">{activeCategories}</strong></article><article className="rounded-[17px] bg-white p-4 ring-1 ring-[#E1E8E3]"><span className="text-[11px] text-[#718077]">Centros de custo</span><strong className="mt-1 block text-[22px]">{activeCostCenters}</strong></article></section><section className="flex rounded-[14px] bg-white p-1 ring-1 ring-[#E1E8E3] sm:w-fit"><button type="button" onClick={() => setTab("accounts")} className={`flex-1 rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold sm:flex-none ${tab === "accounts" ? "bg-[#DFF6EA] text-[#0A7A42]" : "text-[#718077]"}`}>Contas bancárias</button><button type="button" onClick={() => setTab("categories")} className={`flex-1 rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold sm:flex-none ${tab === "categories" ? "bg-[#DFF6EA] text-[#0A7A42]" : "text-[#718077]"}`}>Categorias</button><button type="button" onClick={() => setTab("costCenters")} className={`flex-1 rounded-[10px] px-4 py-2.5 text-[12.5px] font-bold sm:flex-none ${tab === "costCenters" ? "bg-[#DFF6EA] text-[#0A7A42]" : "text-[#718077]"}`}>Centros de custo</button></section><section className="min-h-[390px] flex-1 rounded-[20px] bg-white p-4 ring-1 ring-[#E1E8E3] sm:p-5">{overviewQuery.isLoading && <div className="flex h-72 items-center justify-center gap-3 text-[12px] text-[#718077]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#12B85C]/20 border-t-[#12B85C]" />Carregando organização...</div>}{overviewQuery.isError && <div className="flex h-72 flex-col items-center justify-center"><strong className="text-[#B3261E]">Não foi possível carregar</strong><button type="button" onClick={() => overviewQuery.refetch()} className="mt-3 rounded-xl bg-[#FDECEA] px-4 py-2 text-[12px] font-bold text-[#8E1F16]">Tentar novamente</button></div>}{!overviewQuery.isLoading && !overviewQuery.isError && tab === "accounts" && <div><div className="mb-4 flex items-center"><div><h2 className="text-[15px] font-bold">Contas financeiras</h2><p className="mt-0.5 text-[11.5px] text-[#8A968D]">Saldo inicial + lançamentos vinculados</p></div><span className="ml-auto rounded-lg bg-[#F1F4F2] px-2.5 py-1 text-[10.5px] font-bold text-[#607067]">{data?.accounts.length ?? 0} cadastradas</span></div><div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{data?.accounts.map(item => <article key={item.id} className={`rounded-[17px] p-4 ring-1 ${item.isActive ? "bg-white ring-[#DFE6E1]" : "bg-[#F8FAF9] opacity-65 ring-[#E8EEEA]"}`}><div className="flex items-start gap-3"><BankMark institution={item.institution} color={item.color} /><div className="min-w-0 flex-1"><strong className="block truncate text-[13.5px]">{item.name}</strong><span className="mt-0.5 block truncate text-[11px] text-[#8A968D]">{item.institution || "Sem instituição"} · {item.accountType}</span></div><span className={`rounded-md px-2 py-1 text-[9.5px] font-bold ${item.isActive ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#ECEFEC] text-[#718077]"}`}>{item.isActive ? "Ativa" : "Inativa"}</span></div><div className="mt-4"><span className="text-[10.5px] text-[#8A968D]">Saldo atual</span><strong className={`mt-0.5 block text-xl ${item.balance >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(item.balance)}</strong><span className="mt-1 block text-[10.5px] text-[#8A968D]">{item.transactionCount} lançamento{item.transactionCount === 1 ? "" : "s"} vinculado{item.transactionCount === 1 ? "" : "s"}</span></div><div className="mt-4 flex gap-2 border-t border-[#EDF1EE] pt-3"><button type="button" onClick={() => toggleAccount.mutate({ id: item.id })} className="flex-1 rounded-[10px] bg-[#F1F4F2] px-2 py-2 text-[11px] font-bold text-[#4C6355]">{item.isActive ? "Desativar" : "Ativar"}</button><button type="button" aria-label={`Editar ${item.name}`} onClick={() => { setEditingAccount(item); setAccountModal(true); }} className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F1F4F2] text-[#4C6355]"><EditIcon size={14} /></button><button type="button" aria-label={`Excluir ${item.name}`} onClick={() => handleDeleteAccount(item)} className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#FDECEA] text-[#B3261E]"><DeleteIcon size={14} /></button></div></article>)}{data?.accounts.length === 0 && <div className="col-span-full flex min-h-[280px] flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DFF6EA] text-[#0A7A42]"><DocumentIcon size={23} /></span><strong className="mt-3 text-[14px]">Nenhuma conta cadastrada</strong><p className="mt-1 max-w-[300px] text-[12px] text-[#8A968D]">Cadastre uma conta para importar OFX ou CSV e organizar os saldos.</p><button type="button" onClick={() => setAccountModal(true)} className="mt-4 rounded-xl bg-[#12B85C] px-4 py-2.5 text-[12px] font-bold text-white">Criar primeira conta</button></div>}</div></div>}{!overviewQuery.isLoading && !overviewQuery.isError && tab === "categories" && <div><div className="mb-4 flex items-center"><div><h2 className="text-[15px] font-bold">Categorias</h2><p className="mt-0.5 text-[11.5px] text-[#8A968D]">Classifique entradas e saídas para analisar resultados</p></div><span className="ml-auto rounded-lg bg-[#F1F4F2] px-2.5 py-1 text-[10.5px] font-bold text-[#607067]">{data?.categories.length ?? 0} cadastradas</span></div><div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{data?.categories.map(item => <article key={item.id} className={`rounded-[17px] p-4 ring-1 ${item.isActive ? "bg-white ring-[#DFE6E1]" : "bg-[#F8FAF9] opacity-65 ring-[#E8EEEA]"}`}><div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} /><strong className="min-w-0 flex-1 truncate text-[13.5px]">{item.name}</strong><span className="rounded-md bg-[#F1F4F2] px-2 py-1 text-[9.5px] font-bold capitalize text-[#607067]">{item.type}</span></div><div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[#F8FAF9] p-3"><div><span className="block text-[10px] text-[#8A968D]">Lançamentos</span><strong className="mt-0.5 block text-[14px]">{item.transactionCount}</strong></div><div><span className="block text-[10px] text-[#8A968D]">Total líquido</span><strong className={`mt-0.5 block text-[13px] ${item.total >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(item.total)}</strong></div></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => toggleCategory.mutate({ id: item.id })} className="flex-1 rounded-[10px] bg-[#F1F4F2] px-2 py-2 text-[11px] font-bold text-[#4C6355]">{item.isActive ? "Desativar" : "Ativar"}</button><button type="button" aria-label={`Editar ${item.name}`} onClick={() => { setEditingCategory(item); setCategoryModal(true); }} className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F1F4F2] text-[#4C6355]"><EditIcon size={14} /></button><button type="button" aria-label={`Excluir ${item.name}`} onClick={() => handleDeleteCategory(item)} className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#FDECEA] text-[#B3261E]"><DeleteIcon size={14} /></button></div></article>)}{data?.categories.length === 0 && <div className="col-span-full flex min-h-[280px] flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DFF6EA] text-[#0A7A42]"><ChartIcon size={23} /></span><strong className="mt-3 text-[14px]">Nenhuma categoria cadastrada</strong><p className="mt-1 max-w-[300px] text-[12px] text-[#8A968D]">Crie categorias para classificar importações e relatórios.</p><button type="button" onClick={() => setCategoryModal(true)} className="mt-4 rounded-xl bg-[#12B85C] px-4 py-2.5 text-[12px] font-bold text-white">Criar primeira categoria</button></div>}</div></div>}{!overviewQuery.isLoading && !overviewQuery.isError && tab === "costCenters" && <div><div className="mb-4 flex items-center"><div><h2 className="text-[15px] font-bold">Centros de custo</h2><p className="mt-0.5 text-[11.5px] text-[#8A968D]">Separe os lançamentos por área, projeto ou unidade</p></div><span className="ml-auto rounded-lg bg-[#F1F4F2] px-2.5 py-1 text-[10.5px] font-bold text-[#607067]">{data?.costCenters.length ?? 0} cadastrados</span></div><div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">{data?.costCenters.map(item => <article key={item.id} className={`rounded-[17px] p-4 ring-1 ${item.isActive ? "bg-white ring-[#DFE6E1]" : "bg-[#F8FAF9] opacity-65 ring-[#E8EEEA]"}`}><div className="flex items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><strong className="min-w-0 flex-1 truncate text-[13.5px]">{item.name}</strong><span className={`rounded-md px-2 py-1 text-[9.5px] font-bold ${item.isActive ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#ECEFEC] text-[#718077]"}`}>{item.isActive ? "Ativo" : "Inativo"}</span></div><div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[#F8FAF9] p-3"><div><span className="block text-[10px] text-[#8A968D]">Lançamentos</span><strong className="mt-0.5 block text-[14px]">{item.transactionCount}</strong></div><div><span className="block text-[10px] text-[#8A968D]">Total líquido</span><strong className={`mt-0.5 block text-[13px] ${item.total >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(item.total)}</strong></div></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => toggleCostCenter.mutate({ id: item.id })} className="flex-1 rounded-[10px] bg-[#F1F4F2] px-2 py-2 text-[11px] font-bold text-[#4C6355]">{item.isActive ? "Desativar" : "Ativar"}</button><button type="button" aria-label={`Editar ${item.name}`} onClick={() => { setEditingCostCenter(item); setCostCenterModal(true); }} className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F1F4F2] text-[#4C6355]"><EditIcon size={14} /></button><button type="button" aria-label={`Excluir ${item.name}`} onClick={() => handleDeleteCostCenter(item)} className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#FDECEA] text-[#B3261E]"><DeleteIcon size={14} /></button></div></article>)}{data?.costCenters.length === 0 && <div className="col-span-full flex min-h-[280px] flex-col items-center justify-center text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DFF6EA] text-[#0A7A42]"><SettingsIcon size={23} /></span><strong className="mt-3 text-[14px]">Nenhum centro de custo cadastrado</strong><p className="mt-1 max-w-[320px] text-[12px] text-[#8A968D]">O campo é opcional no lançamento. Crie um centro de custo quando quiser separar os gastos por área, projeto ou unidade.</p><button type="button" onClick={() => setCostCenterModal(true)} className="mt-4 rounded-xl bg-[#12B85C] px-4 py-2.5 text-[12px] font-bold text-white">Criar primeiro centro de custo</button></div>}</div></div>}</section>{(data?.imports.length ?? 0) > 0 && <section className="rounded-[18px] bg-white p-4 ring-1 ring-[#E1E8E3]"><div className="mb-3 flex items-center"><h2 className="text-[14px] font-bold">Importações recentes</h2><button type="button" onClick={() => setLocation("/lancamentos")} className="ml-auto text-[11.5px] font-bold text-[#0A7A42]">Abrir lançamentos</button></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{data?.imports.slice(0, 6).map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl bg-[#F8FAF9] p-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DFF6EA] text-[10px] font-bold uppercase text-[#0A7A42]">{item.format}</span><div className="min-w-0"><strong className="block truncate text-[11.5px]">{item.fileName}</strong><span className="block text-[10px] text-[#8A968D]">{item.importedCount} importados · {item.duplicateCount} duplicados</span></div></div>)}</div></section>}</section></div>{accountModal && <AccountModal account={editingAccount} pending={createAccount.isPending || updateAccount.isPending} onClose={() => { setAccountModal(false); setEditingAccount(null); }} onSave={saveAccount} />}{categoryModal && <CategoryModal category={editingCategory} pending={createCategory.isPending || updateCategory.isPending} onClose={() => { setCategoryModal(false); setEditingCategory(null); }} onSave={saveCategory} />}{costCenterModal && <CostCenterModal costCenter={editingCostCenter} pending={createCostCenter.isPending || updateCostCenter.isPending} onClose={() => { setCostCenterModal(false); setEditingCostCenter(null); }} onSave={saveCostCenter} />}</main>;
}
