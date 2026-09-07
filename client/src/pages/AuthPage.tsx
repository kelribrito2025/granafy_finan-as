import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowUpIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  ShowIcon,
  TrendUpIcon,
} from "@/components/IconlyIcons";
import { trpc } from "@/lib/trpc";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type AuthMode = "login" | "signup";

const inputClass =
  "h-12 w-full rounded-[12px] border border-[#DCE5DF] bg-[#F4F8F6] px-3.5 text-[13px] text-[#0B1F14] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[#9AA69E] hover:bg-[#F0F6F2] focus:border-[#12B85C] focus:bg-white focus:ring-4 focus:ring-[#12B85C]/10";

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
  const { user, loading, refresh } = useAuth();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isSignup = mode === "signup";

  const loginMutation = trpc.auth.login.useMutation();
  const signupMutation = trpc.auth.signup.useMutation();
  const submitting = loginMutation.isPending || signupMutation.isPending;

  useEffect(() => {
    setFormError(null);
  }, [mode]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    if (isSignup && password !== passwordConfirmation) {
      setFormError("As senhas não coincidem");
      return;
    }

    try {
      if (isSignup) {
        await signupMutation.mutateAsync({ name, email, password });
      } else {
        await loginMutation.mutateAsync({ email, password });
      }
      await refresh();
      setLocation("/", { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível continuar");
    }
  };

  return (
    <main className="min-h-screen bg-white text-[#0B1F14] lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(460px,.92fr)]">
      <BrandPanel />

      <section className="relative flex min-h-screen flex-col px-5 py-6 sm:px-10 sm:py-9 lg:px-12 xl:px-16">
        <div className="flex items-center justify-between lg:hidden">
          <div className="flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#12B85C] text-[13px] font-bold text-white shadow-[0_8px_20px_rgba(18,184,92,.2)]">
              NV
            </span>
            <div>
              <p className="text-[13px] font-bold">NV Financeiro</p>
              <p className="text-[10px] text-[#8A968D]">Número Virtual LTDA</p>
            </div>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[460px] flex-1 flex-col justify-center py-12 sm:py-16 lg:py-20">
          <div>
            <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px]">
              {isSignup ? "Crie sua conta" : "Acesse sua conta"}
            </h1>
            <p className="mt-3 text-[15px] leading-6 text-[#718077]">
              {isSignup
                ? "Comece agora a organizar sua operação financeira."
                : "Bem-vindo de volta ao NV Financeiro."}
            </p>
          </div>

          {user ? (
            <div className="mt-6">
              <div className="flex items-center gap-3 rounded-[16px] bg-[#DFF6EA] p-3.5 text-[#0A7A42]">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-white/70">
                  <CheckIcon size={18} />
                </span>
                <div className="min-w-0">
                  <strong className="block truncate text-[12.5px]">Você já está conectado</strong>
                  <span className="mt-0.5 block truncate text-[11px] text-[#478261]">{user.email || user.name}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLocation("/")}
                className="mt-5 flex h-11 w-full items-center justify-center gap-2.5 rounded-[12px] bg-[#12B85C] px-5 text-[13px] font-bold text-white transition-colors duration-150 hover:bg-[#0F9E4E] active:scale-[0.985]"
              >
                Ir para o painel <ChevronRightIcon size={16} />
              </button>
            </div>
          ) : (
            <form className="mt-8 space-y-4" onSubmit={submit}>
              {isSignup && (
                <label className="block">
                  <span className="mb-2 block text-[13px] font-semibold text-[#18271F]">Nome</span>
                  <input
                    className={inputClass}
                    type="text"
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={event => setName(event.target.value)}
                    placeholder="Seu nome"
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-[13px] font-semibold text-[#18271F]">E-mail</span>
                <input
                  className={inputClass}
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="voce@empresa.com"
                  maxLength={320}
                  required
                />
              </label>

              <label className="block">
                <span className="mb-2 flex items-center justify-between gap-4 text-[13px] font-semibold text-[#18271F]">
                  Senha
                  {!isSignup && (
                    <button
                      type="button"
                      onClick={() => toast.info("A recuperação de senha será adicionada em breve.")}
                      className="text-[12.5px] font-semibold text-[#0A9650] transition-colors hover:text-[#0B1F14]"
                    >
                      Esqueceu a senha?
                    </button>
                  )}
                </span>
                <span className="relative block">
                  <input
                    className={`${inputClass} pr-13`}
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    value={password}
                    onChange={event => setPassword(event.target.value)}
                    placeholder="Mínimo de 8 caracteres"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(value => !value)}
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex w-13 items-center justify-center text-[#718077] transition-colors hover:text-[#0A9650] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12B85C]"
                  >
                    <ShowIcon size={21} />
                  </button>
                </span>
              </label>

              {isSignup && (
                <label className="block">
                  <span className="mb-2 block text-[13px] font-semibold text-[#18271F]">Confirmar senha</span>
                  <span className="relative block">
                    <input
                      className={`${inputClass} pr-13`}
                      type={showPassword ? "text" : "password"}
                      name="passwordConfirmation"
                      autoComplete="new-password"
                      value={passwordConfirmation}
                      onChange={event => setPasswordConfirmation(event.target.value)}
                      placeholder="Digite a senha novamente"
                      minLength={8}
                      maxLength={128}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(value => !value)}
                      aria-label={showPassword ? "Ocultar confirmação de senha" : "Mostrar confirmação de senha"}
                      aria-pressed={showPassword}
                      className="absolute inset-y-0 right-0 flex w-13 items-center justify-center text-[#718077] transition-colors hover:text-[#0A9650] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12B85C]"
                    >
                      <ShowIcon size={21} />
                    </button>
                  </span>
                </label>
              )}

              {formError && (
                <div role="alert" className="rounded-[12px] bg-[#FDECEA] px-3.5 py-3 text-[11.5px] font-medium text-[#8E1F16]">
                  {formError}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || submitting}
                className="mt-1 flex h-11 w-full items-center justify-center gap-2.5 rounded-[12px] bg-[#12B85C] px-5 text-[13px] font-bold text-white transition-colors duration-150 hover:bg-[#0F9E4E] active:scale-[0.985] disabled:cursor-wait disabled:opacity-70"
              >
                {loading || submitting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    Aguarde...
                  </>
                ) : (
                  isSignup ? "Criar minha conta" : "Entrar"
                )}
              </button>
            </form>
          )}

          {!user && (
            <div className="mt-7 text-center text-[14px] text-[#718077]">
              {isSignup ? "Já tem uma conta?" : "Não tem uma conta?"}{" "}
              <Link
                href={isSignup ? "/login" : "/cadastro"}
                className="font-semibold text-[#0A9650] transition-colors hover:text-[#0B1F14]"
              >
                {isSignup ? "Entre agora" : "Cadastre-se grátis"}
              </Link>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-[#9AA69E] lg:justify-start">
          <span>© 2026 NV Financeiro · Todos os direitos reservados</span>
        </div>
      </section>
    </main>
  );
}
