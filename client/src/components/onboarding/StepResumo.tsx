import { ArrowsUpDownIcon, BuildingIcon, ChevronRightIcon, TagIcon, WalletIcon, type IconlyIcon } from "@/components/IconlyIcons";
import { OnboardingLateral, OnboardingRodape } from "@/components/onboarding/OnboardingStepper";
import { formatMoney } from "@/lib/appFormat";
import { trpc } from "@/lib/trpc";
import { useAssinaturasLiberadas } from "@/lib/sistema";
import type { OpeningComparison } from "@shared/openingBalance";
import { useLocation } from "wouter";

/** Quantos dias o teste dura. Só rótulo — ver o comentário do cartão abaixo. */
const DIAS_DE_TESTE = 14;

function somaDias(inicio: Date, dias: number) {
  const data = new Date(inicio);
  data.setDate(data.getDate() + dias);
  return data;
}

/** O CNPJ é guardado só com dígitos; a tela mostra pontuado. */
function cnpjLegivel(digitos: string) {
  if (digitos.length !== 14) return digitos;
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

function dataCurta(valor: Date) {
  return valor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function CartaoResumo({ icone: Icone, rotulo, valor, apoio }: {
  icone: IconlyIcon;
  rotulo: string;
  valor: string;
  apoio?: string;
}) {
  return (
    <article className="flex flex-col gap-1.5 rounded-[16px] bg-[#F8FAF9] p-4">
      <span className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[.1em] text-[#4C6355]">
        <Icone size={14} />
        {rotulo}
      </span>
      <strong className="text-[15px] leading-snug text-[#0B1F14]">{valor}</strong>
      {apoio && <span className="text-[12px] leading-relaxed text-[#4C6355]">{apoio}</span>}
    </article>
  );
}

export function StepResumo({ nome, criadoEm, importados, divergencia, onFinish, pending }: {
  nome: string;
  criadoEm: Date | null;
  importados: number;
  /** Preenchida só quando a pessoa manteve um saldo diferente do do arquivo. */
  divergencia: OpeningComparison | null;
  /** `true` quando a pessoa já escolheu para onde ir — os atalhos daqui. */
  onFinish: (comDestino?: boolean) => void;
  pending: boolean;
}) {
  const [, setLocation] = useLocation();
  const empresa = trpc.settings.company.useQuery();
  const organizacao = trpc.organization.overview.useQuery();
  const assinaturasLiberadas = useAssinaturasLiberadas();

  const conta = organizacao.data?.accounts[0];
  const categorias = organizacao.data?.categories.length ?? 0;
  const primeiroNome = nome.trim().split(" ")[0];

  /*
   * O cartão de teste é VISUAL.
   *
   * A data sai da criação da conta mais catorze dias, e o botão leva para a
   * página de planos que já existe. Nada acontece quando a data passa: não há
   * bloqueio, cobrança nem aviso, e nenhum outro ponto do sistema consulta este
   * número. A lógica de trial de verdade — o que trava, o que avisa, o que
   * cobra — entra quando ativarmos cobrança, e este cartão terá de ser
   * religado a ela. Enquanto isso ele é uma promessa de vitrine, e é melhor
   * que esteja escrito aqui do que descoberto por alguém no dia 15.
   */
  const fimDoTeste = criadoEm ? somaDias(criadoEm, DIAS_DE_TESTE) : null;

  const acoes: Array<{ titulo: string; apoio: string; destino: string }> = [
    {
      titulo: importados > 0 ? "Revisar a conciliação" : "Lançar a primeira movimentação",
      apoio: importados > 0
        ? "As sugestões automáticas emparelham o extrato com os lançamentos. Confirmar não zera a conciliação — sobram as movimentações sem par."
        : "Sem extrato importado, o painel começa vazio. O primeiro lançamento abre o caminho.",
      destino: importados > 0 ? "/conciliacao" : "/lancamentos",
    },
    {
      titulo: "Cadastrar as outras contas",
      apoio: "Cartão, gateway, caixa interno — cada conta com o seu saldo inicial e a data dele.",
      destino: "/organizacao",
    },
    {
      titulo: "Conferir a DRE do mês",
      apoio: "O resultado só fica correto depois de classificar as movimentações importadas.",
      destino: "/dre",
    },
  ];

  return (
    <>
      <p className="text-[14px] leading-relaxed text-[#28382E]">
        {primeiroNome ? `Tudo pronto, ${primeiroNome}. ` : "Tudo pronto. "}
        {importados > 0
          ? `O painel já abre com ${importados.toLocaleString("pt-BR")} ${importados === 1 ? "movimentação importada" : "movimentações importadas"} — nada de dados de exemplo.`
          : "O painel abre vazio, como prometido: nada de dados de exemplo."}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <CartaoResumo
          icone={BuildingIcon}
          rotulo="Empresa"
          valor={empresa.data?.legalName || "Não informada"}
          apoio={empresa.data?.taxId ? `CNPJ ${cnpjLegivel(empresa.data.taxId)}` : undefined}
        />
        <CartaoResumo
          icone={WalletIcon}
          rotulo="Conta cadastrada"
          valor={conta?.name ?? "Nenhuma ainda"}
          apoio={conta ? `saldo inicial ${formatMoney(conta.initialBalance)}` : "dá para cadastrar em Contas e categorias"}
        />
        <CartaoResumo
          icone={ArrowsUpDownIcon}
          rotulo="Movimentações"
          valor={importados > 0 ? `${importados.toLocaleString("pt-BR")} importadas` : "Nenhuma ainda"}
        />
        <CartaoResumo
          icone={TagIcon}
          rotulo="Categorias"
          valor={`${categorias} disponíveis`}
          apoio="o plano de contas padrão, pronto para ajustar"
        />
      </div>

      {divergencia && (
        /*
         * A rede que pega o erro depois.
         *
         * A pessoa manteve um saldo diferente do que o arquivo indica, e pode
         * estar certa — mas se não estiver, nada mais avisa. A conciliação do
         * fim do mês é onde a diferença aparece: foi assim que os R$ 13.498,12
         * da conta Efi Bank apareceram.
         */
        <div className="rounded-[14px] bg-[#FFF3E6] p-4 text-[13px] leading-relaxed text-[#8A4B00]">
          Você manteve <strong className="font-bold">{formatMoney(divergencia.informed)}</strong> como saldo inicial,
          e o extrato indicava <strong className="font-bold">{formatMoney(divergencia.derived)}</strong>. No fim do
          mês, confira em <strong className="font-semibold">Conciliação</strong> se a conta bate — é lá que uma
          diferença de saldo aparece.
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold uppercase tracking-[.1em] text-[#4C6355]">
          Três coisas que valem cinco minutos agora
        </span>
        {acoes.map(acao => (
          <button
            key={acao.destino}
            type="button"
            onClick={() => { onFinish(true); setLocation(acao.destino); }}
            className="flex items-center gap-3 rounded-[14px] border border-[#E3EBE6] p-4 text-left transition hover:border-[#12B85C] hover:bg-[#F1FBF6]"
          >
            <span className="min-w-0 flex-1">
              <strong className="block text-[13.5px]">{acao.titulo}</strong>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-[#4C6355]">{acao.apoio}</span>
            </span>
            <ChevronRightIcon size={16} className="shrink-0 text-[#8A968D]" />
          </button>
        ))}
      </div>

      <OnboardingLateral>
        {/* O cartão do teste é o convite para a tela de Planos: com o
            interruptor desligado ele some junto com ela, senão o primeiro
            acesso terminaria oferecendo um botão que não leva a lugar nenhum. */}
        {assinaturasLiberadas && fimDoTeste && (
          <div className="flex flex-col gap-2 rounded-[16px] bg-[#0B1F14] p-5 text-white">
            <strong className="text-[14px]">Seu teste vai até {dataCurta(fimDoTeste)}</strong>
            <span className="text-[12.5px] leading-relaxed text-[#C5DACE]">
              {DIAS_DE_TESTE} dias com tudo liberado, sem cartão. Depois disso você escolhe o plano —
              os dados continuam seus.
            </span>
            <button
              type="button"
              onClick={() => { onFinish(true); setLocation("/configuracoes?aba=planos"); }}
              className="mt-1.5 h-[42px] rounded-[12px] border border-[#1F4230] px-4 text-[13px] font-semibold text-[#C5DACE] transition hover:bg-[#1F3D2B]"
            >
              Ver os planos
            </button>
          </div>
        )}
      </OnboardingLateral>

      {/* O botão vai para a barra do rodapé, como nos outros passos. A dica
          "refazer em Configurações" já é a dica daquela barra. */}
      <OnboardingRodape>
        <button
          type="button"
          /* `() => onFinish()` e não `onFinish`: passar o handler direto
             entregaria o evento do clique como `comDestino`, e um MouseEvent é
             verdadeiro — o convite ao tour nunca apareceria. */
          onClick={() => onFinish()}
          disabled={pending}
          className="h-[46px] rounded-[12px] bg-[#12B85C] px-6 text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-50"
        >
          {pending ? "Abrindo…" : "Abrir o painel"}
        </button>
      </OnboardingRodape>
    </>
  );
}
