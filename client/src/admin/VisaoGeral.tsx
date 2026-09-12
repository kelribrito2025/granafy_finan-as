import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { AdminHeader, AdminShell, Avatar, Cartao, Kpi, Pilula, SEM_ASSINATURA, Traco, haQuanto } from "./comum";

export default function AdminVisaoGeral() {
  const resumo = trpc.admin.resumo.useQuery();
  const r = resumo.data;
  const atualizado = r ? new Date(r.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <AdminShell>
      <AdminHeader titulo="Visão geral" subtitulo={r ? `${r.empresas.total} ${r.empresas.total === 1 ? "conta" : "contas"} · atualizado às ${atualizado}` : "carregando…"} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi rotulo="MRR" valor={null} razao={SEM_ASSINATURA} tom="escuro" />
        <Kpi rotulo="Contas cadastradas" valor={r?.empresas.total ?? "…"} apoio={r ? `${r.empresas.ativas} ativas` : undefined} />
        <Kpi rotulo="Usuários" valor={r?.usuarios.total ?? "…"} apoio={r ? `${r.usuarios.ativas7d} entraram nos últimos 7 dias` : undefined} tom="bom" />
        <Kpi rotulo="Novos em 30 dias" valor={r?.usuarios.novas30d ?? "…"} apoio="cadastros no período" />
        <Kpi rotulo="Churn no mês" valor={null} razao={SEM_ASSINATURA} />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_392px]">
        <Cartao titulo="Últimos cadastros" acao={<Link href="/admin/contas" className="text-[12.5px] font-semibold text-[#0A7A42] hover:underline">Ver todas as contas</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left">
              <thead><tr className="text-[11px] uppercase tracking-[.08em] text-[#8A968D]"><th className="pb-2 pr-3 font-semibold">Empresa</th><th className="pb-2 pr-3 font-semibold">Plano</th><th className="pb-2 pr-3 font-semibold">Situação</th><th className="pb-2 pr-3 text-right font-semibold">Cadastro</th></tr></thead>
              <tbody>
                {(r?.ultimosCadastros ?? []).map(c => {
                  const nome = c.tradeName || c.legalName || "Empresa sem nome";
                  return (
                    <tr key={c.id} className="border-t border-[#F1F4F2]">
                      <td className="py-2.5 pr-3">
                        <Link href={`/admin/contas/${c.id}`} className="flex items-center gap-3 hover:underline">
                          <Avatar nome={nome} />
                          <span className="flex min-w-0 flex-col"><span className="truncate text-[13.5px] font-semibold">{nome}</span><span className="truncate text-[12px] text-[#8A968D]">{c.titular || c.email}</span></span>
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3 text-[13px]"><Traco razao={SEM_ASSINATURA} /></td>
                      <td className="py-2.5 pr-3">{c.isActive ? <Pilula tom="bom">Ativa</Pilula> : <Pilula tom="neutro">Arquivada</Pilula>}</td>
                      <td className="py-2.5 text-right text-[13px] text-[#4C6355]">{haQuanto(c.createdAt)}</td>
                    </tr>
                  );
                })}
                {r && r.ultimosCadastros.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-[13px] text-[#8A968D]">Nenhuma conta cadastrada.</td></tr>}
              </tbody>
            </table>
          </div>
        </Cartao>

        <Cartao titulo="Precisa de atenção">
          <div className="flex flex-col gap-2">
            <Atencao tom="aviso" titulo={r ? `${r.nuncaImportaram} ${r.nuncaImportaram === 1 ? "conta nunca importou" : "contas nunca importaram"} extrato` : "…"} detalhe="cadastradas há mais de 5 dias" href="/admin/contas" />
            <Atencao tom="ruim" titulo={r ? `${r.usuarios.semAcesso14d} ${r.usuarios.semAcesso14d === 1 ? "usuário sem acesso" : "usuários sem acesso"} há 14 dias` : "…"} detalhe="risco de churn silencioso" href="/admin/usuarios" />
            <Atencao tom="neutro" titulo="Pagamentos recusados" detalhe={SEM_ASSINATURA} />
            <Atencao tom="neutro" titulo="Testes expirando" detalhe={SEM_ASSINATURA} />
          </div>
        </Cartao>
      </div>
    </AdminShell>
  );
}

function Atencao({ tom, titulo, detalhe, href }: { tom: "aviso" | "ruim" | "neutro"; titulo: string; detalhe: string; href?: string }) {
  const fundo = { aviso: "bg-[#FFF9EB]", ruim: "bg-[#FDECEA]", neutro: "bg-[#F8FAF9]" }[tom];
  const cor = { aviso: "text-[#8A4B00]", ruim: "text-[#8E1F16]", neutro: "text-[#8A968D]" }[tom];
  const conteudo = (
    <>
      <span className="flex min-w-0 flex-1 flex-col"><span className={`text-[13px] font-bold ${tom === "neutro" ? "text-[#4C6355]" : "text-[#0B1F14]"}`}>{titulo}</span><span className={`text-[12px] ${cor}`}>{detalhe}</span></span>
      {href && <span className="text-[12px] font-bold text-[#0A7A42]">Ver</span>}
    </>
  );
  const classe = `flex items-center gap-3 rounded-[14px] p-3.5 ${fundo}`;
  return href ? <Link href={href} className={`${classe} transition hover:brightness-[.98]`}>{conteudo}</Link> : <div className={classe}>{conteudo}</div>;
}
