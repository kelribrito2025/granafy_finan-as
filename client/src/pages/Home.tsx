import { TransactionModal } from "@/components/TransactionModal";
import { today } from "@/lib/appFormat";
import { useVisaoGeral } from "@/pages/visaogeral/useVisaoGeral";
import { VisaoGeralPainel } from "@/pages/visaogeral/VisaoGeralPainel";

/**
 * A Visão geral.
 *
 * O desenho é o do design system Voltura (DESIGN.md na raiz) e é o mesmo nos
 * dois temas: quem troca são os tokens de cor, não a composição da tela.
 *
 * O modal de lançamento fica FORA do painel, e não por organização: as regras
 * do Voltura valem sob o escopo `.voltura`, e o modal dentro dele herdaria
 * cor de componentes que não são desta tela.
 */
export default function Home() {
  const vg = useVisaoGeral();

  return (
    <>
      <VisaoGeralPainel vg={vg} />

      {vg.novoLancamento && vg.user?.id && vg.user.activeCompanyId && (
        <TransactionModal
          defaultDate={today()}
          draftScope={{ userId: vg.user.id, companyId: vg.user.activeCompanyId }}
          pending={vg.createMutation.isPending}
          options={vg.organizationOptions}
          onManageOrganization={() => vg.setLocation("/organizacao")}
          onClose={() => vg.setNovoLancamento(false)}
          onSave={vg.salvarLancamento}
        />
      )}
    </>
  );
}
