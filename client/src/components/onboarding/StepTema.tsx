import { CheckIcon } from "@/components/IconlyIcons";
import { CartaoDeApoio, OnboardingLateral } from "@/components/onboarding/OnboardingStepper";
import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";

/*
 * A prévia de cada tema, desenhada e não fotografada.
 *
 * Uma imagem de exemplo envelheceria na primeira vez que o painel mudasse —
 * e ainda pesaria no carregamento. Estas são quatro caixinhas com as cores de
 * verdade: o que a pessoa vê aqui é a mesma paleta que vai encontrar depois.
 */
function Previa({ escuro }: { escuro: boolean }) {
  const fundo = escuro ? "#0D1812" : "#EFF4F1";
  const cartao = escuro ? "#14241B" : "#FFFFFF";
  const linha = escuro ? "#22362A" : "#E3EBE6";
  const tinta = escuro ? "#9FB6A9" : "#4C6355";

  return (
    <span
      aria-hidden="true"
      className="flex h-[86px] w-full gap-1.5 overflow-hidden rounded-[10px] p-2"
      style={{ background: fundo }}
    >
      {/* A barra lateral, o cartão grande e as duas linhas: a silhueta do
          painel, o suficiente para reconhecer qual é qual. */}
      <span className="flex w-[22%] flex-col gap-1 rounded-[6px] p-1.5" style={{ background: cartao }}>
        <span className="h-1.5 w-full rounded-full" style={{ background: "#12B85C" }} />
        <span className="h-1 w-4/5 rounded-full" style={{ background: linha }} />
        <span className="h-1 w-3/5 rounded-full" style={{ background: linha }} />
      </span>
      <span className="flex flex-1 flex-col gap-1.5">
        <span className="flex flex-1 flex-col justify-center gap-1 rounded-[6px] px-2" style={{ background: cartao }}>
          <span className="h-1.5 w-2/5 rounded-full" style={{ background: "#12B85C" }} />
          <span className="h-1 w-3/5 rounded-full" style={{ background: tinta, opacity: 0.5 }} />
        </span>
        <span className="flex h-[26px] gap-1.5">
          <span className="flex-1 rounded-[6px]" style={{ background: cartao }} />
          <span className="flex-1 rounded-[6px]" style={{ background: cartao }} />
        </span>
      </span>
    </span>
  );
}

const OPCOES: Array<{ valor: ThemePreference; nome: string; frase: string; escuro: boolean }> = [
  { valor: "light", nome: "Claro", frase: "O padrão do GranaFy, para ambientes com luz.", escuro: false },
  { valor: "dark", nome: "Escuro", frase: "Menos brilho, para trabalhar à noite.", escuro: true },
  { valor: "auto", nome: "Automático", frase: "Acompanha o seu sistema e muda junto com ele.", escuro: false },
];

/**
 * A escolha do tema, aplicada na hora.
 *
 * Não tem "Continuar" próprio: a escolha vale no instante do clique, e um
 * botão de confirmar sugeriria que ela ainda não valeu. O rodapé do passo
 * segue em frente quando a pessoa quiser.
 */
export function StepTema() {
  const { preference, setPreference, theme } = useTheme();

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {OPCOES.map(opcao => {
          const escolhido = preference === opcao.valor;
          /* No automático a prévia mostra o que está valendo agora, não uma
             terceira aparência que não existe. */
          const previaEscura = opcao.valor === "auto" ? theme === "dark" : opcao.escuro;
          return (
            <button
              key={opcao.valor}
              type="button"
              onClick={() => setPreference?.(opcao.valor)}
              aria-pressed={escolhido}
              className={`flex flex-col gap-3 rounded-[16px] border-[1.5px] p-4 text-left transition ${
                escolhido
                  ? "border-[#12B85C] bg-[#F1FBF6]"
                  : "border-[#E3EBE6] hover:border-[#B9C7BE] hover:bg-[#F8FAF9]"
              }`}
            >
              <Previa escuro={previaEscura} />
              <span className="flex items-center gap-2">
                <strong className={`text-[14px] ${escolhido ? "text-[#0A7A42]" : "text-[#0B1F14]"}`}>
                  {opcao.nome}
                </strong>
                {escolhido && <CheckIcon size={15} className="text-[#0A7A42]" />}
                {opcao.valor === "auto" && (
                  <span className="ml-auto text-[11px] text-[#8A968D]">
                    agora: {theme === "dark" ? "escuro" : "claro"}
                  </span>
                )}
              </span>
              <span className="text-[12.5px] leading-relaxed text-[#4C6355]">{opcao.frase}</span>
            </button>
          );
        })}
      </div>

      <OnboardingLateral>
        <CartaoDeApoio titulo="Vale para este navegador">
          <span className="text-[12.5px] leading-relaxed text-[#4C6355]">
            A escolha fica guardada aqui, neste aparelho. Em outro computador você escolhe de novo —
            o tema não viaja com a conta.
          </span>
          <span className="text-[12.5px] leading-relaxed text-[#4C6355]">
            Dá para trocar a qualquer momento pelo botão de tema no topo de qualquer tela.
          </span>
        </CartaoDeApoio>
      </OnboardingLateral>
    </>
  );
}
