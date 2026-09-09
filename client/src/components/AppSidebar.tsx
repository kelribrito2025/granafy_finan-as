import { ConnectedAccounts } from "@/components/ConnectedAccounts";
import { GranafyLogo, GranafySymbol } from "@/components/GranafyLogo";
import {
  ArrowUpIcon,
  ChartIcon,
  CheckIcon,
  CloseIcon,
  DashboardIcon,
  DocumentIcon,
  TrendUpIcon,
  WalletIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { usePreferences } from "@/contexts/PreferencesContext";
import { trpc } from "@/lib/trpc";
import { startsCollapsed, type SidebarMode } from "@shared/preferences";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type Item = {
  label: string;
  icon: IconlyIcon;
  path?: string;
  disabled?: boolean;
  /** O item que recebe a contagem de títulos abertos. */
  counter?: boolean;
};

/**
 * O menu, num lugar só.
 *
 * Cada página desenhava a própria cópia da barra; com três comportamentos para
 * escolher, manter oito cópias em pé seria garantir que uma delas ficasse para
 * trás na próxima mudança.
 */
const GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Painel",
    items: [
      { label: "Visão geral", icon: DashboardIcon, path: "/" },
      { label: "Fluxo de caixa", icon: TrendUpIcon, path: "/fluxo-de-caixa" },
      { label: "A pagar e receber", icon: ArrowUpIcon, path: "/a-pagar-e-receber", counter: true },
      { label: "Pagas e recebidas", icon: CheckIcon, path: "/pagas-e-recebidas" },
      { label: "Lançamentos", icon: DocumentIcon, path: "/lancamentos" },
      { label: "Conciliação", icon: CheckIcon, path: "/conciliacao" },
    ],
  },
  {
    title: "Análise",
    items: [
      { label: "DRE", icon: DocumentIcon, path: "/dre" },
      { label: "Balanço Patrimonial", icon: ChartIcon, path: "/balanco-patrimonial" },
    ],
  },
  {
    title: "Organização",
    items: [{ label: "Contas e categorias", icon: WalletIcon, path: "/organizacao" }],
  },
];

const STORAGE_KEY = "granafy-sidebar";

/** Ícone de painel com a coluna destacada, para expandir e recolher. */
function PanelIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

function isActive(location: string, path: string | undefined) {
  if (!path) return false;
  return path === "/" ? location === "/" : location.startsWith(path);
}

/** Um item da barra inteira: ícone, nome e, quando houver, a contagem. */
function WideItem({ item, active, count, onSelect }: {
  item: Item;
  active: boolean;
  count: number | null;
  onSelect: (item: Item) => void;
}) {
  const { icon: Icon, label, disabled = false } = item;
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Página em desenvolvimento" : undefined}
      onClick={() => onSelect(item)}
      className={`flex w-full items-center gap-[11px] rounded-xl px-3 py-[9px] text-left text-[13px] transition active:scale-[.98] ${
        active
          ? "bg-[#12B85C] font-bold text-white"
          : disabled
            ? "cursor-not-allowed text-[#A8B1AB] opacity-55"
            : "text-[#28382E] hover:bg-[#F1FBF6]"
      }`}
    >
      <Icon size={16} />
      <span className="truncate">{label}</span>
      {count !== null && count > 0 && (
        <span className={`ml-auto rounded-md px-[9px] py-[3px] text-[11px] font-semibold ${active ? "bg-white/20 text-white" : "bg-[#F1F4F2] text-[#4C6355]"}`}>
          {count}
        </span>
      )}
    </button>
  );
}

