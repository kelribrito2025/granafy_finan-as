import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronRightIcon,
  CloseIcon,
  SettingsIcon,
} from "@/components/IconlyIcons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { trpc } from "@/lib/trpc";
import { useCallback, useRef, useState } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { useLocation } from "wouter";

/** Lucide `user`: uma pessoa, como o modelo do avatar pede. */
function PersonIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className={className}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/** Chevron fino do modelo do avatar — o ChevronRightIcon do conjunto é uma seta. */
function ChevronDownIcon({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** Sigla de duas letras para o quadrado da empresa. */
function initialsOf(text: string) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

/**
 * O seletor de empresas.
 *
 * O app é de uma empresa só: cada conta enxerga os próprios dados e não existe
 * organização compartilhada. A lista mostra a empresa real do cadastro; criar
 * ou trocar exigiria o modelo multiempresa, e a tela diz isso em vez de
 * oferecer um botão que não faz nada.
 */
function CompanySwitcher({ companyName, taxId, onClose }: {
  companyName: string;
  taxId: string;
  onClose: () => void;
}) {
  const [, setLocation] = useLocation();
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="company-switcher-title" className="fixed inset-0 z-[90] flex items-start justify-center bg-[#0B1F14]/42 p-4 backdrop-blur-[2px] sm:p-10" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="modal-enter w-full max-w-[452px] rounded-[20px] bg-white p-6 text-[#0B1F14]">
        <div className="flex items-start gap-3">
          <div>
            <h2 id="company-switcher-title" className="text-[18px] font-bold tracking-[-.01em]">Trocar de empresa</h2>
            <p className="mt-1 text-[12.5px] text-[#8A968D]">1 empresa neste acesso</p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F2] text-[#28382E] hover:bg-[#E7ECE9]"><CloseIcon size={16} /></button>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-[14px] border-[1.5px] border-[#12B85C] bg-[#F1FBF6] p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#12B85C] text-[13px] font-bold text-white">
            {initialsOf(companyName)}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-semibold">{companyName}</span>
            <span className="block truncate text-[12.5px] text-[#8A968D]">{taxId || "CNPJ não informado"}</span>
          </div>
          <span className="shrink-0 rounded-md bg-[#12B85C] px-2 py-1 text-[10.5px] font-bold uppercase tracking-[.06em] text-white">Atual</span>
        </div>

        <p className="mt-4 rounded-[14px] bg-[#FFF8E8] px-3.5 py-3 text-[11.5px] leading-relaxed text-[#725517]">
          Este acesso tem uma empresa só. Ter mais de uma exigiria que os dados fossem
          organizados por empresa, e não por conta de usuário como hoje.
        </p>

        <div className="mt-5 flex gap-2.5">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-xl border border-[#E3EAE5] text-[14px] font-semibold text-[#28382E] hover:bg-[#F8FAF9]">Fechar</button>
          <button
            type="button"
            onClick={() => { onClose(); setLocation("/configuracoes"); }}
            className="h-12 flex-[1.4] rounded-xl bg-[#12B85C] text-[14px] font-bold text-white hover:bg-[#0F9E4E]"
          >
            Editar dados da empresa
          </button>
        </div>
      </div>
    </div>
  );
}

/** O avatar da topbar e o menu que ele abre. */
export function ProfileMenu() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  // O nome da empresa só aparece depois que o menu abre. Buscá-lo junto com a
  // página punha mais uma consulta no lote que o conteúdo espera.
  const companyQuery = trpc.settings.company.useQuery(undefined, { enabled: open || switcher, staleTime: 60_000 });

  const company = companyQuery.data;
  const companyName = company?.tradeName || company?.legalName || "Empresa sem nome";

  useDismissOnOutside(open, anchor, useCallback(() => setOpen(false), []));

  return (
    <>
      <div ref={anchor} className="relative">
        <button
          type="button"
          aria-label="Abrir menu do perfil"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          title={user?.name || user?.email || "Sua conta"}
          className={`flex h-11 shrink-0 items-center gap-[9px] rounded-[14px] py-0 pl-1.5 pr-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12B85C] ${
            open ? "bg-[#F1FBF6]" : "bg-white hover:bg-[#F8FAF9]"
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DFF6EA] text-[#0A7A42]">
            <PersonIcon size={20} />
          </span>
          <ChevronDownIcon size={15} className="mr-1.5 text-[#8A968D]" />
        </button>

        {open && (
          <div className="popover-enter absolute right-0 top-[52px] z-40 w-[280px] rounded-[18px] bg-white p-2 shadow-[0_18px_44px_rgba(11,31,20,.16)] ring-1 ring-[#E1E8E3]">
            <div className="flex items-center gap-3 p-2.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DFF6EA] text-[#0A7A42]">
                <PersonIcon size={20} />
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-[15px]">{user?.name || "Sua conta"}</strong>
                <span className="block truncate text-[12.5px] text-[#8A968D]">{user?.email}</span>
              </div>
            </div>

            <div className="my-1.5 h-px bg-[#F1F4F2]" />

            <button
              type="button"
              onClick={() => { setOpen(false); setSwitcher(true); }}
              className="flex w-full items-center gap-3 rounded-[12px] bg-[#F1FBF6] p-2.5 text-left hover:bg-[#DFF6EA]"
            >
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#12B85C] text-[13px] font-bold text-white">
                {initialsOf(companyName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[#0A7A42]">{companyName}</span>
                <span className="block text-[12px] text-[#4C6355]">empresa atual</span>
              </span>
              <ChevronRightIcon size={16} className="shrink-0 text-[#0A7A42]" />
            </button>

            <button
              type="button"
              onClick={() => { setOpen(false); setLocation("/configuracoes"); }}
              className="mt-1.5 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] text-[#28382E] hover:bg-[#F1FBF6]"
            >
              <SettingsIcon size={16} className="text-[#4C6355]" />
              <span className="flex-1">Configurações</span>
              <ChevronRightIcon size={15} className="text-[#8A968D]" />
            </button>

            <div className="my-1.5 h-px bg-[#F1F4F2]" />

            <div className="flex items-center gap-3 px-3 py-1.5">
              <span className="text-[12.5px] font-semibold text-[#4C6355]">Aparência</span>
              <ThemeToggle showLabel={false} className="ml-auto rounded-[10px] bg-[#F1F4F2] p-1" />
            </div>

            <button
              type="button"
              onClick={async () => { setOpen(false); await logout(); setLocation("/login", { replace: true }); }}
              className="mt-1.5 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] font-semibold text-[#B3261E] hover:bg-[#FDECEA]"
            >
              <ChevronRightIcon size={16} />
              Sair da conta
            </button>
          </div>
        )}
      </div>

      {switcher && (
        <CompanySwitcher
          companyName={companyName}
          taxId={company?.taxId ?? ""}
          onClose={() => setSwitcher(false)}
        />
      )}
    </>
  );
}
