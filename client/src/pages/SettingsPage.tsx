import { useAuth } from "@/_core/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import {
  BuildingIcon,
  CardIcon,
  CheckIcon,
  ChevronRightIcon,
  SettingsIcon,
  SidebarMenuIcon,
  TagIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { ProfileMenu } from "@/components/ProfileMenu";
import { GranafyLoader } from "@/components/GranafyLoader";
import { AssinaturaPanel, PlanosPanel } from "@/components/PlanoCobranca";
import { PrimeiroAcessoPanel } from "@/components/onboarding/PrimeiroAcessoPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { trpc } from "@/lib/trpc";
import {
  CURRENCIES,
  CURRENCY_LABELS,
  CURRENCY_LOCALES,
  DEFAULT_PREFERENCES,
  SIDEBAR_MODES,
  SIDEBAR_MODE_LABELS,
  type Currency,
  type DateFormat,
  type DefaultPeriod,
  type Preferences,
  type SidebarMode,
} from "@shared/preferences";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import { usePrivacy } from "@/contexts/PrivacyContext";

type SettingsTab = "company" | "preferences" | "onboarding" | "plans" | "subscription";

/*
 * O menu do perfil aponta direto para uma aba (`?aba=plano`). O estado mora
 * aqui, então a URL é lida na montagem e a cada mudança de busca — sem o
 * efeito, clicar em "Plano e cobrança" já estando em Configurações trocaria
 * a URL e deixaria a aba anterior na tela.
 */
const ABA_POR_PARAMETRO: Record<string, SettingsTab> = {
  empresa: "company",
  preferencias: "preferences",
  tour: "onboarding",
  /* O endereço antigo desta aba. Continua respondendo para não quebrar link
     salvo antes de ela virar "Tour do produto". */
  "primeiro-acesso": "onboarding",
  planos: "plans",
  assinatura: "subscription",
};

const PARAMETRO_POR_ABA: Record<SettingsTab, string> = {
  company: "empresa",
  preferences: "preferencias",
  onboarding: "tour",
  plans: "planos",
  subscription: "assinatura",
};

const SUBTITULO_POR_ABA: Record<SettingsTab, string> = {
  company: "Dados cadastrais e endereço da empresa",
  preferences: "Como o sistema mostra períodos, valores e datas",
  onboarding: "O tour de 90 segundos e os passos da configuração inicial, para refazer quando quiser",
  plans: "O que cada plano inclui e quanto custa",
  subscription: "Plano em vigor, uso do ciclo, faturas e forma de pagamento",
};

const ABAS: Array<{ value: SettingsTab; label: string; icon: IconlyIcon }> = [
  { value: "company", label: "Empresa", icon: BuildingIcon },
  { value: "preferences", label: "Preferências", icon: SettingsIcon },
  { value: "onboarding", label: "Tour do produto", icon: CheckIcon },
  { value: "plans", label: "Planos", icon: TagIcon },
  { value: "subscription", label: "Assinatura", icon: CardIcon },
];

function abaDaBusca(busca: string): SettingsTab | null {
  const pedida = new URLSearchParams(busca).get("aba");
  return pedida ? ABA_POR_PARAMETRO[pedida] ?? null : null;
}

const TAX_REGIMES = [
  ["simples", "Simples Nacional"],
  ["presumido", "Lucro Presumido"],
  ["real", "Lucro Real"],
  ["mei", "MEI"],
  ["outro", "Outro"],
] as const;

// O modelo oferece Diário · Semanal · Mensal, mas a Visão geral navega por mês,
// trimestre e ano. Nomear períodos que o app não tem seria um ajuste sem efeito.
const PERIOD_OPTIONS: Array<{ value: DefaultPeriod; label: string; hint: string }> = [
  { value: "mes", label: "Mês", hint: "Abre no mês corrente" },
  { value: "trimestre", label: "Trimestre", hint: "Abre no trimestre corrente" },
  { value: "ano", label: "Ano", hint: "Abre no exercício corrente" },
];

