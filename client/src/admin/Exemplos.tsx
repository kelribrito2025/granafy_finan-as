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

export function AdminConfiguracoes() {
  const planos: Array<[string, number, number]> = [["Essencial", 15, 210], ["Controle", 27, 220], ["Grupo", 47, 36]];
  const regras: Array<[string, string, boolean]> = [["Teste grátis de 14 dias", "Todo cadastro novo entra no plano Controle liberado, sem cartão.", true], ["Pedir cartão no cadastro", "Aumenta a conversão do teste, reduz o volume de cadastros.", false], ["Estender teste automaticamente", "+7 dias para quem importou extrato mas não conciliou.", false], ["Suspender após 3 recusas", "A conta fica em leitura até o pagamento ser regularizado.", true]];
  const equipe: Array<[string, string, string]> = [["Kelri", "kelri@admin.com", "Superadmin"], ["Ambiente Dev", "dev@teste.com", "Superadmin"]];
  return (
    <AdminShell>
      <AdminHeader titulo="Configurações" subtitulo="planos, regras do teste, equipe e integrações" />
      <EtiquetaDeExemplo texto="Dados de exemplo · os preços são os reais (15/27/47); contagens, regras e integrações ainda não têm fonte" />
      <div className="grid gap-5 xl:grid-cols-2">
        <Cartao titulo="Planos e preços" acao={<span className="text-[12px] text-[#8A968D]">alterações valem para novas assinaturas</span>}>
          {planos.map(([nome, preco, contas]) => (
            <div key={nome} className="flex items-center gap-3 rounded-[14px] border border-[#E3EBE6] p-3.5">
              <span className="flex min-w-0 flex-1 flex-col"><strong className="text-[14px]">{nome}</strong><span className="text-[12px] text-[#8A968D]">{contas} contas · anual −17%</span></span>
              <strong className="text-[20px] tracking-[-.02em]">R$ {preco}<span className="text-[12px] font-normal text-[#8A968D]">/mês</span></strong>
            </div>
          ))}
        </Cartao>
        <Cartao titulo="Regras do teste">
          {regras.map(([nome, texto, ligado]) => (
            <div key={nome} className="flex items-start gap-3 rounded-[14px] bg-[#F8FAF9] p-3.5">
              <span className={`mt-0.5 h-5 w-9 shrink-0 rounded-full ${ligado ? "bg-[#12B85C]" : "bg-[#C9D4CD]"} relative`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${ligado ? "right-0.5" : "left-0.5"}`} /></span>
              <span className="flex flex-col gap-0.5"><strong className="text-[13.5px]">{nome}</strong><span className="text-[12.5px] text-[#4C6355]">{texto}</span></span>
            </div>
          ))}
        </Cartao>
        <Cartao titulo="Equipe do admin" acao={<span className="text-[12px] text-[#8A968D]">quem tem role = admin hoje</span>}>
          {equipe.map(([nome, email, papel]) => (
            <div key={email} className="flex items-center gap-3"><Avatar nome={nome} tom="escuro" /><span className="flex min-w-0 flex-1 flex-col"><strong className="text-[13.5px]">{nome}</strong><span className="text-[12px] text-[#8A968D]">{email}</span></span><Pilula tom="aviso">{papel}</Pilula></div>
          ))}
          <p className="text-[12px] text-[#8A968D]">Todo "entrar como cliente" ficará registrado na auditoria da conta e visível ao titular — fora desta fase.</p>
        </Cartao>
        <Cartao titulo="Integrações">
          {[["Envio de e-mail", "Resend · transacionais", "Conectado", "bom"], ["Gateway de pagamento", "cobrança recorrente e retentativas", "Não configurado", "neutro"], ["Emissão de nota fiscal", "ainda emitindo manualmente", "Não configurado", "neutro"], ["Analytics de produto", "marcos de ativação e coortes", "Não configurado", "neutro"]].map(([nome, texto, situacao, tom]) => (
            <div key={nome} className="flex items-center gap-3 rounded-[14px] border border-[#E3EBE6] p-3.5"><span className="flex min-w-0 flex-1 flex-col"><strong className="text-[13.5px]">{nome}</strong><span className="text-[12px] text-[#8A968D]">{texto}</span></span><Pilula tom={tom as "bom" | "neutro"}>{situacao}</Pilula></div>
          ))}
        </Cartao>
      </div>
    </AdminShell>
  );
}
