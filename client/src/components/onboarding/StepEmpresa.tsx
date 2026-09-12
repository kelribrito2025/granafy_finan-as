import { ChevronRightIcon, LockIcon, ReportIcon } from "@/components/IconlyIcons";
import { trpc } from "@/lib/trpc";
import { useRef, useState } from "react";
import { toast } from "sonner";

/*
 * Os cinco regimes, com a frase que distingue um do outro.
 *
 * Em cartão e não em lista suspensa porque a escolha exige saber o que cada um
 * é — e quem está abrindo a empresa agora costuma não saber. Um `select`
 * esconde as opções atrás de um clique e não tem onde caber a explicação.
 */
const REGIMES = [
  { valor: "simples", nome: "Simples Nacional", frase: "Anexo único de impostos sobre o faturamento." },
  { valor: "presumido", nome: "Lucro Presumido", frase: "Base de cálculo fixada por percentual da receita." },
  { valor: "real", nome: "Lucro Real", frase: "Impostos sobre o resultado apurado no período." },
  { valor: "mei", nome: "MEI", frase: "Microempreendedor individual, com limite anual de receita." },
  { valor: "outro", nome: "Outro", frase: "Nenhum dos anteriores, ou ainda não definido." },
] as const;

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const campo = "h-[46px] w-full rounded-[12px] border border-[#E3EBE6] bg-white px-3.5 text-[14px] text-[#0B1F14] outline-none transition focus:border-[#12B85C] placeholder:text-[#8A968D]";
const rotulo = "mb-1.5 block text-[12px] font-semibold text-[#4C6355]";

