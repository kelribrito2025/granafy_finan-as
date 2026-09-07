import {
  ChevronRightIcon,
  LockIcon,
  MessageIcon,
  ShowIcon,
} from "@/components/IconlyIcons";
import { trpc } from "@/lib/trpc";
import {
  ClipboardEvent,
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

const RESET_STORAGE_KEY = "nv-password-reset";
const inputClass =
  "h-12 w-full rounded-[12px] border border-[#DCE5DF] bg-[#F4F8F6] px-3.5 text-[13px] text-[#0B1F14] outline-none transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-[#9AA69E] hover:bg-[#F0F6F2] focus:border-[#12B85C] focus:bg-white focus:ring-4 focus:ring-[#12B85C]/10";
const primaryButtonClass =
  "flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#12B85C] px-5 text-[13px] font-bold text-white transition-colors duration-150 hover:bg-[#0F9E4E] active:scale-[0.985] disabled:cursor-wait disabled:opacity-70";

type ResetSession = {
  email: string;
  requestId: string;
  deliveryConfigured: boolean;
};

function ResetBrand() {
  return (
    <Link href="/login" className="inline-flex items-center gap-2.5 text-[#0B1F14]">
      <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#12B85C] text-[13px] font-bold text-white">
        NV
      </span>
      <span>
        <strong className="block text-[13px]">NV Financeiro</strong>
        <span className="block text-[10px] text-[#8A968D]">Número Virtual LTDA</span>
      </span>
    </Link>
  );
}

function Feedback({ message, tone = "error" }: { message: string; tone?: "error" | "info" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-[12px] px-3.5 py-3 text-[11.5px] font-medium ${
        tone === "error"
          ? "bg-[#FDECEA] text-[#8E1F16]"
          : "bg-[#ECF8F1] text-[#0A7A42]"
      }`}
    >
      {message}
    </div>
  );
}

export function ForgotPasswordPage() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const requestMutation = trpc.auth.requestPasswordReset.useMutation();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    try {
      const result = await requestMutation.mutateAsync({ email });
      const state: ResetSession = {
        email: email.trim().toLowerCase(),
        requestId: result.requestId,
        deliveryConfigured: result.deliveryConfigured,
      };
      sessionStorage.setItem(RESET_STORAGE_KEY, JSON.stringify(state));
      setLocation("/redefinir-senha");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível enviar o código");
    }
  };

  return (
    <main className="min-h-screen bg-[#F3F8F5] px-5 py-6 text-[#0B1F14] sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1180px] flex-col sm:min-h-[calc(100vh-4rem)]">
        <ResetBrand />

        <section className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center py-12">
          <div className="rounded-[24px] bg-white p-6 shadow-[0_20px_60px_rgba(11,31,20,.06)] sm:p-10">
            <span className="flex h-13 w-13 items-center justify-center rounded-[15px] bg-[#E5F7ED] text-[#0A7A42]">
              <MessageIcon size={25} />
            </span>
            <h1 className="mt-7 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[36px]">
              Esqueceu a senha?
            </h1>
            <p className="mt-3 text-[14px] leading-6 text-[#718077]">
              Informe o e-mail da conta e enviaremos um código para você criar uma nova senha.
            </p>

            <form className="mt-8 space-y-4" onSubmit={submit}>
              <label className="block">
                <span className="mb-2 block text-[13px] font-semibold text-[#18271F]">E-mail</span>
                <span className="relative block">
                  <MessageIcon
                    size={19}
                    className="pointer-events-none absolute left-3.5 top-1/2 z-10 -translate-y-1/2 text-[#0A7A42]"
                  />
                  <input
                    className={`${inputClass} pl-11`}
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={event => setEmail(event.target.value)}
                    placeholder="voce@empresa.com"
                    maxLength={320}
                    required
                    autoFocus
                  />
                </span>
              </label>

              {formError && <Feedback message={formError} />}

              <button
                type="submit"
                disabled={requestMutation.isPending}
                className={primaryButtonClass}
              >
                {requestMutation.isPending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    Enviando...
                  </>
                ) : (
                  "Enviar código de redefinição"
                )}
              </button>
            </form>

            <div className="mt-5 flex gap-3 rounded-[14px] bg-[#ECF8F1] p-4 text-[12px] leading-5 text-[#0A7A42]">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px] font-bold">
                i
              </span>
              <p>Se o e-mail não chegar em 5 minutos, verifique o spam ou solicite um novo código.</p>
            </div>

            <Link
              href="/login"
              className="mt-6 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-[#0A9650] hover:text-[#0B1F14]"
            >
              Voltar para entrar <ChevronRightIcon size={14} className="rotate-180" />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

function readResetSession(): ResetSession | null {
  try {
    const raw = sessionStorage.getItem(RESET_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ResetSession>;
    if (!parsed.email || !parsed.requestId) return null;
    return {
      email: parsed.email,
      requestId: parsed.requestId,
      deliveryConfigured: Boolean(parsed.deliveryConfigured),
    };
  } catch {
    return null;
  }
}

export function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<ResetSession | null>(null);
  const [ready, setReady] = useState(false);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [seconds, setSeconds] = useState(30);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const verifyMutation = trpc.auth.verifyPasswordResetCode.useMutation();
  const completeMutation = trpc.auth.completePasswordReset.useMutation();
  const resendMutation = trpc.auth.requestPasswordReset.useMutation();

  useEffect(() => {
    setSession(readResetSession());
    setReady(true);
  }, []);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => {
      setSeconds(value => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  useEffect(() => {
    if (ready && !session) setLocation("/esqueci-senha", { replace: true });
  }, [ready, session, setLocation]);

  const setDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    setDigits(current => current.map((item, itemIndex) => (itemIndex === index ? digit : item)));
    setFormError(null);
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setDigits(Array.from({ length: 6 }, (_, index) => pasted[index] ?? ""));
    otpRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  const verifyCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) return;
    const code = digits.join("");
    if (code.length !== 6) {
      setFormError("Informe os 6 dígitos do código");
      return;
    }

    setFormError(null);
    try {
      const result = await verifyMutation.mutateAsync({
        requestId: session.requestId,
        code,
      });
      setResetToken(result.resetToken);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Código inválido ou expirado");
    }
  };

  const resend = async () => {
    if (!session || seconds > 0 || resendMutation.isPending) return;
    setFormError(null);
    try {
      const result = await resendMutation.mutateAsync({ email: session.email });
      const nextSession = {
        ...session,
        requestId: result.requestId,
        deliveryConfigured: result.deliveryConfigured,
      };
      sessionStorage.setItem(RESET_STORAGE_KEY, JSON.stringify(nextSession));
      setSession(nextSession);
      setDigits(["", "", "", "", "", ""]);
      setSeconds(30);
      otpRefs.current[0]?.focus();
      toast.success("Um novo código foi solicitado.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível reenviar o código");
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resetToken) return;
    if (password !== confirmation) {
      setFormError("As senhas não coincidem");
      return;
    }

    setFormError(null);
    try {
      await completeMutation.mutateAsync({ resetToken, password });
      sessionStorage.removeItem(RESET_STORAGE_KEY);
      toast.success("Senha redefinida. Entre com sua nova senha.");
      setLocation("/login", { replace: true });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível redefinir a senha");
    }
  };

  if (!ready || !session) return null;

  return (
    <main className="min-h-screen bg-[#F3F8F5] px-5 py-6 text-[#0B1F14] sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-[1180px] flex-col sm:min-h-[calc(100vh-4rem)]">
        <ResetBrand />

        <section className="mx-auto flex w-full max-w-[620px] flex-1 flex-col justify-center py-12">
          <div className="rounded-[26px] bg-white p-6 shadow-[0_20px_60px_rgba(11,31,20,.07)] sm:p-10">
            <span className="flex h-13 w-13 items-center justify-center rounded-[15px] bg-[#E5F7ED] text-[#0A7A42]">
              <LockIcon size={25} />
            </span>
            <h1 className="mt-7 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[36px]">
              Redefinir senha
            </h1>

            {!resetToken ? (
              <>
                <p className="mt-3 text-[14px] leading-6 text-[#718077]">
                  Enviamos um código de 6 dígitos para <strong className="font-semibold text-[#0B1F14]">{session.email}</strong>.
                </p>

                {!session.deliveryConfigured && (
                  <div className="mt-5">
                    <Feedback
                      tone="info"
                      message="O serviço de envio de e-mail ainda precisa ser conectado para entregar o código."
                    />
                  </div>
                )}

                <form className="mt-8" onSubmit={verifyCode}>
                  <div className="grid grid-cols-6 gap-2.5" onPaste={handlePaste}>
                    {digits.map((digit, index) => (
                      <input
                        key={index}
                        ref={element => {
                          otpRefs.current[index] = element;
                        }}
                        value={digit}
                        onChange={event => setDigit(index, event.target.value)}
                        onKeyDown={event => handleOtpKeyDown(index, event)}
                        inputMode="numeric"
                        autoComplete={index === 0 ? "one-time-code" : "off"}
                        aria-label={`Dígito ${index + 1}`}
                        maxLength={1}
                        className="h-14 min-w-0 rounded-[13px] border border-[#DCE5DF] bg-[#F7F9F8] text-center text-[22px] font-semibold outline-none transition focus:border-[#12B85C] focus:bg-white focus:ring-4 focus:ring-[#12B85C]/10"
                      />
                    ))}
                  </div>

                  {formError && <div className="mt-4"><Feedback message={formError} /></div>}

                  <button
                    type="submit"
                    disabled={verifyMutation.isPending || digits.some(digit => !digit)}
                    className={`${primaryButtonClass} mt-5`}
                  >
                    {verifyMutation.isPending ? "Validando..." : "Validar código"}
                  </button>
                </form>

                <p className="mt-6 text-center text-[13px] text-[#718077]">
                  Não recebeu?{" "}
                  <button
                    type="button"
                    onClick={resend}
                    disabled={seconds > 0 || resendMutation.isPending}
                    className="font-semibold text-[#0A9650] disabled:cursor-default disabled:text-[#718077]"
                  >
                    {seconds > 0
                      ? `Reenviar em 0:${seconds.toString().padStart(2, "0")}`
                      : resendMutation.isPending
                        ? "Reenviando..."
                        : "Reenviar código"}
                  </button>
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 text-[14px] leading-6 text-[#718077]">
                  Crie uma senha segura com pelo menos 8 caracteres.
                </p>

                <form className="mt-8 space-y-4" onSubmit={savePassword}>
                  <label className="block">
                    <span className="mb-2 block text-[13px] font-semibold">Nova senha</span>
                    <span className="relative block">
                      <input
                        className={`${inputClass} pr-12`}
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={event => setPassword(event.target.value)}
                        autoComplete="new-password"
                        placeholder="Mínimo de 8 caracteres"
                        minLength={8}
                        maxLength={128}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(value => !value)}
                        aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[#718077] hover:text-[#0A9650]"
                      >
                        <ShowIcon size={20} />
                      </button>
                    </span>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-[13px] font-semibold">Confirmar nova senha</span>
                    <input
                      className={inputClass}
                      type={showPassword ? "text" : "password"}
                      value={confirmation}
                      onChange={event => setConfirmation(event.target.value)}
                      autoComplete="new-password"
                      placeholder="Digite a senha novamente"
                      minLength={8}
                      maxLength={128}
                      required
                    />
                  </label>

                  {formError && <Feedback message={formError} />}

                  <button
                    type="submit"
                    disabled={completeMutation.isPending}
                    className={primaryButtonClass}
                  >
                    {completeMutation.isPending ? "Salvando..." : "Salvar nova senha"}
                  </button>
                </form>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
