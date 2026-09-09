import { GranafyLoader } from "@/components/GranafyLoader";
import { OnboardingShell, type PassoIndice } from "@/components/onboarding/OnboardingStepper";
import { OnboardingWelcome } from "@/components/onboarding/OnboardingWelcome";
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
  if (status.isError || !status.data?.show || concluir.isSuccess) {
    return <>{children}</>;
  }

  const pular = () => concluir.mutate();

  if (passo === null) {
    return (
      <OnboardingWelcome
        name={status.data.name}
        skipping={concluir.isPending}
        onStart={() => setPasso(0)}
        onTour={() => setPasso(0)}
        onSkip={pular}
      />
    );
  }

  /*
   * ESQUELETO — o conteúdo de cada passo chega nas etapas seguintes.
   *
   * A moldura, a faixa de passos e as duas saídas ("Voltar" e "Configurar
   * depois") já são as definitivas; o miolo dos quatro passos é o que falta.
   * Este commit não deve ir sozinho para produção.
   */
  const CONTEUDO: Array<{ titulo: string; apoio: string }> = [
    { titulo: "Confirme a empresa", apoio: "Razão social, CNPJ e regime tributário. O regime só rotula relatórios — o GranaFy não calcula impostos." },
    { titulo: "Cadastre a primeira conta", apoio: "Banco, tipo e o saldo inicial. Você pode somar as outras contas depois." },
    { titulo: "Importe o extrato", apoio: "Um arquivo OFX ou CSV do internet banking. Se preferir, comece sem nada." },
    { titulo: "Tudo pronto", apoio: "O que ficou configurado e o que fazer em seguida." },
  ];

  return (
    <OnboardingShell
      atual={passo}
      titulo={CONTEUDO[passo].titulo}
      apoio={CONTEUDO[passo].apoio}
      skipping={concluir.isPending}
      onSkip={pular}
      rodape={
        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => setPasso(anterior => (anterior === 0 ? null : ((anterior ?? 1) - 1) as PassoIndice))}
            className="h-[46px] rounded-[12px] border border-[#E3EBE6] px-5 text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#F8FAF9]"
          >
            Voltar
          </button>
          {passo < 3 && (
            <button
              type="button"
              onClick={() => setPasso(anterior => ((anterior ?? 0) + 1) as PassoIndice)}
              className="h-[46px] rounded-[12px] bg-[#12B85C] px-6 text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E]"
            >
              Continuar
            </button>
          )}
          {passo === 3 && (
            <button
              type="button"
              onClick={pular}
              disabled={concluir.isPending}
              className="h-[46px] rounded-[12px] bg-[#12B85C] px-6 text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-50"
            >
              Ir para o painel
            </button>
          )}
        </div>
      }
    >
      <p className="rounded-[14px] bg-[#F8FAF9] p-4 text-[13px] text-[#8A968D]">
        Os campos deste passo entram na próxima etapa do desenvolvimento.
      </p>
    </OnboardingShell>
  );
}
