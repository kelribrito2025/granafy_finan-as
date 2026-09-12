import { GranafyLogo } from "@/components/GranafyLogo";
import { BuildingIcon, UploadIcon, WalletIcon, type IconlyIcon } from "@/components/IconlyIcons";

const PASSOS: Array<{ numero: string; titulo: string; apoio: string; icone: IconlyIcon }> = [
  {
    icone: BuildingIcon,
    numero: "Passo 1",
    titulo: "Confirme a empresa",
    apoio: "Revise os dados que aparecerão nos relatórios.",
  },
  {
    icone: WalletIcon,
    numero: "Passo 2",
    titulo: "Cadastre a primeira conta",
    apoio: "Informe o banco, o tipo da conta e o saldo inicial.",
  },
  {
    icone: UploadIcon,
    numero: "Passo 3",
    titulo: "Importe o extrato",
    apoio: "Envie um arquivo OFX ou CSV. Você também pode fazer isso depois.",
  },
];

/**
 * A porta de entrada do primeiro acesso.
 *
 * Promete que o painel abre com movimentações de verdade, não com dados de
 * exemplo — e é por isso que sair pelo "Configurar depois" leva a um painel
 * vazio em vez de a um cheio de números inventados.
 */
export function OnboardingWelcome({ name, onStart, onSkip, skipping }: {
  name: string;
  onStart: () => void;
  onSkip: () => void;
  skipping: boolean;
}) {
  const primeiroNome = name.trim().split(" ")[0];

  return (
    /*
     * Tela cheia clara, como o resto do primeiro acesso.
     *
     * A abertura é a única coisa na tela porque é isso que ela é: não há painel
     * atrás. O escuro ficou onde ele informa alguma coisa — nos três cartões do
     * caminho —, e não como fundo de tudo: uma tela inteira escura na abertura
     * e clara no passo seguinte dava um degrau que não queria dizer nada.
     */
    <div className="flex min-h-screen w-full flex-col bg-white text-[#0B1F14]">
      <header className="flex items-center px-5 py-5 sm:px-10">
        <GranafyLogo size={32} />
        <button
          type="button"
          onClick={onSkip}
          disabled={skipping}
          className="ml-auto text-[13px] text-[#8A968D] transition hover:text-[#0B1F14] disabled:opacity-50"
        >
          {skipping ? "Abrindo o painel…" : "Configurar depois"}
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col justify-center px-5 py-10 sm:px-10">
        <span className="text-[12.5px] font-semibold uppercase tracking-[.14em] text-[#0A7A42]">
          {primeiroNome ? `Bem-vindo, ${primeiroNome}` : "Bem-vindo ao GranaFy"}
        </span>
        <h1 className="mt-3 max-w-[24ch] text-[32px] font-bold leading-[1.1] tracking-[-.03em] sm:text-[42px]">
          Vamos organizar o financeiro da sua empresa em poucos minutos.
        </h1>
        <p className="mt-4 max-w-[62ch] text-[14.5px] leading-relaxed text-[#4C6355]">
          Confirme alguns dados e importe seu extrato. Depois disso, o painel abrirá com suas{" "}
          <strong className="font-semibold text-[#0A7A42]">movimentações reais</strong>.
        </p>

        {/* Os três lado a lado, como no modelo: dá para ver o caminho inteiro
            antes de dar o primeiro passo. A superfície é a dos cartões de
            recursos da landing ("Tudo o que o financeiro de uma PME precisa"):
            fundo claro, borda fina, chip verde — não o cartão escuro do
            painel, que aqui pesava demais antes de a pessoa ter qualquer dado. */}
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PASSOS.map(passo => {
            const Icone = passo.icone;
            return (
              <div key={passo.numero} className="flex flex-col gap-3 rounded-[20px] border border-[#EDF2EE] bg-[#F8FAF9] p-6">
                <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[12px] bg-[#DFF6EA] text-[#0A7A42]">
                  <Icone size={19} />
                </span>
                <span className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-[#8A968D]">
                  {passo.numero}
                </span>
                <strong className="text-[17px] font-bold text-[#0B1F14]">{passo.titulo}</strong>
                <span className="text-[14px] leading-[1.6] text-[#4C6355]">{passo.apoio}</span>
              </div>
            );
          })}
        </div>

        {/* Um botão só.
            O convite ao tour ficava aqui do lado e disputava com este: pedia
            para a pessoa escolher entre configurar e ser apresentada antes de
            ter visto tela nenhuma. Ele passou para depois do fluxo, já com o
            painel atrás. */}
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onStart}
            className="flex h-[50px] items-center justify-center rounded-[12px] bg-[#12B85C] px-8 text-[15px] font-bold text-white transition hover:bg-[#0F9E4E] active:scale-[.99]"
          >
            Começar
          </button>
        </div>
      </main>
    </div>
  );
}
