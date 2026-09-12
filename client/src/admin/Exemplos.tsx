import { AdminHeader, AdminShell, Avatar, Cartao, EtiquetaDeExemplo, Kpi, Pilula } from "./comum";

/*
 * As telas de análise e de configuração, com dados de EXEMPLO.
 *
 * Os números são os do desenho e não vêm de lugar nenhum: a etiqueta no
 * topo de cada uma diz isso em voz alta, para ninguém tomar decisão em cima
 * deles. Quando a fonte existir (assinaturas, eventos de uso), cada bloco
 * troca o literal pela consulta — o desenho fica.
 */

export function AdminReceita() {
  const movimentos: Array<[string, string, "bom" | "ruim"]> = [["Contas novas", "+ R$ 5.340", "bom"], ["Upgrades", "+ R$ 2.800", "bom"], ["Reativações", "+ R$ 500", "bom"], ["Downgrades", "− R$ 300", "ruim"], ["Cancelamentos", "− R$ 1.160", "ruim"]];
  const canais: Array<[string, string, number]> = [["Busca orgânica", "R$ 28.640", 100], ["Indicação de contador", "R$ 19.320", 67], ["Google Ads", "R$ 15.180", 53], ["Indicação de cliente", "R$ 7.410", 26], ["Outros", "R$ 3.760", 13]];
  return (
    <AdminShell>
      <AdminHeader titulo="Receita" subtitulo="MRR R$ 74.310 · ARR R$ 891.720" />
      <EtiquetaDeExemplo />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi rotulo="MRR" valor="R$ 74.310" apoio="+ 6,0% vs. agosto" tom="escuro" />
        <Kpi rotulo="ARR" valor="R$ 891.720" apoio="projeção com o MRR atual" />
        <Kpi rotulo="Novo MRR" valor="R$ 5.340" apoio="24 contas novas" tom="bom" />
        <Kpi rotulo="MRR perdido" valor="R$ 1.160" apoio="6 cancelamentos" tom="ruim" />
        <Kpi rotulo="Crescimento líquido" valor="+ R$ 4.180" apoio="NRR de 104,2%" tom="bom" />
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_392px]">
        <Cartao titulo="De onde veio o MRR de setembro">
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex justify-between border-b border-[#F1F4F2] pb-2"><span className="text-[#4C6355]">MRR de agosto</span><strong>R$ 70.130</strong></div>
            {movimentos.map(([nome, valor, tom]) => (
              <div key={nome} className="flex justify-between"><span>{nome}</span><strong className={tom === "bom" ? "text-[#0A7A42]" : "text-[#B3261E]"}>{valor}</strong></div>
            ))}
            <div className="flex justify-between border-t border-[#F1F4F2] pt-2"><span className="text-[#4C6355]">MRR de setembro</span><strong>R$ 74.310</strong></div>
          </div>
        </Cartao>
        <div className="flex flex-col gap-5">
          <Cartao titulo="Unidade econômica">
            <div className="grid grid-cols-2 gap-3">
              <Kpi rotulo="LTV / CAC" valor="4,1×" /><Kpi rotulo="Payback" valor="5,3 meses" /><Kpi rotulo="LTV médio" valor="R$ 4.720" /><Kpi rotulo="CAC médio" valor="R$ 1.150" />
            </div>
          </Cartao>
          <Cartao titulo="Canal de aquisição">
            {canais.map(([nome, valor, pct]) => (
              <div key={nome} className="flex flex-col gap-1 text-[12.5px]">
                <div className="flex justify-between"><span>{nome}</span><strong>{valor}</strong></div>
                <span className="block h-2 overflow-hidden rounded bg-[#EDF2EE]"><span className="block h-full rounded bg-[#12B85C]" style={{ width: `${pct}%` }} /></span>
              </div>
            ))}
          </Cartao>
        </div>
      </div>
    </AdminShell>
  );
}

