import { ConnectedAccounts } from "@/components/ConnectedAccounts";
import { GranafyLogo, GranafySymbol } from "@/components/GranafyLogo";
import {
  ArrowUpIcon,
  ArrowsUpDownIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  DashboardIcon,
  DocumentIcon,
  ReportIcon,
  ReportsIcon,
  TrendUpIcon,
  WalletIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { usePreferences } from "@/contexts/PreferencesContext";
import { trpc } from "@/lib/trpc";
import { startsCollapsed, type SidebarMode } from "@shared/preferences";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toast } from "@/lib/toast";
import { useLocation } from "wouter";

type Item = {
  label: string;
  icon: IconlyIcon;
  path?: string;
  disabled?: boolean;
  /** O item que recebe a contagem de títulos abertos. */
  counter?: boolean;
  /** Submenu flutuante: o item ganha uma setinha e, clicado, abre estas opções. */
  children?: Array<{ label: string; path: string; icon: IconlyIcon }>;
};

/**
 * O menu, num lugar só.
 *
 * Cada página desenhava a própria cópia da barra; com três comportamentos para
 * escolher, manter oito cópias em pé seria garantir que uma delas ficasse para
 * trás na próxima mudança.
 */
const GROUPS: Array<{ title: string; items: Item[] }> = [
  /*
   * "Painel" tinha seis itens e virou uma lista, não um agrupamento. A quebra
   * separa o que se olha do que se opera: quem abre o sistema para saber como
   * está o mês fica em Painel; quem vem lançar, conciliar ou conferir o que já
   * andou fica em Movimentações.
   */
  {
    title: "Painel",
    items: [
      { label: "Visão geral", icon: DashboardIcon, path: "/" },
      { label: "Fluxo de caixa", icon: TrendUpIcon, path: "/fluxo-de-caixa" },
    ],
  },
  {
    title: "Movimentações",
    items: [
      { label: "A pagar e receber", icon: ArrowUpIcon, path: "/a-pagar-e-receber", counter: true },
      { label: "Pagas e recebidas", icon: ArrowsUpDownIcon, path: "/pagas-e-recebidas" },
      { label: "Lançamentos", icon: DocumentIcon, path: "/lancamentos" },
      { label: "Conciliação", icon: CheckIcon, path: "/conciliacao" },
    ],
  },
  {
    title: "Análise",
    items: [
      {
        label: "Relatórios", icon: ReportsIcon, path: "/relatorios",
        children: [
          { label: "Entradas vs. saídas", path: "/relatorios/entradas-vs-saidas", icon: ArrowsUpDownIcon },
          { label: "Fluxo de caixa geral", path: "/relatorios/fluxo-de-caixa-geral", icon: TrendUpIcon },
          { label: "Fluxo por conta bancária", path: "/relatorios/fluxo-por-conta", icon: WalletIcon },
        ],
      },
      { label: "DRE", icon: ReportIcon, path: "/dre" },
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

/**
 * O submenu flutuante de um item com filhos. Vai para o body por portal: a
 * barra tem overflow-hidden e transform, e qualquer coisa desenhada dentro
 * dela seria cortada na borda. Na tela larga abre à direita do item; no
 * celular, embaixo dele, porque a gaveta já ocupa mais da metade da tela.
 */
function Submenu({ ancora, filhos, location, onEscolher, onFechar }: {
  ancora: HTMLElement;
  filhos: NonNullable<Item["children"]>;
  location: string;
  onEscolher: (path: string) => void;
  onFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const medir = () => {
      const r = ancora.getBoundingClientRect();
      const larga = window.innerWidth >= 1280;
      setPos(larga ? { top: r.top - 6, left: r.right + 12 } : { top: r.bottom + 6, left: r.left });
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [ancora]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || ancora.contains(alvo)) return;
      onFechar();
    };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", tecla); };
  }, [ancora, onFechar]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={caixa}
      role="menu"
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-[120] flex min-w-[232px] flex-col gap-0.5 rounded-[16px] border border-[#E3EBE6] bg-white p-2 shadow-[0_18px_44px_rgba(11,31,20,.18)]"
    >
      {filhos.map(filho => {
        const aceso = location.startsWith(filho.path);
        const Icone = filho.icon;
        return (
          <button
            key={filho.path}
            type="button"
            role="menuitem"
            onClick={() => onEscolher(filho.path)}
            className={`flex w-full items-center gap-3 rounded-[11px] px-3 py-[10px] text-left text-[14px] transition ${
              aceso ? "bg-[#F1FBF6] font-bold text-[#0A7A42]" : "text-[#28382E] hover:bg-[#F8FAF9]"
            }`}
          >
            <Icone size={17} className={aceso ? "text-[#0A7A42]" : "text-[#4C6355]"} />
            {filho.label}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Um item da barra inteira: ícone, nome e, quando houver, a contagem. */
function WideItem({ item, active, count, aberto = false, onSelect }: {
  item: Item;
  active: boolean;
  count: number | null;
  /** Só para itens com submenu: se o flutuante está aberto (a setinha vira). */
  aberto?: boolean;
  onSelect: (item: Item, ancora: HTMLElement) => void;
}) {
  const { icon: Icon, label, disabled = false } = item;
  return (
    <button
      type="button"
      disabled={disabled}
      title={disabled ? "Página em desenvolvimento" : undefined}
      aria-haspopup={item.children ? "menu" : undefined}
      aria-expanded={item.children ? aberto : undefined}
      onClick={e => onSelect(item, e.currentTarget)}
      /*
       * A forma é a mesma do menu do admin do sistema — 12px de raio, 11px de
       * altura interna, 13,5px de texto. `rounded-xl` NÃO servia: o projeto
       * redefine a escala em `index.css` (`--radius-xl` é `--radius + 4px`),
       * então ele vale 16px aqui, e o item da barra ficava mais arredondado
       * que o do admin sem que a classe dissesse isso em lugar nenhum.
       */
      className={`flex w-full items-center gap-[11px] rounded-[12px] px-3 py-[11px] text-left text-[13.5px] transition active:scale-[.98] ${
        active
          ? "bg-[#12B85C] font-bold text-white"
          : disabled
            ? "cursor-not-allowed text-[#A8B1AB] opacity-55"
            : "text-[#28382E] hover:bg-[#F1FBF6]"
      }`}
    >
      <Icon size={16} />
      <span className="truncate">{label}</span>
      {item.children && (
        <ChevronRightIcon size={14} className={`ml-auto shrink-0 transition-transform ${aberto ? "rotate-90" : ""} ${active ? "text-white" : "text-[#8A968D]"}`} />
      )}
      {count !== null && count > 0 && (
        <span className={`ml-auto rounded-[6px] px-2 py-0.5 text-[11px] font-bold ${active ? "bg-white/20 text-white" : "bg-[#F1F4F2] text-[#4C6355]"}`}>
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
  onSelect: (item: Item, ancora: HTMLElement) => void;
}) {
  const { icon: Icon, label, disabled = false } = item;
  return (
    <button
      type="button"
      disabled={disabled}
      // Sem tooltip próprio o title do navegador é o que sobra de acessível.
      title={tooltips ? undefined : disabled ? `${label} · em desenvolvimento` : label}
      aria-label={label}
      aria-haspopup={item.children ? "menu" : undefined}
      onClick={e => onSelect(item, e.currentTarget)}
      className={`group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] transition active:scale-[.96] ${
        active
          ? "bg-[#12B85C] text-white"
          : disabled
            ? "cursor-not-allowed text-white/35"
            : "text-[#C5DACE] hover:bg-white/10 hover:text-white"
      }`}
    >
      <Icon size={19} />
      {item.children && (
        <ChevronRightIcon size={10} className={`absolute bottom-[5px] right-[5px] ${active ? "text-white/80" : "text-[#C5DACE]/70"}`} />
      )}
      {count !== null && count > 0 && (
        <span className="absolute right-[5px] top-[5px] flex h-4 min-w-4 items-center justify-center rounded-lg border-2 border-[#0B1F14] bg-[#B3261E] px-1 text-[9.5px] font-bold text-white">
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

  /* O submenu aberto, com o botão que o abriu: o flutuante se posiciona por ele. */
  const [submenu, setSubmenu] = useState<{ item: Item; ancora: HTMLElement } | null>(null);
  useEffect(() => setSubmenu(null), [location]);

  const select = (item: Item, ancora: HTMLElement) => {
    if (item.children) {
      setSubmenu(atual => (atual?.item === item ? null : { item, ancora }));
      return;
    }
    onClose();
    if (!item.path) {
      toast.info(`${item.label} ainda não está disponível.`);
      return;
    }
    setLocation(item.path);
  };

  const escolherFilho = (path: string) => {
    setSubmenu(null);
    onClose();
    setLocation(`${path}${window.location.search}`);
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
              aberto={submenu?.item === item}
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
      onMouseLeave={() => { if (!submenu) setHovering(false); }}
      className="relative hidden shrink-0 xl:block"
    >
      {/* Recolhida, a barra é verde-escuro: o mesmo #0B1F14 do painel de marca
          do login. Inteira ela é branca, como os cartões; recolhida vira um
          trilho, e o trilho se destaca do fundo em vez de se confundir com ele. */}
      <div className="flex h-[calc(100vh-40px)] w-[76px] flex-col items-center gap-[22px] rounded-[20px] bg-[#0B1F14] px-4 py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#12B85C]">
          <GranafySymbol size={22} tone="onDark" className="[&_circle]:stroke-white/40 [&_path]:stroke-white" />
        </span>

        <div className="flex flex-col items-center gap-1">
          {GROUPS.map((group, index) => (
            <div key={group.title} className="flex flex-col items-center gap-1">
              {index > 0 && <span className="my-2 h-px w-6 bg-white/10" />}
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
              className="flex h-11 w-11 items-center justify-center rounded-[12px] text-[#C5DACE] transition hover:bg-white/10"
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
      {submenu?.item.children && (
        <Submenu
          ancora={submenu.ancora}
          filhos={submenu.item.children}
          location={location}
          onEscolher={escolherFilho}
          onFechar={() => setSubmenu(null)}
        />
      )}
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
