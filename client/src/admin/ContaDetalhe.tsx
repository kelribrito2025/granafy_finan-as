import { trpc } from "@/lib/trpc";
import { Link, useParams } from "wouter";
import { AdminHeader, AdminShell, Avatar, Cartao, Kpi, Pilula, SEM_ASSINATURA, Traco, cnpj, dataCurta, dataHora, haQuanto } from "./comum";

const REGIME: Record<string, string> = { simples: "Simples Nacional", presumido: "Lucro Presumido", real: "Lucro Real", mei: "MEI", outro: "Outro" };

export default function AdminContaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const numero = Number(id);
  const consulta = trpc.admin.contas.detalhe.useQuery({ id: numero }, { enabled: Number.isInteger(numero) && numero > 0 });
  const d = consulta.data;

  if (consulta.isSuccess && !d) {
    return (
      <AdminShell>
        <AdminHeader titulo="Conta não encontrada" subtitulo={`Não existe empresa #${id}.`}>
          <Link href="/admin/contas" className="text-[13px] font-semibold text-[#0A7A42] hover:underline">← Contas</Link>
        </AdminHeader>
      </AdminShell>
    );
  }

  const nome = d ? d.empresa.tradeName || d.empresa.legalName || "Empresa sem nome" : "…";
  const e = d?.empresa;
  const g = d?.engajamento;
  const endereco = e ? [e.street && `${e.street}${e.streetNumber ? `, ${e.streetNumber}` : ""}`, e.complement, e.district, e.city && `${e.city}${e.state ? `/${e.state}` : ""}`].filter(Boolean).join(" · ") : "";

  return (
    <AdminShell>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/contas" className="text-[13px] font-semibold text-[#0A7A42] hover:underline">← Contas</Link>
      </div>
      <AdminHeader
        titulo={nome}
        subtitulo={d ? <>#{d.empresa.id} · CNPJ {e?.taxId ? cnpj(e.taxId) : "não informado"} · cadastrada em {dataCurta(e?.createdAt)}</> : "carregando…"}
      >
        {d && (d.empresa.isActive ? <Pilula tom="bom">Ativa</Pilula> : <Pilula tom="neutro">Arquivada</Pilula>)}
        <button type="button" disabled title="Fora desta fase: exige auditoria visível ao titular" className="h-10 cursor-not-allowed rounded-[12px] bg-white px-4 text-[13px] font-semibold text-[#8A968D] ring-1 ring-[#DFE6E1]">Entrar como cliente</button>
      </AdminHeader>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_392px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Cartao titulo="Cadastro">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Linha rotulo="Razão social" valor={e?.legalName || "—"} />
              <Linha rotulo="Nome fantasia" valor={e?.tradeName || "—"} />
              <Linha rotulo="Titular" valor={d?.titular ? `${d.titular.name ?? "sem nome"} · ${d.titular.email ?? ""}` : "—"} />
              <Linha rotulo="E-mail financeiro" valor={e?.financeEmail || "—"} />
              <Linha rotulo="Endereço" valor={endereco || "—"} />
              <Linha rotulo="Regime" valor={e ? REGIME[e.taxRegime] ?? e.taxRegime : "—"} />
              <Linha rotulo="Inscrição estadual" valor={e?.stateRegistration || "—"} />
              <Linha rotulo="Origem" valor={<Traco razao="sem fonte: a origem do cadastro não é registrada" />} />
            </dl>
          </Cartao>

          <Cartao titulo="Usuários" acao={<span className="text-[12px] text-[#8A968D]">1 login · papéis chegam com a tabela deles</span>}>
            {d?.titular ? (
              <div className="flex items-center gap-3 rounded-[14px] bg-[#F8FAF9] p-3.5">
                <Avatar nome={d.titular.name ?? d.titular.email ?? "?"} />
                <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-[13.5px] font-semibold">{d.titular.name ?? "sem nome"}</span><span className="truncate text-[12px] text-[#8A968D]">{d.titular.email}</span></span>
                <Pilula tom={d.titular.role === "admin" ? "aviso" : "neutro"}>{d.titular.role === "admin" ? "Admin do sistema" : "Titular"}</Pilula>
                <span className="text-[12.5px] text-[#4C6355]">{haQuanto(d.titular.lastSignedIn)}</span>
              </div>
            ) : <p className="text-[13px] text-[#8A968D]">Sem titular.</p>}
          </Cartao>

          <Cartao titulo="Histórico da conta" acao={<span className="text-[12px] text-[#8A968D]">o que o sistema registra: importações e fechamentos</span>}>
            {d && d.importacoes.length === 0 && <p className="text-[13px] text-[#8A968D]">Nenhuma importação de extrato ainda.</p>}
            <div className="flex flex-col gap-2">
              {(d?.importacoes ?? []).map(i => (
                <div key={i.id} className="flex items-start gap-3 text-[13px]">
                  <span className="w-[120px] shrink-0 text-[12px] text-[#8A968D]">{dataHora(i.createdAt)}</span>
                  <span className="min-w-0 flex-1">Importou <strong className="font-semibold">{i.fileName}</strong> ({i.format.toUpperCase()}) · {i.importedCount} {i.importedCount === 1 ? "movimentação" : "movimentações"}{i.duplicateCount > 0 ? ` · ${i.duplicateCount} duplicadas ignoradas` : ""}</span>
                </div>
              ))}
            </div>
          </Cartao>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Cartao titulo="Assinatura">
            <div className="grid grid-cols-2 gap-3">
              <Kpi rotulo="Plano" valor={null} razao={SEM_ASSINATURA} />
              <Kpi rotulo="Situação" valor={null} razao={SEM_ASSINATURA} />
            </div>
          </Cartao>

          <Cartao titulo="Engajamento">
            <div className="grid grid-cols-2 gap-3">
              <Kpi rotulo="Contas financeiras" valor={g?.contasFinanceiras ?? "…"} />
              <Kpi rotulo="Movimentações" valor={g ? g.lancamentos.toLocaleString("pt-BR") : "…"} apoio={g ? `${g.pendentes} pendentes` : undefined} />
              <Kpi rotulo="Conciliadas" valor={g ? g.conciliadas.toLocaleString("pt-BR") : "…"} apoio="pares confirmados" />
              <Kpi rotulo="Meses fechados" valor={g?.mesesFechados ?? "…"} apoio={g?.ultimoFechamento ? `último em ${dataCurta(g.ultimoFechamento)}` : "nenhum ainda"} />
              <Kpi rotulo="Acessos em 7 dias" valor={null} razao="sem fonte: só o último acesso é registrado" />
              <Kpi rotulo="Último acesso" valor={d?.titular ? haQuanto(d.titular.lastSignedIn) : "…"} />
            </div>
            {g && g.lancamentos > 0 && g.conciliadas === 0 && (
              <p className="rounded-[12px] bg-[#FFF9EB] p-3 text-[12.5px] leading-relaxed text-[#8A4B00]">Tem lançamentos mas não conciliou nada. Bom momento para um contato de ativação.</p>
            )}
          </Cartao>

          <Cartao titulo="Notas internas">
            <p className="text-[13px] text-[#8A968D]"><Traco razao="sem fonte" /> Chegam na próxima sentada, com tabela própria.</p>
          </Cartao>
        </div>
      </div>
    </AdminShell>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">{rotulo}</dt>
      <dd className="text-[13.5px] text-[#0B1F14]">{valor}</dd>
    </div>
  );
}
