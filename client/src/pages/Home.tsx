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
 * O modal de lançamento fica fora do painel e ganha o próprio embrulho
 * `.voltura`: ele é `fixed`, então não precisa morar dentro da tela para
 * aparecer sobre ela, e o embrulho é o que lhe dá os tokens sem que as
 * regras do painel alcancem a marcação dele.
 */
export default function Home() {
  const vg = useVisaoGeral();

  return (
    <>
      <VisaoGeralPainel vg={vg} />

      {vg.novoLancamento && vg.user?.id && vg.user.activeCompanyId && (
        <div className="voltura vg-portal">
        <TransactionModal
          defaultDate={today()}
          draftScope={{ userId: vg.user.id, companyId: vg.user.activeCompanyId }}
          pending={vg.createMutation.isPending}
          options={vg.organizationOptions}
          onManageOrganization={() => vg.setLocation("/organizacao")}
          onClose={() => vg.setNovoLancamento(false)}
          onSave={vg.salvarLancamento}
        />
        </div>
      )}
    </>
  );
}
