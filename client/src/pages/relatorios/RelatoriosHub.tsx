import { ArrowUpIcon, BuildingIcon, ChartIcon, ChevronRightIcon, DownloadIcon, ReportsIcon, TagIcon, TrendUpIcon, WalletIcon, type IconlyIcon } from "@/components/IconlyIcons";
import { CarregandoRelatorio, ErroDoRelatorio, EstadoVazioRelatorio, IlustracaoBarras, RelatorioShell, dinheiro } from "@/components/relatorios/RelatorioShell";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { totais, useRelatorioDeFluxo } from "@/lib/relatorios";
import { CATEGORIAS_MOCK, CENTROS_MOCK, CONTAS_MOVIMENTO_MOCK } from "@/lib/relatoriosMock";
import { toast } from "@/lib/toast";
import type { ReactNode } from "react";
import { useLocation } from "wouter";

/*
 * Relatórios — o hub. Seis cartões, um por relatório, com o número-resumo dos
 * últimos seis meses; embaixo, a faixa do pacote em PDF. Sem nenhum lançamento
 * pago, os cartões ficam apagados e o passo a passo aparece no lugar.
 *
 * Os três primeiros já leem do banco. Os três últimos (categoria, centro de
 * custo e entradas vs. saídas por conta) mostram amostra até o back deles.
 */

function Cartao({ href, icone: Icone, titulo, texto, kicker, valor, tom, previa, vazio }: {
  href: string; icone: IconlyIcon; titulo: string; texto: string; kicker: string; valor: string; tom?: "positivo" | "negativo"; previa: ReactNode; vazio: boolean;
}) {
  const [, setLocation] = useLocation();
  if (vazio) {
    return (
      <article className="flex flex-col gap-[18px] rounded-[20px] bg-white p-[26px] opacity-60 ring-1 ring-[#E1E8E3]">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#F1F4F2] text-[#B3BFB7]"><Icone size={24} /></span>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-[17px] font-bold tracking-[-.01em] text-[#8A968D]">{titulo}</h2>
          <p className="text-[13px] leading-relaxed text-[#8A968D]">{texto}</p>
        </div>
        <div className="mt-auto flex flex-col gap-2 border-t border-[#F1F4F2] pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#B3BFB7]">{kicker}</span>
          <span className="text-[20px] font-bold text-[#B3BFB7]">—</span>
          <span className="mt-2 flex h-10 items-center justify-center rounded-[11px] bg-[#F1F4F2] text-[13px] font-semibold text-[#8A968D]">Sem dados para exibir</span>
        </div>
      </article>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setLocation(href)}
      className="group flex flex-col gap-[18px] rounded-[20px] bg-white p-[26px] text-left ring-1 ring-[#E1E8E3] transition hover:-translate-y-[3px] hover:shadow-[0_14px_30px_rgba(11,31,20,.10)]"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#DFF6EA] text-[#0A7A42]"><Icone size={24} /></span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[17px] font-bold tracking-[-.01em]">{titulo}</h2>
        <p className="text-[13px] leading-relaxed text-[#4C6355]">{texto}</p>
      </div>
      <div className="flex min-h-[56px] items-end justify-center py-1.5">{previa}</div>
      <div className="mt-auto flex flex-col gap-2 border-t border-[#F1F4F2] pt-4">
        <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">{kicker}</span>
        <span className={`text-[20px] font-bold ${tom === "positivo" ? "text-[#0A7A42]" : tom === "negativo" ? "text-[#B3261E]" : "text-[#0B1F14]"}`}>{valor}</span>
        <span className="mt-2 flex h-10 items-center justify-center gap-2 rounded-[11px] bg-[#F1FBF6] text-[13px] font-bold text-[#0A7A42] transition group-hover:bg-[#12B85C] group-hover:text-white">
          Abrir relatório <ChevronRightIcon size={15} />
        </span>
      </div>
    </button>
  );
}

