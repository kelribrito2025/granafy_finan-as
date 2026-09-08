import { useAuth } from "@/_core/hooks/useAuth";
import {
  ChevronRightIcon,
  CloseIcon,
  SettingsIcon,
  UsersIcon,
} from "@/components/IconlyIcons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

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
  const companyQuery = trpc.settings.company.useQuery(undefined, { staleTime: 60_000 });

  const initials = (user?.name || user?.email || "NV")
    .split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
  const company = companyQuery.data;
  const companyName = company?.tradeName || company?.legalName || "Empresa sem nome";

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (anchor.current && !anchor.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div ref={anchor} className="relative">
        <button
          type="button"
          aria-label="Abrir menu do perfil"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          className="flex h-11 min-w-11 items-center justify-center rounded-[12px] bg-[#0B1F14] px-2.5 text-[11px] font-bold text-white"
        >
          {initials || "NV"}
        </button>

        {open && (
          <div className="popover-enter absolute right-0 top-[52px] z-40 w-[312px] rounded-[18px] bg-white p-2 shadow-[0_18px_44px_rgba(11,31,20,.16)] ring-1 ring-[#E1E8E3]">
            <div className="flex items-center gap-3 p-2.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DFF6EA] text-[#0A7A42]">
                <UsersIcon size={20} />
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
