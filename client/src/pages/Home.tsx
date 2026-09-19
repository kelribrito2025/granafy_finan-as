import { TransactionModal } from "@/components/TransactionModal";
import { useTheme } from "@/contexts/ThemeContext";
import { today } from "@/lib/appFormat";
import { useVisaoGeral } from "@/pages/visaogeral/useVisaoGeral";
import { VisaoGeralClara } from "@/pages/visaogeral/VisaoGeralClara";
import { VisaoGeralEscura } from "@/pages/visaogeral/VisaoGeralEscura";

/**
 * A Visão geral, nos dois temas.
 *
 * Claro é o painel de sempre; escuro é o design system Voltura (DESIGN.md na
 * raiz), que nasceu escuro e não tem versão clara. Quem escolhe é o tema já
 * resolvido — "automático" segue o sistema operacional, como em todo o resto.
 *
 * O modal de lançamento fica FORA dos dois desenhos, e não por organização: as
 * regras do Voltura valem sob o escopo `.voltura`, e o modal dentro dele
 * herdaria cor de componentes que não são desta tela.
 */
export default function Home() {
  const vg = useVisaoGeral();
  const { theme } = useTheme();

  return (
    <>
      {theme === "dark" ? <VisaoGeralEscura vg={vg} /> : <VisaoGeralClara vg={vg} />}

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