export default function RelatoriosHub() {
  const [, setLocation] = useLocation();
  const podeEscrever = !useSomenteLeitura();
  const { dados, carregando, erro, recarregar } = useRelatorioDeFluxo();
  const vazio = dados ? !dados.temLancamentos : false;
  const t = totais(dados?.meses ?? []);
  const saldoHoje = (dados?.saldoInicial ?? 0) + t.resultado;
  const contas = dados?.contas.length ?? 0;

  return (
    <RelatorioShell
      icone={ReportsIcon}
      titulo="Relatórios"
      subtitulo={vazio ? "nenhum dado para consolidar ainda" : dados ? `escolha um relatório para abrir · dados de ${dados.periodo.de} a ${dados.periodo.ate}` : "carregando…"}
      vazio={vazio}
      rodape={vazio
        ? "Os relatórios usam apenas lançamentos pagos — por isso podem levar um ciclo para refletir importações recentes."
        : "Os relatórios usam apenas lançamentos pagos. Títulos a pagar e a receber aparecem na projeção do fluxo de caixa, não aqui."}
    >
      {erro ? <ErroDoRelatorio mensagem={erro} onTentar={recarregar} /> : !dados && carregando ? <CarregandoRelatorio /> : (
      <>
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao
          href="/relatorios/entradas-vs-saidas" vazio={vazio} icone={ArrowUpIcon}
          titulo="Entradas vs. saídas geral"
          texto="Compare quanto entrou e quanto saiu do caixa, mês a mês, com o resultado líquido de cada período."
          kicker="Resultado nos últimos 6 meses" valor={`${t.resultado >= 0 ? "+" : "−"} ${dinheiro(Math.abs(t.resultado))}`} tom={t.resultado >= 0 ? "positivo" : "negativo"}
          previa={(
            <div className="flex h-14 items-end gap-[5px]">
              {[[30, 24], [38, 33], [48, 28], [56, 34]].map(([e, s], i) => (
                <span key={i} className="contents"><span className="w-[11px] rounded-t-[3px] bg-[#12B85C]" style={{ height: e }} /><span className="w-[11px] rounded-t-[3px] bg-[#F0A6A0]" style={{ height: s }} /></span>
              ))}
            </div>
          )}
        />
        <Cartao
          href="/relatorios/fluxo-de-caixa-geral" vazio={vazio} icone={TrendUpIcon}
          titulo="Fluxo de caixa geral"
          texto="A curva do saldo consolidado de todas as contas, com saldo inicial, movimentações e saldo final."
          kicker="Saldo consolidado" valor={dinheiro(saldoHoje)}
          previa={(
            <svg width="150" height="56" viewBox="0 0 150 56" fill="none" aria-hidden="true">
              <polygon points="0,44 30,38 60,26 90,30 120,14 150,6 150,56 0,56" fill="#12B85C" opacity=".12" />
              <polyline points="0,44 30,38 60,26 90,30 120,14 150,6" stroke="#12B85C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="150" cy="6" r="4" fill="#12B85C" />
            </svg>
          )}
        />
        <Cartao
          href="/relatorios/fluxo-por-conta" vazio={vazio} icone={WalletIcon}
          titulo="Fluxo de caixa por conta bancária"
          texto="Veja o movimento de cada banco separadamente e o peso de cada conta no caixa da empresa."
          kicker="Contas acompanhadas" valor={`${contas} ${contas === 1 ? "conta" : "contas"}`}
          previa={(
            <div className="flex w-[150px] flex-col gap-2">
              {[100, 62, 34, 22].map((p, i) => (
                <span key={i} className="flex items-center gap-2"><span className="h-1.5 w-4 rounded bg-[#DCE5DF]" /><span className="h-1.5 flex-1 overflow-hidden rounded bg-[#EDF2EE]"><span className={`block h-full ${i === 2 ? "bg-[#F0A6A0]" : "bg-[#12B85C]"}`} style={{ width: `${p}%` }} /></span></span>
              ))}
            </div>
          )}
        />
        <Cartao
          href="/relatorios/entradas-vs-saidas-por-categoria" vazio={vazio} icone={TagIcon}
          titulo="Entradas vs. saídas por categoria"
          texto="O peso de cada categoria no que entrou e no que saiu, das maiores para as menores."
          kicker="Categorias movimentadas" valor={`${CATEGORIAS_MOCK.length} categorias`}
          previa={(
            <div className="flex w-[150px] flex-col gap-2">
              {[[0, 100], [52, 0], [41, 0], [0, 37]].map(([s, e], i) => (
                <span key={i} className="flex items-center gap-0.5"><span className="flex flex-1 justify-end"><span className="h-1.5 rounded-l bg-[#F0A6A0]" style={{ width: `${s}%` }} /></span><span className="h-2.5 w-px bg-[#DCE5DF]" /><span className="flex flex-1"><span className="h-1.5 rounded-r bg-[#12B85C]" style={{ width: `${e}%` }} /></span></span>
              ))}
            </div>
          )}
        />
        <Cartao
          href="/relatorios/fluxo-por-centro-de-custo" vazio={vazio} icone={BuildingIcon}
          titulo="Fluxo de caixa por centro de custo"
          texto="Quanto cada área da empresa traz e consome, com saldo inicial, movimento e saldo final por centro."
          kicker="Centros de custo ativos" valor={`${CENTROS_MOCK.length} centros`}
          previa={(
            <div className="flex h-14 items-end gap-[6px]">
              {[[14, 13, 9, 3], [16, 15, 10, 4], [15, 13, 10, 4], [18, 15, 11, 4], [16, 14, 11, 4], [18, 16, 12, 4]].map((pilha, i) => (
                <span key={i} className="flex w-[14px] flex-col justify-end overflow-hidden rounded-t-[3px]">
                  {pilha.map((h, j) => <span key={j} style={{ height: h, background: ["#12B85C", "#7EE2A8", "#0A7A42", "#B9C7BE"][j] }} />)}
                </span>
              ))}
            </div>
          )}
        />
        <Cartao
          href="/relatorios/entradas-vs-saidas-por-conta" vazio={vazio} icone={ChartIcon}
          titulo="Entradas vs. saídas por conta"
          texto="Compare o movimento de cada conta bancária: quanto entrou, quanto saiu e a margem de cada uma."
          kicker="Conta que mais recebe" valor={[...CONTAS_MOVIMENTO_MOCK].sort((a, b) => b.entradas - a.entradas)[0]?.nome ?? "—"}
          previa={(
            <div className="flex h-14 items-end gap-[5px]">
              {[[52, 36], [34, 32], [22, 25], [9, 8]].map(([e, s], i) => (
                <span key={i} className="contents"><span className="w-[11px] rounded-t-[3px] bg-[#12B85C]" style={{ height: e }} /><span className="w-[11px] rounded-t-[3px] bg-[#F0A6A0]" style={{ height: s }} /></span>
              ))}
            </div>
          )}
        />
      </div>

      {vazio ? (
        <EstadoVazioRelatorio
          ilustracao={<IlustracaoBarras />}
          titulo="Nenhum relatório disponível ainda"
          texto="Os três relatórios são montados a partir dos seus lançamentos. Cadastre uma conta bancária e registre as primeiras movimentações — entradas vs. saídas, fluxo de caixa geral e fluxo por conta aparecem aqui automaticamente."
          acaoPrincipal="Cadastrar conta bancária"
          onAcaoPrincipal={() => setLocation("/organizacao?nova=conta")}
          mostrarAcoes={podeEscrever}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-5 rounded-[20px] bg-[#0B1F14] p-6 text-white">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#1F3D2B] text-[#7EE2A8]"><DownloadIcon size={19} /></span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] font-bold">Precisa dos três juntos?</span>
            <span className="text-[13px] text-[#C5DACE]">Exporte um PDF único com entradas vs. saídas, fluxo geral e fluxo por conta no mesmo período.</span>
          </div>
          <button type="button" onClick={() => toast.info("O pacote em PDF chega em breve.")} className="h-11 whitespace-nowrap rounded-[12px] bg-[#12B85C] px-5 text-[13.5px] font-bold hover:bg-[#0F9E4E]">Exportar pacote em PDF</button>
        </div>
      )}
      </>
      )}
    </RelatorioShell>
  );
}