/** Um item do rail: quadrado de 44px, com tooltip e bolinha de contagem. */
function RailItem({ item, active, count, tooltips, onSelect }: {
  item: Item;
  active: boolean;
  count: number | null;
  tooltips: boolean;
  onSelect: (item: Item) => void;
}) {
  const { icon: Icon, label, disabled = false } = item;
  return (
    <button
      type="button"
      disabled={disabled}
      // Sem tooltip próprio o title do navegador é o que sobra de acessível.
      title={tooltips ? undefined : disabled ? `${label} · em desenvolvimento` : label}
      aria-label={label}
      onClick={() => onSelect(item)}
      className={`group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition active:scale-[.96] ${
        active
          ? "bg-[#12B85C] text-white"
          : disabled
            ? "cursor-not-allowed text-[#A8B1AB] opacity-55"
            : "text-[#28382E] hover:bg-[#F1FBF6]"
      }`}
    >
      <Icon size={19} />
      {count !== null && count > 0 && (
        <span className="absolute right-[5px] top-[5px] flex h-4 min-w-4 items-center justify-center rounded-lg border-2 border-white bg-[#B3261E] px-1 text-[9.5px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
      {/* O balão usa o mesmo verde do item selecionado: é a cor que já diz
          "este é o item do menu", e o balão fala do item sob o cursor. */}
      {tooltips && (
        <span className="pointer-events-none absolute left-14 top-1/2 z-[90] -translate-y-1/2 whitespace-nowrap rounded-[9px] bg-[#12B85C] px-[11px] py-[7px] text-[12.5px] font-semibold text-white opacity-0 shadow-[0_8px_22px_rgba(11,31,20,.22)] transition-opacity duration-[90ms] group-hover:opacity-100">
          {label}
          <span className="absolute -left-1 top-1/2 -mt-1 h-2 w-2 rotate-45 bg-[#12B85C]" />
        </span>
      )}
    </button>
  );
}

export function AppSidebar({ open, onClose, footer }: {
  open: boolean;
  onClose: () => void;
  /** Cartão do rodapé quando a barra está inteira. Sem isto, as contas. */
  footer?: ReactNode;
}) {
  const [location, setLocation] = useLocation();
  const preferences = usePreferences();
  const [override, setOverride] = useState<boolean | null>(null);
  const [hovering, setHovering] = useState(false);

  /*
   * "Lembrar do estado" guarda a escolha manual no próprio navegador: é uma
   * preferência da máquina, não da conta — a mesma pessoa pode querer a barra
   * inteira no monitor grande e recolhida no notebook.
   */
  useEffect(() => {
    if (!preferences.sidebarRemember) {
      setOverride(null);
      return;
    }
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "recolhida" || saved === "inteira") setOverride(saved === "recolhida");
    } catch {
      // Navegador sem storage: a preferência salva no servidor continua valendo.
    }
  }, [preferences.sidebarRemember]);

  const mode: SidebarMode = preferences.sidebarMode;
  const collapsed = override ?? startsCollapsed(mode);
  const showBadges = preferences.sidebarBadges;
  const badges = trpc.payables.badges.useQuery(undefined, {
    enabled: showBadges,
    staleTime: 60_000,
  });
  const openTitles = showBadges ? badges.data?.open ?? 0 : 0;

  const setCollapsed = (value: boolean) => {
    setOverride(value);
    if (!preferences.sidebarRemember) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "recolhida" : "inteira");
    } catch {
      // Sem storage a escolha vale só para esta sessão.
    }
  };

  const select = (item: Item) => {
    onClose();
    if (!item.path) {
      toast.info(`${item.label} ainda não está disponível.`);
      return;
    }
    setLocation(item.path);
  };

  const countOf = (item: Item) => (item.counter && showBadges ? openTitles : null);

  /*
   * O painel flutuante do modo "expandir ao passar" cobre o rail, então o botão
   * de expandir não pode morar lá embaixo: no hover ele vira "Fixar menu
   * aberto" aqui dentro, que é onde o mouse já está.
   */
  const wideBody = (inPanel: boolean) => (
    <>
      <div className="flex items-center gap-2.5 px-1.5">
        <GranafyLogo size={36} subtitle="Powered by Bigteck" className="min-w-0 shrink-0" />
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={onClose}
          className="ml-auto rounded-lg p-1 text-[#8A968D] hover:bg-[#F1F4F2] xl:hidden"
        >
          <CloseIcon size={17} />
        </button>
        <button
          type="button"
          aria-label={inPanel ? "Fixar menu aberto" : "Recolher menu"}
          title={inPanel ? "Fixar menu aberto" : "Recolher menu"}
          onClick={() => setCollapsed(!inPanel)}
          className="ml-auto hidden rounded-lg p-1.5 text-[#4C6355] transition hover:bg-[#F1FBF6] xl:block"
        >
          <PanelIcon size={17} />
        </button>
      </div>
      {GROUPS.map(group => (
        <div key={group.title} className="flex flex-col gap-[3px]">
          <span className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#B3BFB7]">
            {group.title}
          </span>
          {group.items.map(item => (
            <WideItem
              key={item.label}
              item={item}
              active={isActive(location, item.path)}
              count={countOf(item)}
              onSelect={select}
            />
          ))}
        </div>
      ))}
      <div className="mt-auto">{footer ?? <ConnectedAccounts />}</div>
    </>
  );

  const rail = (
    <div
      onMouseEnter={() => mode === "hover" && setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="relative hidden shrink-0 xl:block"
    >
      <div className="flex h-[calc(100vh-40px)] w-[76px] flex-col items-center gap-[22px] rounded-[20px] bg-white px-4 py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#12B85C]">
          <GranafySymbol size={22} tone="onDark" className="[&_circle]:stroke-white/40 [&_path]:stroke-white" />
        </span>

        <div className="flex flex-col items-center gap-1">
          {GROUPS.map((group, index) => (
            <div key={group.title} className="flex flex-col items-center gap-1">
              {index > 0 && <span className="my-2 h-px w-6 bg-[#F1F4F2]" />}
              {group.items.map(item => (
                <RailItem
                  key={item.label}
                  item={item}
                  active={isActive(location, item.path)}
                  count={countOf(item)}
                  tooltips={preferences.sidebarTooltips && !hovering}
                  onSelect={select}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-auto flex flex-col items-center gap-2.5">
          <ConnectedAccounts variant="rail" />
          {mode !== "hover" && (
            <button
              type="button"
              aria-label="Expandir menu"
              title="Expandir menu"
              onClick={() => setCollapsed(false)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-[#4C6355] transition hover:bg-[#F1FBF6]"
            >
              <PanelIcon size={18} />
            </button>
          )}
        </div>
      </div>

      {/*
        No modo "expandir ao passar" o painel abre por cima do conteúdo em vez de
        empurrá-lo: reflowar a página inteira a cada passada do mouse faria a
        tela pular embaixo do cursor.
      */}
      {mode === "hover" && hovering && (
        <div className="absolute left-0 top-0 z-[80] flex h-[calc(100vh-40px)] w-[236px] flex-col gap-[14px] overflow-hidden rounded-[20px] bg-white px-[14px] py-5 shadow-[0_18px_44px_rgba(11,31,20,.16)]">
          {wideBody(true)}
        </div>
      )}
    </div>
  );

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

      {/* No celular a barra é sempre a gaveta inteira: rail de ícones em tela pequena esconde o nome sem ter hover para mostrá-lo. */}
      <aside
        className={`fixed inset-y-3 left-3 z-50 flex w-[236px] shrink-0 flex-col gap-[14px] overflow-hidden rounded-[20px] bg-white px-[14px] py-5 shadow-[0_18px_44px_rgba(11,31,20,.16)] transition-transform ${
          open ? "translate-x-0" : "-translate-x-[260px]"
        } ${collapsed ? "xl:hidden" : "xl:sticky xl:inset-auto xl:top-5 xl:h-[calc(100vh-40px)] xl:min-h-0 xl:translate-x-0 xl:shadow-none"}`}
      >
        {wideBody(false)}
      </aside>

      {collapsed && (
        <>
          <div aria-hidden="true" className="hidden w-[76px] shrink-0 xl:block" />
          <div className="fixed left-5 top-5 z-[70] hidden xl:block">{rail}</div>
        </>
      )}
    </>
  );
}