const DATE_FORMAT_OPTIONS: Array<{ value: DateFormat; label: string }> = [
  { value: "dmy", label: "DD/MM/AAAA" },
  { value: "mdy", label: "MM/DD/AAAA" },
  { value: "iso", label: "AAAA-MM-DD" },
];

const TIME_ZONES = [
  ["America/Sao_Paulo", "América/São_Paulo · GMT−3"],
  ["America/Manaus", "América/Manaus · GMT−4"],
  ["America/Rio_Branco", "América/Rio_Branco · GMT−5"],
  ["America/Noronha", "América/Noronha · GMT−2"],
  ["UTC", "UTC · GMT+0"],
  ["Europe/Lisbon", "Europa/Lisboa · GMT+1"],
] as const;

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const fieldClass = "h-[46px] w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[14px] outline-none focus:border-[#12B85C]";
const labelClass = "mb-[7px] block text-[12.5px] font-semibold text-[#4C6355]";

export default function SettingsPage() {
  // Assina o modo discreto: o valor mascarado sai de um módulo, e sem esta
  // assinatura a página não redesenha quando o olhinho é ligado.
  usePrivacy();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const busca = useSearch();
  const [tab, setTab] = useState<SettingsTab>(() => abaDaBusca(window.location.search) ?? "company");
  useEffect(() => {
    const pedida = abaDaBusca(busca);
    if (pedida) setTab(pedida);
  }, [busca]);

  const utils = trpc.useUtils();
  const companyQuery = trpc.settings.company.useQuery();
  const preferencesQuery = trpc.settings.preferences.useQuery();
  const saveCompany = trpc.settings.saveCompany.useMutation({
    onSuccess: () => utils.settings.company.invalidate(),
  });
  const savePreferences = trpc.settings.savePreferences.useMutation({
    onSuccess: () => utils.settings.preferences.invalidate(),
  });

  const initials = (user?.name || user?.email || "NV").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
  const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] active:scale-95";

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <AppSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><SidebarMenuIcon size={18} /></button>
            <div className="mr-auto">
              <h1 className="text-[24px] font-bold tracking-[-.02em]">Configurações</h1>
              <p className="mt-0.5 text-[12.5px] text-[#8A968D]">{SUBTITULO_POR_ABA[tab]}</p>
            </div>
            <ProfileMenu />
          </header>

          <div className="flex flex-1 flex-col gap-5 xl:flex-row">
            {/* `self-start` porque numa linha flex o padrão é esticar: sem ele o
                cartão de duas abas descia até o pé da página. */}
            <nav className="flex shrink-0 gap-1.5 overflow-x-auto rounded-[16px] bg-white p-2 ring-1 ring-[#E1E8E3] xl:w-[212px] xl:flex-col xl:self-start xl:overflow-visible">
              {ABAS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setTab(value);
                    // A URL acompanha a aba: é ela que o menu do perfil aponta,
                    // e sem sincronizar aqui um segundo clique lá não mudaria
                    // nada — a busca continuaria a mesma.
                    setLocation(`/configuracoes?aba=${PARAMETRO_POR_ABA[value]}`, { replace: true });
                  }}
                  aria-current={tab === value ? "page" : undefined}
                  className={`flex items-center gap-2.5 whitespace-nowrap rounded-[12px] px-3.5 py-2.5 text-left text-[13.5px] transition ${
                    tab === value ? "bg-[#F1FBF6] font-bold text-[#0A7A42]" : "text-[#4C6355] hover:bg-[#F8FAF9]"
                  }`}
                >
                  <Icon size={17} className={tab === value ? "" : "text-[#8A968D]"} />
                  {label}
                </button>
              ))}
            </nav>

            <div className="min-w-0 flex-1">
              {tab === "onboarding" ? (
                <PrimeiroAcessoPanel />
              ) : tab === "plans" ? (
                <PlanosPanel />
              ) : tab === "subscription" ? (
                <AssinaturaPanel onVerPlanos={() => {
                  setTab("plans");
                  setLocation("/configuracoes?aba=planos", { replace: true });
                }} />
              ) : tab === "company" ? (
                <CompanyForm
                  initial={companyQuery.data}
                  loading={companyQuery.isLoading}
                  pending={saveCompany.isPending}
                  onSave={async values => {
                    try {
                      await saveCompany.mutateAsync(values);
                      toast.success("Dados da empresa salvos");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Não foi possível salvar");
                    }
                  }}
                />
              ) : (
                <PreferencesForm
                  initial={preferencesQuery.data}
                  loading={preferencesQuery.isLoading}
                  pending={savePreferences.isPending}
                  onSave={async values => {
                    try {
                      await savePreferences.mutateAsync(values);
                      toast.success("Preferências salvas");
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Não foi possível salvar");
                    }
                  }}
                />
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/** Os campos do formulário. O logo fica de fora: ainda não há upload. */
type CompanyValues = {
  legalName: string;
  tradeName: string;
  taxId: string;
  stateRegistration: string;
  taxRegime: "simples" | "presumido" | "real" | "mei" | "outro";
  financeEmail: string;
  zipCode: string;
  street: string;
  streetNumber: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  country: string;
};

function CompanyForm({ initial, loading, pending, onSave }: {
  initial: (CompanyValues & { logoKey?: string | null; logoName?: string | null }) | undefined;
  loading: boolean;
  pending: boolean;
  onSave: (values: CompanyValues) => Promise<void>;
}) {
  const [form, setForm] = useState<CompanyValues | null>(null);
  const utils = trpc.useUtils();
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    if (!initial || form) return;
    const { logoKey: _logoKey, logoName: _logoName, ...values } = initial;
    setForm(values as CompanyValues);
  }, [form, initial]);

  if (loading || !form) {
    return <div className="flex min-h-[300px] flex-1 items-center justify-center rounded-[20px] bg-white ring-1 ring-[#E1E8E3]"><GranafyLoader label="Carregando cadastro..." /></div>;
  }

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm(current => (current ? { ...current, [key]: value } : current));

  const lookupZip = async () => {
    if (!/^\d{5}-?\d{3}$/.test(form.zipCode.trim())) return toast.info("Informe um CEP com 8 dígitos.");
    setLookingUp(true);
    try {
      const found = await utils.settings.lookupZipCode.fetch({ zipCode: form.zipCode.trim() });
      setForm(current => current ? { ...current, ...found } : current);
      toast.success("Endereço preenchido pelo CEP");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar o CEP");
    } finally {
      setLookingUp(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await onSave(form);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:p-6">
        <h2 className="text-[15px] font-bold">Dados cadastrais</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={labelClass}>Razão social</span>
            <input maxLength={180} value={form.legalName} onChange={event => set("legalName", event.target.value)} placeholder="Número Virtual LTDA" className={fieldClass} />
          </label>
          <label>
            <span className={labelClass}>Nome fantasia</span>
            <input maxLength={180} value={form.tradeName} onChange={event => set("tradeName", event.target.value)} placeholder="GranaFy" className={fieldClass} />
          </label>
          <label>
            <span className={labelClass}>CNPJ</span>
            <input maxLength={20} value={form.taxId} onChange={event => set("taxId", event.target.value)} placeholder="00.000.000/0001-00" className={fieldClass} />
          </label>
          <label>
            <span className={labelClass}>Inscrição estadual</span>
            <input maxLength={30} value={form.stateRegistration} onChange={event => set("stateRegistration", event.target.value)} placeholder="Isento" className={fieldClass} />
          </label>
          <label>
            <span className={labelClass}>Regime tributário</span>
            <select value={form.taxRegime} onChange={event => set("taxRegime", event.target.value as CompanyValues["taxRegime"])} className={fieldClass}>
              {TAX_REGIMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>E-mail financeiro</span>
            <input type="email" maxLength={320} value={form.financeEmail} onChange={event => set("financeEmail", event.target.value)} placeholder="financeiro@empresa.com" className={fieldClass} />
          </label>
        </div>
      </article>

      <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:p-6">
        <h2 className="text-[15px] font-bold">Endereço</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[150px_1fr_110px]">
          <label>
            <span className={labelClass}>CEP</span>
            <div className="flex h-[46px] items-center gap-2 rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 focus-within:border-[#12B85C]">
              <input maxLength={9} value={form.zipCode} onChange={event => set("zipCode", event.target.value)} placeholder="00000-000" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
            </div>
          </label>
          <label>
            <span className={labelClass}>Logradouro</span>
            <input maxLength={180} value={form.street} onChange={event => set("street", event.target.value)} className={fieldClass} />
          </label>
          <label>
            <span className={labelClass}>Número</span>
            <input maxLength={20} value={form.streetNumber} onChange={event => set("streetNumber", event.target.value)} className={fieldClass} />
          </label>
          <button type="button" onClick={lookupZip} disabled={lookingUp} className="h-[46px] self-end rounded-xl bg-[#F1FBF6] px-3 text-[12.5px] font-bold text-[#0A7A42] hover:bg-[#DFF6EA] disabled:opacity-60 sm:col-span-1">
            {lookingUp ? "Buscando..." : "Buscar pelo CEP"}
          </button>
          <label className="sm:col-span-2">
            <span className={labelClass}>Complemento</span>
            <input maxLength={120} value={form.complement} onChange={event => set("complement", event.target.value)} className={fieldClass} />
          </label>
          <label>
            <span className={labelClass}>Bairro</span>
            <input maxLength={120} value={form.district} onChange={event => set("district", event.target.value)} className={fieldClass} />
          </label>
          <label>
            <span className={labelClass}>Cidade</span>
            <input maxLength={120} value={form.city} onChange={event => set("city", event.target.value)} className={fieldClass} />
          </label>
          <label>
            <span className={labelClass}>UF</span>
            <input maxLength={2} value={form.state} onChange={event => set("state", event.target.value.toUpperCase())} className={fieldClass} />
          </label>
          <label className="sm:col-span-2">
            <span className={labelClass}>País</span>
            <input maxLength={60} value={form.country} onChange={event => set("country", event.target.value)} className={fieldClass} />
          </label>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-[#8A968D]">
          A busca por CEP consulta o ViaCEP. Se o serviço estiver fora do ar, o endereço continua podendo ser digitado.
        </p>
      </article>

      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="h-12 rounded-xl bg-[#12B85C] px-6 text-[14px] font-bold text-white hover:bg-[#0F9E4E] disabled:opacity-60">
          {pending ? "Salvando..." : "Salvar dados da empresa"}
        </button>
      </div>
    </form>
  );
}

/** Chave liga/desliga das opções do menu. */
function Toggle({ checked, onChange, label, hint }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 rounded-[14px] px-3.5 py-3 text-left transition hover:bg-[#F8FAF9]"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-semibold">{label}</span>
        <span className="text-[12px] leading-relaxed text-[#4C6355]">{hint}</span>
      </span>
      <span className={`flex h-[26px] w-11 shrink-0 items-center rounded-full p-[3px] transition ${checked ? "justify-end bg-[#12B85C]" : "justify-start bg-[#D8E2DB]"}`}>
        <span className="h-5 w-5 rounded-full bg-white" />
      </span>
    </button>
  );
}

/** Miniatura do comportamento: barra à esquerda e conteúdo à direita. */
function SidebarPreview({ mode }: { mode: SidebarMode }) {
  const wide = mode === "expandido";
  return (
    <div className={`relative flex h-[74px] gap-2 rounded-[11px] p-2 ${wide ? "bg-white" : "bg-[#F8FAF9]"}`}>
      <div className={`flex shrink-0 flex-col gap-[5px] ${wide ? "w-14" : "w-[22px]"}`}>
        <span className="h-3 rounded bg-[#12B85C]" />
        <span className="h-2 rounded-sm bg-[#DFF6EA]" />
        <span className="h-2 rounded-sm bg-[#DFF6EA]" />
        <span className="h-2 rounded-sm bg-[#DFF6EA]" />
      </div>
      <div className="flex-1 rounded-md bg-[#F1F4F2]" />
      {mode === "icones" && (
        <span className="absolute left-9 top-[26px] rounded-[7px] bg-[#0B1F14] px-2.5 py-1 text-[10.5px] font-semibold text-white">
          Lançamentos
        </span>
      )}
      {mode === "hover" && (
        <span className="absolute inset-y-2 left-2 flex w-[58px] flex-col gap-[5px] rounded-lg border-[1.5px] border-[#12B85C] bg-white p-1.5">
          <span className="h-[9px] rounded-sm bg-[#12B85C]" />
          <span className="h-[7px] rounded-sm bg-[#DFF6EA]" />
          <span className="h-[7px] rounded-sm bg-[#DFF6EA]" />
        </span>
      )}
    </div>
  );
}

function PreferencesForm({ initial, loading, pending, onSave }: {
  initial: Preferences | undefined;
  loading: boolean;
  pending: boolean;
  onSave: (values: Preferences) => Promise<void>;
}) {
  const [form, setForm] = useState<Preferences | null>(null);

  useEffect(() => {
    if (initial && !form) setForm(initial);
  }, [form, initial]);

  if (loading || !form) {
    return <div className="flex min-h-[300px] flex-1 items-center justify-center rounded-[20px] bg-white ring-1 ring-[#E1E8E3]"><GranafyLoader label="Carregando preferências..." /></div>;
  }

  const sample = (currency: Currency) =>
    new Intl.NumberFormat(CURRENCY_LOCALES[currency], { style: "currency", currency }).format(1234.56);

  return (
    <form onSubmit={async event => { event.preventDefault(); await onSave(form); }} className="flex flex-col gap-5">
      <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:p-6">
        <h2 className="text-[15px] font-bold">Período de navegação padrão</h2>
        <p className="mt-0.5 text-[12.5px] text-[#8A968D]">Define o que a Visão geral abre ao entrar</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {PERIOD_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setForm({ ...form, defaultPeriod: option.value })}
              aria-pressed={form.defaultPeriod === option.value}
              className={`rounded-[14px] p-4 text-left transition ${
                form.defaultPeriod === option.value
                  ? "border-[1.5px] border-[#12B85C] bg-[#F1FBF6]"
                  : "border border-[#E3EAE5] hover:bg-[#F8FAF9]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${form.defaultPeriod === option.value ? "bg-[#12B85C]" : "border-[1.5px] border-[#C9D5CD]"}`}>
                  {form.defaultPeriod === option.value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span className="text-[14px] font-semibold">{option.label}</span>
              </span>
              <span className="mt-2 block text-[12px] leading-relaxed text-[#8A968D]">{option.hint}</span>
            </button>
          ))}
        </div>
      </article>

      <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:p-6">
        <h2 className="text-[15px] font-bold">Moeda padrão</h2>
        <p className="mt-0.5 text-[12.5px] text-[#8A968D]">Muda o símbolo e o formato do número em todas as telas</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {CURRENCIES.map(currency => (
            <button
              key={currency}
              type="button"
              onClick={() => setForm({ ...form, currency })}
              aria-pressed={form.currency === currency}
              className={`flex items-center gap-3 rounded-[14px] p-4 text-left transition ${
                form.currency === currency
                  ? "border-[1.5px] border-[#12B85C] bg-[#F1FBF6]"
                  : "border border-[#E3EAE5] hover:bg-[#F8FAF9]"
              }`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F4F2] text-[14px] font-bold text-[#28382E]">
                {CURRENCY_LABELS[currency].symbol}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold">{CURRENCY_LABELS[currency].name}</span>
                <span className="block truncate text-[12px] text-[#8A968D]">{currency} · {sample(currency)}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 rounded-xl bg-[#FFF8E8] px-3.5 py-3 text-[11px] leading-relaxed text-[#725517]">
          A moeda muda apenas como o valor é escrito. Nada é convertido: R$ 100 vira $ 100,00, não o equivalente em dólar.
        </p>
      </article>

      <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:p-6">
        <h2 className="text-[15px] font-bold">Menu lateral</h2>
        <p className="mt-0.5 text-[12.5px] text-[#8A968D]">Como a barra de navegação se comporta ao abrir o painel</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {SIDEBAR_MODES.map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setForm({ ...form, sidebarMode: mode })}
              aria-pressed={form.sidebarMode === mode}
              className={`flex flex-col gap-3 rounded-[14px] p-4 text-left transition ${
                form.sidebarMode === mode
                  ? "border-[1.5px] border-[#12B85C] bg-[#F1FBF6]"
                  : "border border-[#E3EAE5] hover:bg-[#F8FAF9]"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${form.sidebarMode === mode ? "bg-[#12B85C]" : "border-[1.5px] border-[#C9D5CD]"}`}>
                  {form.sidebarMode === mode && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
                <span className={`text-[14px] font-semibold ${form.sidebarMode === mode ? "text-[#0A7A42]" : ""}`}>
                  {SIDEBAR_MODE_LABELS[mode].name}
                </span>
              </span>
              <SidebarPreview mode={mode} />
              <span className="text-[12px] leading-relaxed text-[#4C6355]">{SIDEBAR_MODE_LABELS[mode].hint}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-col">
          <Toggle
            checked={form.sidebarTooltips}
            onChange={value => setForm({ ...form, sidebarTooltips: value })}
            label="Mostrar tooltip com o nome do menu"
            hint="aparece após 0,4s sobre cada ícone quando a barra está recolhida"
          />
          <Toggle
            checked={form.sidebarBadges}
            onChange={value => setForm({ ...form, sidebarBadges: value })}
            label="Mostrar contadores nos ícones"
            hint="bolinha com o número de títulos abertos sobre o ícone"
          />
          <Toggle
            checked={form.sidebarRemember}
            onChange={value => setForm({ ...form, sidebarRemember: value })}
            label="Lembrar do estado ao recarregar"
            hint="recolher a barra na mão passa a valer na próxima visita, neste navegador"
          />
        </div>
      </article>

      <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:p-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            <span className={labelClass}>Fuso horário</span>
            <select value={form.timeZone} onChange={event => setForm({ ...form, timeZone: event.target.value })} className={fieldClass}>
              {TIME_ZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            <span className={labelClass}>Formato de data</span>
            <select value={form.dateFormat} onChange={event => setForm({ ...form, dateFormat: event.target.value as DateFormat })} className={fieldClass}>
              {DATE_FORMAT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <span className={labelClass}>Início do exercício</span>
            <select value={form.fiscalYearStartMonth} onChange={event => setForm({ ...form, fiscalYearStartMonth: Number(event.target.value) })} className={fieldClass}>
              {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
            </select>
          </label>
        </div>
      </article>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setForm(DEFAULT_PREFERENCES)} className="h-12 rounded-xl bg-[#F1F4F2] px-4 text-[13px] font-bold text-[#4C6355] hover:bg-[#E7ECE9]">
          Voltar ao padrão
        </button>
        <button type="submit" disabled={pending} className="ml-auto h-12 rounded-xl bg-[#12B85C] px-6 text-[14px] font-bold text-white hover:bg-[#0F9E4E] disabled:opacity-60">
          {pending ? "Salvando..." : "Salvar preferências"}
        </button>
      </div>
    </form>
  );
}
