import { AdminHeader, AdminShell, Cartao, Kpi, SEM_ASSINATURA } from "./comum";

/*
 * Assinaturas ainda não têm fonte: não há plano, teste nem cobrança no banco.
 * A tela existe no lugar dela, com cada número em traço e a razão, e vira de
 * verdade na próxima sentada, com a tabela de assinaturas.
 */
export default function AdminAssinaturas() {
  return (
    <AdminShell>
      <AdminHeader titulo="Assinaturas" subtitulo="sem fonte ainda · a tabela de assinaturas chega na próxima sentada" />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi rotulo="Faturado no mês" valor={null} razao="sem fonte: não há faturas" tom="escuro" />
        <Kpi rotulo="Em aberto" valor={null} razao={SEM_ASSINATURA} />
        <Kpi rotulo="Upgrades" valor={null} razao={SEM_ASSINATURA} />
        <Kpi rotulo="Downgrades" valor={null} razao={SEM_ASSINATURA} />
        <Kpi rotulo="Recuperação" valor={null} razao="sem fonte: não há cobrança recorrente" />
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_392px]">
        <Cartao titulo="Cobranças com problema">
          <p className="py-8 text-center text-[13px] text-[#8A968D]">Nenhuma cobrança existe ainda. Quando a tabela de assinaturas entrar, recusadas e pendentes aparecem aqui.</p>
        </Cartao>
        <div className="flex flex-col gap-5">
          <Cartao titulo="MRR por plano">
            {["Essencial · R$ 15", "Controle · R$ 27", "Grupo · R$ 47"].map(p => (
              <div key={p} className="flex items-center justify-between text-[13px]"><span>{p}</span><span className="text-[#B9C7BE]" title={SEM_ASSINATURA}>—</span></div>
            ))}
          </Cartao>
          <Cartao titulo="Ciclo de cobrança">
            <div className="flex items-center justify-between text-[13px]"><span>Mensal</span><span className="text-[#B9C7BE]" title={SEM_ASSINATURA}>—</span></div>
            <div className="flex items-center justify-between text-[13px]"><span>Anual</span><span className="text-[#B9C7BE]" title={SEM_ASSINATURA}>—</span></div>
          </Cartao>
        </div>
      </div>
    </AdminShell>
  );
}
