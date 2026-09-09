import { GranafyLogo } from "@/components/GranafyLogo";

const PASSOS = [
  {
    numero: "Passo 1",
    titulo: "Confirme a empresa",
    apoio: "Razão social, CNPJ e regime tributário. Nada aqui calcula imposto — o regime só rotula relatórios.",
  },
  {
    numero: "Passo 2",
    titulo: "Cadastre a primeira conta",
    apoio: "Banco, tipo e o saldo inicial. Você pode somar as outras depois.",
  },
  {
    numero: "Passo 3",
    titulo: "Importe o extrato",
    apoio: "OFX ou CSV do internet banking. Se preferir, comece sem nada.",
  },
];

/**
 * A porta de entrada do primeiro acesso.
 *
 * Promete que o painel abre com movimentações de verdade, não com dados de
 * exemplo — e é por isso que sair pelo "Configurar depois" leva a um painel
 * vazio em vez de a um cheio de números inventados.
 */
export function OnboardingWelcome({ name, onStart, onTour, onSkip, skipping }: {
  name: string;
  onStart: () => void;
  onTour: () => void;
  onSkip: () => void;
  skipping: boolean;
}) {
  const primeiroNome = name.trim().split(" ")[0];

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#E9EEEB] p-4 sm:p-8">
      <div className="w-full max-w-[720px] rounded-[24px] bg-[#0B1F14] p-8 text-white shadow-[0_18px_44px_rgba(11,31,20,.10)] sm:p-12">
        <GranafyLogo size={34} tone="onDark" />

        <h1 className="mt-8 text-[32px] font-bold leading-tight tracking-[-.025em] sm:text-[40px]">
          {primeiroNome ? `Bem-vindo, ${primeiroNome}` : "Bem-vindo ao GranaFy"}
        </h1>
        <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-[#C5DACE]">
          Vamos organizar o seu financeiro em poucos minutos. Três respostas e um arquivo de
          extrato — depois disso o painel abre com as suas movimentações,{" "}
          <strong className="font-semibold text-[#7EE2A8]">não com dados de exemplo</strong>.
        </p>

        <ol className="mt-9 flex flex-col">
          {PASSOS.map((passo, indice) => (
            <li
              key={passo.numero}
              className={`flex flex-col gap-1 py-5 ${indice > 0 ? "border-t border-[#1F3D2B]" : ""}`}
            >
              <span className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-[#8FB39E]">
                {passo.numero}
              </span>
              <strong className="text-[16px] font-bold">{passo.titulo}</strong>
              <span className="text-[13px] leading-relaxed text-[#C5DACE]">{passo.apoio}</span>
            </li>
          ))}
        </ol>

        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onStart}
            className="flex h-[50px] items-center justify-center rounded-[12px] bg-[#12B85C] px-8 text-[15px] font-bold text-white transition hover:bg-[#0F9E4E] active:scale-[.99]"
          >
            Começar
          </button>
          <button
            type="button"
            onClick={onTour}
            className="flex h-[50px] items-center justify-center rounded-[12px] border border-[#1F4230] px-6 text-[14px] font-semibold text-[#C5DACE] transition hover:bg-[#1F3D2B]"
          >
            Ver o tour de 90s
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={skipping}
            className="flex h-[50px] items-center justify-center px-2 text-[13.5px] text-[#8FB39E] transition hover:text-white disabled:opacity-50 sm:ml-auto"
          >
            {skipping ? "Abrindo o painel…" : "Configurar depois"}
          </button>
        </div>
      </div>
    </div>
  );
}
