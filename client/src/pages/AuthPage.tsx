import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowUpIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  TrendUpIcon,
} from "@/components/IconlyIcons";
import { startLogin } from "@/const";
import { useState } from "react";
import { Link, useLocation } from "wouter";

type AuthMode = "login" | "signup";

const benefits = [
  "Visão financeira em um só lugar",
  "Dados protegidos e acesso individual",
  "Acompanhamento claro de entradas e saídas",
];

function BrandPanel() {
  const bars = [35, 49, 43, 68, 59, 82, 74, 100];

  return (
    <section className="relative hidden min-h-full overflow-hidden bg-[#0B1F14] p-8 text-white lg:flex lg:flex-col xl:p-11">
      <div className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#12B85C]/12 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-44 -left-32 h-[380px] w-[380px] rounded-full bg-[#7EE2A8]/10 blur-3xl" />

      <div className="relative z-10 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#12B85C] text-[16px] font-bold shadow-[0_10px_28px_rgba(18,184,92,.28)]">
          NV
        </span>
        <div>
          <p className="text-[15px] font-bold tracking-[-0.01em]">NV Financeiro</p>
          <p className="mt-0.5 text-[11px] text-[#8FB39E]">Número Virtual LTDA</p>
        </div>
      </div>

      <div className="relative z-10 my-auto max-w-[540px] py-12">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#12B85C]/14 px-3 py-1.5 text-[11px] font-semibold text-[#7EE2A8] ring-1 ring-[#12B85C]/20">
          <span className="h-1.5 w-1.5 rounded-full bg-[#12B85C]" />
          Controle com clareza
        </span>
        <h1 className="mt-6 max-w-[500px] text-[40px] font-semibold leading-[1.08] tracking-[-0.045em] xl:text-[48px]">
          Sua operação financeira, simples de entender.
        </h1>
        <p className="mt-5 max-w-[460px] text-[15px] leading-7 text-[#A9C1B2]">
          Acompanhe caixa, recebimentos e decisões importantes em uma experiência segura e organizada.
        </p>

        <div className="mt-9 grid max-w-[520px] grid-cols-[minmax(0,1fr)_168px] gap-3">
          <div className="rounded-[20px] bg-white/[0.055] p-5 ring-1 ring-white/[0.07] backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#12B85C]/15 text-[#7EE2A8]">
                <TrendUpIcon size={17} />
              </span>
              <span className="text-[11px] font-medium text-[#8FB39E]">Caixa disponível</span>
            </div>
            <strong className="mt-4 block text-[27px] tracking-[-0.035em]">R$ 128.430</strong>
            <span className="mt-1 block text-[11px] font-semibold text-[#7EE2A8]">+9,6% neste mês</span>
            <div className="mt-6 flex h-[54px] items-end gap-1.5">
              {bars.map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  className={`flex-1 rounded-[4px] ${index >= 4 ? "bg-[#12B85C]" : "bg-[#254735]"}`}
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-1 flex-col justify-between rounded-[20px] bg-[#12B85C] p-4 shadow-[0_16px_40px_rgba(18,184,92,.16)]">
              <ArrowUpIcon size={18} className="text-white/80" />
              <div>
                <span className="text-[10px] text-white/70">A receber</span>
                <strong className="mt-1 block text-[18px]">R$ 42.180</strong>
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-between rounded-[20px] bg-white/[0.055] p-4 ring-1 ring-white/[0.07]">
              <ChartIcon size={18} className="text-[#7EE2A8]" />
              <div>
                <span className="text-[10px] text-[#8FB39E]">Margem líquida</span>
                <strong className="mt-1 block text-[18px]">40,2%</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="relative z-10 text-[11px] text-[#668272]">
        Seus dados financeiros continuam privados e vinculados à sua conta.
      </p>
    </section>
  );
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [leaving, setLeaving] = useState(false);
  const isSignup = mode === "signup";

  const continueAuth = () => {
    if (user) {
      setLocation("/");
      return;
    }

    setLeaving(true);
    startLogin();
  };

  return (
    <main className="min-h-screen bg-[#EFF4F1] text-[#0B1F14] lg:grid lg:grid-cols-[minmax(0,1.08fr)_minmax(460px,.92fr)]">
      <BrandPanel />

      <section className="flex min-h-screen flex-col px-5 py-5 sm:px-9 sm:py-8 lg:px-12 xl:px-16">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#12B85C] text-[13px] font-bold text-white shadow-[0_8px_20px_rgba(18,184,92,.2)]">
              NV
            </span>
            <div>
              <p className="text-[13px] font-bold">NV Financeiro</p>
              <p className="text-[10px] text-[#8A968D]">Número Virtual LTDA</p>
            </div>
          </div>
          <span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-[#4C6355] shadow-[0_8px_24px_rgba(11,31,20,.05)]">
            Ambiente seguro
          </span>
        </div>

        <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-10 sm:py-14">
          <div className="grid grid-cols-2 rounded-[14px] bg-[#E5ECE8] p-1">
            <Link
              href="/login"
              className={`rounded-[10px] px-4 py-2.5 text-center text-[12.5px] transition-all duration-150 ${
                !isSignup
                  ? "bg-white font-bold text-[#0B1F14] shadow-[0_5px_16px_rgba(11,31,20,.08)]"
                  : "font-medium text-[#718077] hover:text-[#0B1F14]"
              }`}
            >
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className={`rounded-[10px] px-4 py-2.5 text-center text-[12.5px] transition-all duration-150 ${
                isSignup
                  ? "bg-white font-bold text-[#0B1F14] shadow-[0_5px_16px_rgba(11,31,20,.08)]"
                  : "font-medium text-[#718077] hover:text-[#0B1F14]"
              }`}
            >
              Criar conta
            </Link>
          </div>

          <div className="mt-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#12B85C]">
              {isSignup ? "Primeiros passos" : "Bem-vindo de volta"}
            </p>
            <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.04em] sm:text-[34px]">
              {isSignup ? "Crie sua conta financeira" : "Acesse seu painel"}
            </h1>
            <p className="mt-3 text-[13.5px] leading-6 text-[#718077]">
              {isSignup
                ? "Organize sua operação e acompanhe os números que realmente importam para o seu negócio."
                : "Entre para consultar seu caixa, lançamentos e pendências com segurança."}
            </p>
          </div>

          {user ? (
            <div className="mt-6 flex items-center gap-3 rounded-[16px] bg-[#DFF6EA] p-3.5 text-[#0A7A42]">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/70">
                <CheckIcon size={18} />
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-[12.5px]">Você já está conectado</strong>
                <span className="mt-0.5 block truncate text-[11px] text-[#478261]">{user.email || user.name}</span>
              </div>
            </div>
          ) : (
            <div className="mt-7 space-y-3">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-center gap-3 text-[12.5px] text-[#4C6355]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#DFF6EA] text-[#0A7A42]">
                    <CheckIcon size={14} />
                  </span>
                  {benefit}
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={continueAuth}
            disabled={loading || leaving}
            className="mt-8 flex h-12 w-full items-center justify-center gap-2.5 rounded-[14px] bg-[#12B85C] px-5 text-[13.5px] font-bold text-white shadow-[0_12px_28px_rgba(18,184,92,.24)] transition duration-150 hover:bg-[#0F9E4E] hover:shadow-[0_14px_32px_rgba(18,184,92,.28)] active:scale-[0.985] disabled:cursor-wait disabled:opacity-70"
          >
            {loading || leaving ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                Aguarde...
              </>
            ) : (
              <>
                {user ? "Ir para o painel" : isSignup ? "Criar minha conta" : "Continuar para entrar"}
                <ChevronRightIcon size={16} />
              </>
            )}
          </button>

          {!user && (
            <p className="mt-4 text-center text-[11px] leading-5 text-[#8A968D]">
              {isSignup
                ? "Seus dados de acesso serão solicitados e protegidos no próximo passo."
                : "Você continuará em um ambiente protegido para confirmar seu acesso."}
            </p>
          )}

          <div className="mt-8 border-t border-[#DCE5DF] pt-5 text-center text-[11.5px] text-[#718077]">
            {isSignup ? "Já possui uma conta?" : "Ainda não possui uma conta?"}{" "}
            <Link
              href={isSignup ? "/login" : "/cadastro"}
              className="font-bold text-[#0A7A42] hover:text-[#0B1F14]"
            >
              {isSignup ? "Entrar" : "Criar conta"}
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] text-[#9AA69E]">
          <span>© 2026 NV Financeiro</span>
          <span className="h-1 w-1 rounded-full bg-[#C9D2CC]" />
          <span>Privacidade e segurança</span>
        </div>
      </section>
    </main>
  );
}
