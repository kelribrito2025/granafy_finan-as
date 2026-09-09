import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

const REGIMES = [
  ["simples", "Simples Nacional"],
  ["presumido", "Lucro Presumido"],
  ["real", "Lucro Real"],
  ["mei", "MEI"],
  ["outro", "Outro"],
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
  renderFooter: (props: { onContinue: () => void; pending: boolean; label: string }) => React.ReactNode;
}) {
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [taxRegime, setTaxRegime] = useState<(typeof REGIMES)[number][0]>("simples");
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

  return (
    <>
      <label className="block">
        <span className={rotulo}>Razão social</span>
        <input value={legalName} onChange={e => setLegalName(e.target.value)} maxLength={180} placeholder="Número Virtual LTDA" className={campo} />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={rotulo}>Nome fantasia</span>
          <input value={tradeName} onChange={e => setTradeName(e.target.value)} maxLength={180} placeholder="Como todo mundo chama" className={campo} />
        </label>
        <label className="block">
          <span className={rotulo}>CNPJ</span>
          <input value={taxId} onChange={e => setTaxId(mascaraCnpj(e.target.value))} inputMode="numeric" placeholder="00.000.000/0000-00" className={campo} />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={rotulo}>O exercício começa em</span>
          <select value={fiscalMonth} onChange={e => setFiscalMonth(Number(e.target.value))} className={campo}>
            {MESES.map((mes, indice) => <option key={mes} value={indice + 1}>{mes}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={rotulo}>Regime tributário</span>
          <select value={taxRegime} onChange={e => setTaxRegime(e.target.value as typeof taxRegime)} className={campo}>
            {REGIMES.map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
          </select>
        </label>
      </div>

      {/* A nota do modelo, e ela é literal: o regime não entra em conta nenhuma. */}
      <p className="rounded-[14px] bg-[#F1FBF6] p-4 text-[12.5px] leading-relaxed text-[#0A7A42]">
        O regime tributário só rotula relatórios. O GranaFy <strong className="font-semibold">não calcula impostos</strong> — se
        você não tiver certeza agora, escolha depois em Configurações.
      </p>

      {renderFooter({ onContinue: continuar, pending, label: "Continuar" })}
    </>
  );
}