/** "12345678000190" → "12.345.678/0001-90", conforme se digita. */
function mascaraCnpj(valor: string) {
  const digitos = valor.replace(/\D/g, "").slice(0, 14);
  return digitos
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function StepEmpresa({ onDone, renderFooter }: {
  onDone: () => void;
  renderFooter: (props: { onContinue: () => void; pending: boolean; label: string; disabled?: boolean }) => React.ReactNode;
}) {
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [taxRegime, setTaxRegime] = useState<(typeof REGIMES)[number]["valor"]>("simples");
  const [fiscalMonth, setFiscalMonth] = useState(1);

  const utils = trpc.useUtils();
  const preferences = trpc.settings.preferences.useQuery();
  const salvarEmpresa = trpc.settings.saveCompany.useMutation();
  const salvarPreferencias = trpc.settings.savePreferences.useMutation();

  const continuar = async () => {
    if (legalName.trim().length < 2) return toast.info("Informe a razão social.");
    try {
      await salvarEmpresa.mutateAsync({
        legalName: legalName.trim(),
        tradeName: tradeName.trim(),
        taxId: taxId.replace(/\D/g, ""),
        taxRegime,
        stateRegistration: "",
        financeEmail: "",
        zipCode: "", street: "", streetNumber: "", complement: "",
        district: "", city: "", state: "", country: "Brasil",
      });
      /*
       * O início do exercício mora nas preferências, não no cadastro da
       * empresa — é o que a DRE e o balanço usam para saber onde o ano começa.
       */
      if (preferences.data && preferences.data.fiscalYearStartMonth !== fiscalMonth) {
        await salvarPreferencias.mutateAsync({ ...preferences.data, fiscalYearStartMonth: fiscalMonth });
      }
      await utils.settings.company.invalidate();
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar");
    }
  };

  const pending = salvarEmpresa.isPending || salvarPreferencias.isPending;

  /*
   * Os regimes num carrossel: três à vista, os outros dois à direita.
   *
   * Cinco cartões numa grade quebravam em 3 + 2 e deixavam um buraco. Em
   * fila, com encaixe por rolagem, cada cartão ocupa um terço da largura e a
   * fila anda um cartão por clique nas setas — ou pelo arraste, no celular.
   */
  const trilho = useRef<HTMLDivElement>(null);
  const rolar = (sentido: 1 | -1) => {
    const fila = trilho.current;
    if (!fila) return;
    const cartao = fila.firstElementChild as HTMLElement | null;
    const passo = cartao ? cartao.offsetWidth + 12 : fila.clientWidth / 3;
    fila.scrollBy({ left: sentido * passo, behavior: "smooth" });
  };

  return (
    <>
      {/*
        Dois pares, e não um campo largo seguido de dois estreitos.

        Os dois nomes da empresa ficam lado a lado porque é assim que se
        confere um contra o outro — quem digita a razão social já sabe o
        fantasia. Embaixo sobra o par CNPJ + exercício, que enche a linha que
        antes ficava metade vazia.
      */}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={rotulo}>Razão social</span>
          <input value={legalName} onChange={e => setLegalName(e.target.value)} maxLength={180} placeholder="Número Virtual LTDA" className={campo} />
        </label>
        <label className="block">
          <span className={rotulo}>Nome fantasia</span>
          <input value={tradeName} onChange={e => setTradeName(e.target.value)} maxLength={180} placeholder="Como todo mundo chama" className={campo} />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={rotulo}>CNPJ</span>
          <input value={taxId} onChange={e => setTaxId(mascaraCnpj(e.target.value))} inputMode="numeric" placeholder="00.000.000/0000-00" className={campo} />
        </label>
        <label className="block">
          <span className={rotulo}>O exercício começa em</span>
          <select value={fiscalMonth} onChange={e => setFiscalMonth(Number(e.target.value))} className={campo}>
            {MESES.map((mes, indice) => <option key={mes} value={indice + 1}>{mes}</option>)}
          </select>
        </label>
      </div>

      {/* `div role=group` e não `fieldset`: o rótulo divide a linha com as setas
          do carrossel, e `legend` só funciona como primeiro filho do fieldset. */}
      <div role="group" aria-label="Regime tributário" className="block">
        <div className="flex items-center gap-3">
          <span className={rotulo}>
            Regime tributário
            <span className="ml-1.5 font-normal text-[#8A968D]">· opcional, usado só na apresentação dos relatórios</span>
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" aria-label="Regimes anteriores" onClick={() => rolar(-1)} className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F1F4F2] text-[#4C6355] transition hover:bg-[#E3EBE6]">
              <ChevronRightIcon size={14} className="rotate-180" />
            </button>
            <button type="button" aria-label="Próximos regimes" onClick={() => rolar(1)} className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F1F4F2] text-[#4C6355] transition hover:bg-[#E3EBE6]">
              <ChevronRightIcon size={14} />
            </button>
          </div>
        </div>
        <div ref={trilho} className="mt-1 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {REGIMES.map(regime => {
            const escolhido = taxRegime === regime.valor;
            return (
              <button
                key={regime.valor}
                type="button"
                onClick={() => setTaxRegime(regime.valor)}
                aria-pressed={escolhido}
                className={`flex w-[calc((100%-24px)/3)] flex-none snap-start flex-col items-start gap-1.5 rounded-[14px] border-[1.5px] p-4 text-left transition sm:w-[calc((100%-24px)/3)] max-sm:w-[78%] ${
                  escolhido
                    ? "border-[#12B85C] bg-[#F1FBF6]"
                    : "border-[#E3EBE6] hover:border-[#B9C7BE] hover:bg-[#F8FAF9]"
                }`}
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${escolhido ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#F1F4F2] text-[#4C6355]"}`}>
                  <ReportIcon size={16} />
                </span>
                <strong className={`text-[13.5px] ${escolhido ? "text-[#0A7A42]" : "text-[#0B1F14]"}`}>{regime.nome}</strong>
                <span className="text-[12px] leading-relaxed text-[#4C6355]">{regime.frase}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* A nota do modelo, e ela é literal: o regime não entra em conta nenhuma. */}
      <p className="flex items-start gap-2.5 rounded-[14px] bg-[#F1FBF6] p-4 text-[12.5px] leading-relaxed text-[#0A7A42]">
        <LockIcon size={15} className="mt-0.5 shrink-0" />
        <span>
          Tudo isso pode ser alterado depois em Configurações → Empresa. O regime só rotula os
          relatórios: o GranaFy <strong className="font-semibold">não calcula impostos</strong>.
        </span>
      </p>

      {renderFooter({ onContinue: continuar, pending, label: "Continuar" })}
    </>
  );
}
