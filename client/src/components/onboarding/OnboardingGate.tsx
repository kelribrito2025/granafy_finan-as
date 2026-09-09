import { GranafyLoader } from "@/components/GranafyLoader";
import { ConviteAoTour } from "@/components/onboarding/ConviteAoTour";
import { OnboardingRodape, OnboardingShell, type PassoIndice } from "@/components/onboarding/OnboardingStepper";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { OnboardingWelcome } from "@/components/onboarding/OnboardingWelcome";
import { StepConta } from "@/components/onboarding/StepConta";
import { StepEmpresa } from "@/components/onboarding/StepEmpresa";
import { StepExtrato } from "@/components/onboarding/StepExtrato";
import { StepResumo } from "@/components/onboarding/StepResumo";
import { StepTema } from "@/components/onboarding/StepTema";
import type { OpeningComparison } from "@shared/openingBalance";
import { trpc } from "@/lib/trpc";
import { useState, type ReactNode } from "react";

/**
 * O portão do primeiro acesso.
 *
 * Fica entre a autenticação e o painel: se o servidor disser que a conta é nova
 * e vazia, o fluxo toma a tela; caso contrário o portão some e não custa nada
 * além de uma consulta.
 *
 * Enquanto a consulta não volta, mostra o loader em vez do painel. Um piscar do
 * painel antes do assistente entregaria justamente a tela que o assistente
 * existe para preparar.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const status = trpc.onboarding.status.useQuery();
  const utils = trpc.useUtils();
  const [passo, setPasso] = useState<PassoIndice | null>(null);
  /*
   * O convite ao tour, oferecido uma vez quando o fluxo termina.
   *
   * "pendente" enquanto ninguém respondeu; "no-tour" com o tour aberto;
   * "fechado" depois de responder — ou quando nem chega a ser feito, que é o
   * caso de quem sai do resumo por um atalho com destino.
   */
  const [convite, setConvite] = useState<"pendente" | "no-tour" | "fechado">("pendente");
  /*
   * O que o fluxo aprendeu pelo caminho.
   *
   * Não vai para o banco: é estado de uma sentada, e o resumo do passo 4 é o
   * único que precisa dele. Guardar isso numa tabela seria persistir algo que
   * dura minutos.
   */
  const [conta, setConta] = useState<{ id: number; saldo: number; data: string } | null>(null);
  const [importados, setImportados] = useState(0);
  const [divergencia, setDivergencia] = useState<OpeningComparison | null>(null);

  const concluir = trpc.onboarding.complete.useMutation({
    onSuccess: () => utils.onboarding.status.invalidate(),
  });

  if (status.isPending) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#EFF4F1]">
        <GranafyLoader label="Preparando sua conta…" />
      </div>
    );
  }

  /*
   * Erro na consulta não bloqueia ninguém: o painel abre normalmente. Deixar a
   * pessoa presa numa tela de erro por causa de um assistente seria trocar um
   * incômodo por uma porta trancada.
   */
  /*
   * A pergunta "deve mostrar?" só vale antes de começar.
   *
   * O passo do extrato importa de verdade, e importar dá dados à conta — o que
   * faz o próprio `show` virar false no meio do caminho. Sem esta trava, o
   * fluxo desaparecia entre o passo 3 e o 4 e a pessoa caía no painel sem
   * nunca ver o resumo do que acabou de configurar.
   *
   * Depois de começar, só duas coisas tiram alguém daqui: terminar ou pular.
   */
  const emFluxo = passo !== null;

  /*
   * Acabou de terminar aqui dentro: o painel abre com o convite por cima.
   *
   * É o único momento em que o convite aparece — quem já usa o sistema cai no
   * ramo de baixo e não leva modal nenhum na cara.
   */
  if (concluir.isSuccess) {
    return (
      <>
        {children}
        {convite === "pendente" && (
          <ConviteAoTour
            onTour={() => setConvite("no-tour")}
            onExplorar={() => setConvite("fechado")}
          />
        )}
        {convite === "no-tour" && <OnboardingTour onClose={() => setConvite("fechado")} />}
      </>
    );
  }

  if (!emFluxo && (status.isError || !status.data?.show)) {
    return <>{children}</>;
  }

  /*
   * Encerrar o fluxo, por qualquer porta.
   *
   * Com destino escolhido — os três atalhos do resumo e o "Ver os planos" — o
   * convite não chega a aparecer: a pessoa acabou de dizer para onde quer ir,
   * e um modal no meio do caminho seria justamente o que ela não pediu.
   */
  const encerrar = (comDestino = false) => {
    if (comDestino) setConvite("fechado");
    concluir.mutate();
  };

  if (passo === null) {
    return (
      <OnboardingWelcome
        name={status.data?.name ?? ""}
        skipping={concluir.isPending}
        onStart={() => setPasso(0)}
        onSkip={() => encerrar()}
      />
    );
  }

  /*
   * O rodapé é montado aqui e passado para cada passo: assim o botão principal
   * fica desabilitado enquanto o passo salva, sem cada um reinventar a barra.
   */
  const rodapeDe = ({ onContinue, pending, label, extra, disabled = false }: {
    onContinue: () => void;
    pending: boolean;
    label: string;
    extra?: ReactNode;
    /** Bloqueado esperando uma decisão da pessoa — diferente de estar salvando. */
    disabled?: boolean;
  }) => (
    <OnboardingRodape>
      <button
        type="button"
        onClick={() => setPasso(anterior => (anterior === 0 ? null : ((anterior ?? 1) - 1) as PassoIndice))}
        className="h-[46px] rounded-[12px] border border-[#E3EBE6] px-5 text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#F8FAF9]"
      >
        Voltar
      </button>
      {extra}
      <button
        type="button"
        onClick={onContinue}
        disabled={pending || disabled}
        className="h-[46px] rounded-[12px] bg-[#12B85C] px-6 text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-50"
      >
        {pending ? "Salvando…" : label}
      </button>
    </OnboardingRodape>
  );

  /** O texto pequeno do canto esquerdo do rodapé, um por passo. */
  const DICAS = [
    "Você pode trocar a qualquer momento, pelo botão de tema",
    "Leva menos de um minuto",
    "Você adiciona as outras contas depois, em Contas e categorias",
    "O extrato pode entrar depois, em Lançamentos",
    "Você pode refazer esses passos em Configurações",
  ];

  const CONTEUDO = [
    { titulo: "Escolha a aparência", apoio: "Vale para este navegador e dá para trocar quando quiser. Nada aqui muda os seus números." },
    { titulo: "Confirme a empresa", apoio: "Razão social, CNPJ e regime tributário. O regime só rotula relatórios — o GranaFy não calcula impostos." },
    { titulo: "Cadastre a primeira conta", apoio: "Banco, tipo e o saldo inicial. Você pode somar as outras contas depois." },
    { titulo: "Importe o extrato", apoio: "Um arquivo OFX ou CSV do internet banking. Se preferir, comece sem nada." },
    { titulo: "Tudo pronto", apoio: "O que ficou configurado e o que fazer em seguida." },
  ];

  const avancar = () => setPasso(anterior => ((anterior ?? 0) + 1) as PassoIndice);

  return (
    <OnboardingShell
      atual={passo}
      titulo={CONTEUDO[passo].titulo}
      apoio={CONTEUDO[passo].apoio}
      dica={DICAS[passo]}
      onSair={() => encerrar()}
      sairPending={concluir.isPending}
    >
      {passo === 0 && (
        <>
          <StepTema />
          {/* O tema não tem o que salvar — vale no clique — então o rodapé vem
              daqui em vez de de dentro do passo. */}
          {rodapeDe({ onContinue: avancar, pending: false, label: "Continuar" })}
        </>
      )}
      {passo === 1 && <StepEmpresa onDone={avancar} renderFooter={rodapeDe} />}
      {passo === 2 && (
        <StepConta
          onDone={(id, saldo, data) => { setConta({ id, saldo, data }); avancar(); }}
          onSkip={avancar}
          renderFooter={rodapeDe}
        />
      )}
      {passo === 3 && (
        <StepExtrato
          contaId={conta?.id ?? null}
          saldoInformado={conta?.saldo ?? null}
          dataInformada={conta?.data ?? null}
          onDone={({ importados: quantos, divergenciaMantida }) => {
            setImportados(quantos);
            setDivergencia(divergenciaMantida);
            avancar();
          }}
          onSkip={avancar}
          renderFooter={rodapeDe}
        />
      )}
      {passo === 4 && (
        <StepResumo
          nome={status.data?.name ?? ""}
          criadoEm={status.data?.createdAt ?? null}
          importados={importados}
          divergencia={divergencia}
          pending={concluir.isPending}
          onFinish={encerrar}
        />
      )}
    </OnboardingShell>
  );
}