export function AdminRetencao() {
  const coortes: Array<[string, number, Array<number | null>]> = [
    ["Mar 2026", 38, [100, 92, 87, 84, 82, 79, 79]], ["Abr 2026", 44, [100, 93, 89, 86, 84, 82, null]], ["Mai 2026", 51, [100, 90, 86, 84, 81, null, null]],
    ["Jun 2026", 57, [100, 95, 91, 88, null, null, null]], ["Jul 2026", 63, [100, 94, 90, null, null, null, null]], ["Ago 2026", 71, [100, 96, null, null, null, null, null]], ["Set 2026", 24, [100, null, null, null, null, null, null]],
  ];
  const risco: Array<[string, string, string, string, string]> = [["Metalúrgica Ipiranga", "Controle", "nunca conciliou", "R$ 189", "21 dias"], ["Auto Peças Rio", "Essencial", "1 usuário, 0 lançamentos", "R$ 89", "38 dias"], ["Serralheria Kepler", "Essencial", "cobrança pendente", "R$ 89", "16 dias"], ["Logística Barra", "Controle", "uso caiu 40% em 30d", "R$ 189", "9 dias"]];
  const marcos: Array<[string, number]> = [["Concluiu o primeiro acesso", 92], ["Importou um extrato", 74], ["Conciliou 10+ itens", 51], ["Gerou um DRE", 38], ["Convidou outro usuário", 29]];
  const cor = (v: number) => (v >= 90 ? "bg-[#DFF6EA] text-[#0A7A42]" : v >= 70 ? "bg-[#F1FBF6] text-[#28382E]" : "bg-[#FDECEA] text-[#8E1F16]");
  return (
    <AdminShell>
      <AdminHeader titulo="Retenção" subtitulo="341 contas pagantes · churn de 1,8% no mês" />
      <EtiquetaDeExemplo />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi rotulo="Churn de contas" valor="1,8%" apoio="6 de 341 no mês" tom="escuro" /><Kpi rotulo="Churn de receita" valor="1,7%" apoio="R$ 1.160 perdidos" tom="ruim" /><Kpi rotulo="NRR" valor="104,2%" apoio="expansão cobre a perda" tom="bom" /><Kpi rotulo="Vida média" valor="21,6 meses" apoio="+1,4 mês vs. o trimestre" /><Kpi rotulo="Contas em risco" valor="23" apoio="sem acesso há 14+ dias" tom="ruim" />
      </section>
      <Cartao titulo="Retenção por coorte de entrada" acao={<span className="text-[12px] text-[#8A968D]">% das contas ainda pagantes ao fim de cada mês</span>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12.5px]">
            <thead><tr className="text-[11px] uppercase tracking-[.08em] text-[#8A968D]"><th className="pb-2 pr-3 font-semibold">Coorte</th><th className="pb-2 pr-3 font-semibold">Contas</th>{["M0", "M1", "M2", "M3", "M4", "M5", "M6"].map(m => <th key={m} className="pb-2 text-center font-semibold">{m}</th>)}</tr></thead>
            <tbody>{coortes.map(([nome, n, meses]) => (
              <tr key={nome} className="border-t border-[#F1F4F2]"><td className="py-2 font-semibold">{nome}</td><td className="py-2 text-[#4C6355]">{n}</td>{meses.map((v, i) => <td key={i} className="py-1.5 px-1 text-center">{v === null ? <span className="text-[#B9C7BE]">—</span> : <span className={`inline-block w-full rounded-[7px] py-1 font-semibold ${cor(v)}`}>{v}%</span>}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      </Cartao>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_392px]">
        <Cartao titulo="Contas em risco" acao={<span className="text-[12px] text-[#8A968D]">R$ 3.290 de MRR exposto</span>}>
          <table className="w-full text-left text-[13px]">
            <thead><tr className="text-[11px] uppercase tracking-[.08em] text-[#8A968D]"><th className="pb-2 pr-3 font-semibold">Empresa</th><th className="pb-2 pr-3 font-semibold">Plano</th><th className="pb-2 pr-3 font-semibold">Sinal de risco</th><th className="pb-2 pr-3 text-right font-semibold">MRR</th><th className="pb-2 pr-3 text-right font-semibold">Sem acesso</th></tr></thead>
            <tbody>{risco.map(([nome, plano, sinal, mrr, dias]) => (
              <tr key={nome} className="border-t border-[#F1F4F2]"><td className="py-2.5 pr-3"><span className="flex items-center gap-2.5"><Avatar nome={nome} /><span className="font-semibold">{nome}</span></span></td><td className="py-2.5 pr-3">{plano}</td><td className="py-2.5 pr-3"><Pilula tom="ruim">{sinal}</Pilula></td><td className="py-2.5 pr-3 text-right">{mrr}</td><td className="py-2.5 text-right text-[#4C6355]">{dias}</td></tr>
            ))}</tbody>
          </table>
        </Cartao>
        <Cartao titulo="Marcos de ativação">
          {marcos.map(([nome, pct]) => (
            <div key={nome} className="flex flex-col gap-1 text-[12.5px]"><div className="flex justify-between"><span>{nome}</span><strong>{pct}%</strong></div><span className="block h-2 overflow-hidden rounded bg-[#EDF2EE]"><span className="block h-full rounded bg-[#12B85C]" style={{ width: `${pct}%` }} /></span></div>
          ))}
        </Cartao>
      </div>
    </AdminShell>
  );
}
