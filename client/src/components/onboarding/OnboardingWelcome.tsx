import { GranafyLogo } from "@/components/GranafyLogo";
import { BuildingIcon, UploadIcon, WalletIcon, type IconlyIcon } from "@/components/IconlyIcons";

const PASSOS: Array<{ numero: string; titulo: string; apoio: string; icone: IconlyIcon }> = [
  {
    icone: BuildingIcon,
    numero: "Passo 1",
    titulo: "Confirme a empresa",
    apoio: "Razão social, CNPJ e regime tributário. Nada aqui calcula imposto — o regime só rotula relatórios.",
  },
  {
    icone: WalletIcon,
    numero: "Passo 2",
    titulo: "Cadastre a primeira conta",
    apoio: "Banco, tipo e o saldo inicial. Você pode somar as outras depois.",
  },
  {
    icone: UploadIcon,
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
    /*
     * Tela cheia em verde escuro, como o modelo 26A.
     *
     * A abertura é a única coisa na tela porque é isso que ela é: não há painel
     * atrás, e o fundo escuro marca que este momento é diferente do resto do
     * sistema — depois daqui tudo é claro.
     */
    <div className="flex min-h-screen w-full flex-col bg-[#0B1F14] text-white">
      <header className="flex items-center px-5 py-5 sm:px-10">
        <GranafyLogo size={32} tone="onDark" />
        <button
          type="button"
          onClick={onSkip}
          disabled={skipping}
          className="ml-auto text-[13px] text-[#8FB39E] transition hover:text-white disabled:opacity-50"
        >
          {skipping ? "Abrindo o painel…" : "Configurar depois"}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col justify-center px-5 py-10 sm:px-10">
        <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#7EE2A8]">
          {primeiroNome ? `Bem-vindo, ${primeiroNome}` : "Bem-vindo ao GranaFy"}
        </span>
        <h1 className="mt-3 max-w-[22ch] text-[34px] font-bold leading-[1.1] tracking-[-.03em] sm:text-[44px]">
          Vamos organizar o seu financeiro em poucos minutos.
        </h1>
        <p className="mt-4 max-w-[62ch] text-[14.5px] leading-relaxed text-[#C5DACE]">
          Três respostas e um arquivo de extrato — depois disso o painel abre com as suas
          movimentações, <strong className="font-semibold text-[#7EE2A8]">não com dados de exemplo</strong>.
        </p>

        {/* Os três lado a lado, como no modelo: dá para ver o caminho inteiro
            antes de dar o primeiro passo. */}
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {PASSOS.map(passo => {
            const Icone = passo.icone;
            return (
              <article key={passo.numero} className="flex flex-col gap-2 rounded-[16px] bg-[#132A1D] p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#1F4230] text-[#7EE2A8]">
                  <Icone size={17} />
                </span>
                <span className="mt-1 text-[10.5px] font-semibold uppercase tracking-[.12em] text-[#8FB39E]">
                  {passo.numero}
                </span>
                <strong className="text-[15px] font-bold">{passo.titulo}</strong>
                <span className="text-[12.5px] leading-relaxed text-[#C5DACE]">{passo.apoio}</span>
              </article>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3">
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
        </div>
      </main>
    </div>
  );
}
