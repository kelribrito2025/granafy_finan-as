import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link } from "wouter";
import { AdminHeader, AdminShell, Avatar, Busca, Cartao, Pilula, SEM_ASSINATURA, Segmentos, Traco, cnpj, haQuanto } from "./comum";
import { useMostrarAssinaturas } from "./preferencias";

type Situacao = "todas" | "ativas" | "arquivadas";

export default function AdminContas() {
  /* As colunas "Plano" e "MRR" somem junto com a área de Assinaturas. */
  const assinaturas = useMostrarAssinaturas();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("todas");
  const lista = trpc.admin.contas.listar.useQuery({ busca, situacao }, { placeholderData: anterior => anterior });
  const d = lista.data;

  return (
    <AdminShell>
      <AdminHeader titulo="Contas" subtitulo={d ? `${d.total} ${d.total === 1 ? "empresa cadastrada" : "empresas cadastradas"} · ${d.ativas} ativas` : "carregando…"}>
        <Busca valor={busca} aoMudar={setBusca} placeholder="Buscar por nome, CNPJ ou e-mail do titular" />
      </AdminHeader>

      <Segmentos
        valor={situacao}
        aoMudar={setSituacao}
        opcoes={[["todas", `Todas${d ? ` ${d.total}` : ""}`], ["ativas", `Ativas${d ? ` ${d.ativas}` : ""}`], ["arquivadas", `Arquivadas${d ? ` ${d.total - d.ativas}` : ""}`]]}
      />

      <Cartao>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-[.08em] text-[#8A968D]">
                <th className="pb-2 pr-3 font-semibold">Empresa</th><th className="pb-2 pr-3 font-semibold">CNPJ</th>{assinaturas && <th className="pb-2 pr-3 font-semibold">Plano</th>}
                <th className="pb-2 pr-3 text-right font-semibold">Usu.</th><th className="pb-2 pr-3 text-right font-semibold">Contas</th><th className="pb-2 pr-3 text-right font-semibold">Lançamentos</th>
                <th className="pb-2 pr-3 font-semibold">Situação</th>{assinaturas && <th className="pb-2 pr-3 text-right font-semibold">MRR</th>}<th className="pb-2 pr-3 text-right font-semibold">Último acesso</th>
              </tr>
            </thead>
            <tbody>
              {(d?.itens ?? []).map(c => {
                const nome = c.tradeName || c.legalName || "Empresa sem nome";
                return (
                  <tr key={c.id} className="border-t border-[#F1F4F2] transition hover:bg-[#F8FAF9]">
                    <td className="py-2.5 pr-3">
                      <Link href={`/admin/contas/${c.id}`} className="flex items-center gap-3 hover:underline">
                        <Avatar nome={nome} />
                        <span className="flex min-w-0 flex-col"><span className="truncate text-[13.5px] font-semibold">{nome}</span><span className="truncate text-[12px] text-[#8A968D]">#{c.id} · {c.titular || c.email}</span></span>
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-[12.5px] text-[#4C6355]">{c.taxId ? cnpj(c.taxId) : <Traco razao="sem CNPJ no cadastro" />}</td>
                    {assinaturas && <td className="py-2.5 pr-3 text-[13px]"><Traco razao={SEM_ASSINATURA} /></td>}
                    <td className="py-2.5 pr-3 text-right text-[13px]">{c.usuarios}</td>
                    <td className="py-2.5 pr-3 text-right text-[13px]">{c.contasFinanceiras}</td>
                    <td className="py-2.5 pr-3 text-right text-[13px]">{c.lancamentos.toLocaleString("pt-BR")}</td>
                    <td className="py-2.5 pr-3">{c.isActive ? <Pilula tom="bom">Ativa</Pilula> : <Pilula tom="neutro">Arquivada</Pilula>}</td>
                    {assinaturas && <td className="py-2.5 pr-3 text-right text-[13px]"><Traco razao={SEM_ASSINATURA} /></td>}
                    <td className="py-2.5 text-right text-[13px] text-[#4C6355]">{haQuanto(c.ultimoAcesso)}</td>
                  </tr>
                );
              })}
              {d && d.itens.length === 0 && <tr><td colSpan={9} className="py-10 text-center text-[13px] text-[#8A968D]">Nenhuma conta corresponde à busca.</td></tr>}
            </tbody>
          </table>
        </div>
        {d && <p className="text-[12px] text-[#8A968D]">{d.itens.length} de {d.total} contas{assinaturas && <> · MRR das listadas: <Traco razao={SEM_ASSINATURA} /></>}</p>}
      </Cartao>
    </AdminShell>
  );
}
