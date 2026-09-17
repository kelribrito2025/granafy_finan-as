import { ArrowUpIcon } from "@/components/IconlyIcons";
import { CarregandoRelatorio, ErroDoRelatorio, EstadoVazioRelatorio, IlustracaoBarras, Kpi, RelatorioShell, dinheiro, mil, numero } from "@/components/relatorios/RelatorioShell";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { tetoDoEixo, totais, useRelatorioDeFluxo } from "@/lib/relatorios";
import { useLocation } from "wouter";

const pontos = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const sinal = (v: number) => (v >= 0 ? "+" : "−");

export default function EntradasVsSaidas() {
  const podeEscrever = !useSomenteLeitura();
  const [, setLocation] = useLocation();
  const { janela, setJanela, rotuloDoMes, mudarMes, dados, carregando, erro, recarregar } = useRelatorioDeFluxo();

  const vazio = dados ? !dados.temLancamentos : false;
  const meses = dados?.meses ?? [];
  const t = totais(meses);
  const positivos = meses.filter(m => m.entradas > m.saidas).length;
  const teto = tetoDoEixo(Math.max(...meses.map(m => Math.max(m.entradas, m.saidas)), 0));
  const eixo = [1, 0.75, 0.5, 0.25, 0].map(f => (teto * f) / 1000);
  const variacaoDaMargem = dados && dados.anterior.entradas > 0 ? t.margem - dados.anterior.margem : null;

  return (
    <RelatorioShell
      icone={ArrowUpIcon}
      titulo="Entradas vs. saídas geral"
      subtitulo={vazio ? "nenhuma movimentação registrada ainda" : dados ? `realizado de ${dados.periodo.de} a ${dados.periodo.ate} · todas as contas` : "carregando…"}
      vazio={vazio}
      janela={janela} onJanela={setJanela}
      mes={rotuloDoMes} onMes={mudarMes}
      rodape="Só lançamentos pagos, pela data do lançamento. Transferências entre contas próprias são compensadas e não contam como entrada nem saída."
    >
      {erro ? <ErroDoRelatorio mensagem={erro} onTentar={recarregar} /> : !dados && carregando ? <CarregandoRelatorio /> : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi rotulo="Total de entradas" valor={dinheiro(t.entradas)} apoio={`média de ${dinheiro(meses.length ? t.entradas / meses.length : 0)}/mês`} tom="positivo" vazio={vazio} />
            <Kpi rotulo="Total de saídas" valor={dinheiro(t.saidas)} apoio={`média de ${dinheiro(meses.length ? t.saidas / meses.length : 0)}/mês`} tom="negativo" vazio={vazio} />
            <Kpi rotulo="Resultado do período" valor={`${sinal(t.resultado)} ${dinheiro(Math.abs(t.resultado))}`} apoio={`${positivos} meses positivos de ${meses.length}`} tom={t.resultado >= 0 ? "positivo" : "negativo"} vazio={vazio} />
            <Kpi rotulo="Margem de caixa" valor={`${pontos(t.margem)}%`} apoio={variacaoDaMargem === null ? "sem período anterior para comparar" : `${sinal(variacaoDaMargem)}${pontos(Math.abs(variacaoDaMargem))} p.p. vs. período anterior`} vazio={vazio} />
          </div>

          {vazio ? (
            <EstadoVazioRelatorio
              ilustracao={<IlustracaoBarras />}
              titulo="Nada para comparar ainda"
              texto="Este relatório coloca lado a lado o que entrou e o que saiu do caixa em cada mês. Assim que houver lançamentos pagos, as barras e a margem de cada período aparecem aqui."
              acaoPrincipal="Novo lançamento"
              onAcaoPrincipal={() => setLocation("/lancamentos")}
              mostrarAcoes={podeEscrever}
            />
          ) : (
            <>
              <section className="flex flex-col gap-[22px] rounded-[20px] bg-white p-[26px] ring-1 ring-[#E1E8E3]">
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-[16px] font-bold tracking-[-.01em]">Entradas e saídas mês a mês</h2>
                  <span className="text-[12.5px] text-[#4C6355]">em milhares de reais</span>
                  <span className="ml-auto flex gap-3.5 text-[12px] text-[#4C6355]">
                    <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#12B85C]" />Entradas</span>
                    <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#F0A6A0]" />Saídas</span>
                  </span>
                </div>
                <div className="flex gap-4">
                  <div className="flex h-[220px] w-[52px] shrink-0 flex-col items-end justify-between text-[11px] text-[#8A968D]">
                    {eixo.map(v => <span key={v}>{pontos(v)}</span>)}
                  </div>
                  <div className="flex min-w-0 flex-1 items-start gap-2.5 overflow-x-auto border-l border-[#E3EBE6]">
                    {meses.map(m => (
                      <div key={m.chave} className="flex min-w-[64px] flex-1 flex-col items-center gap-2.5">
                        <div className="flex h-[220px] w-full items-end justify-center gap-2">
                          <span title={`entradas ${dinheiro(m.entradas)}`} className="w-[30px] rounded-t-[7px] bg-[#12B85C]" style={{ height: `${Math.max((m.entradas / teto) * 220, m.entradas > 0 ? 2 : 0)}px` }} />
                          <span title={`saídas ${dinheiro(m.saidas)}`} className="w-[30px] rounded-t-[7px] bg-[#F0A6A0]" style={{ height: `${Math.max((m.saidas / teto) * 220, m.saidas > 0 ? 2 : 0)}px` }} />
                        </div>
                        <span className="text-[12.5px] text-[#4C6355]">{meses.length > 6 ? m.rotuloCurto : m.rotulo.split(" ")[0]}</span>
                        <span className={`text-[13px] font-bold ${m.entradas >= m.saidas ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{sinal(m.entradas - m.saidas)} {mil(Math.abs(m.entradas - m.saidas))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-[20px] bg-white p-[26px] ring-1 ring-[#E1E8E3]">
                <div className="overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-[1.4fr_150px_150px_160px_130px] gap-3 border-b border-[#E3EBE6] px-1 pb-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">
                      <span>Período</span><span className="text-right">Entradas</span><span className="text-right">Saídas</span><span className="text-right">Resultado</span><span className="text-right">Margem</span>
                    </div>
                    {meses.map(m => {
                      const r = m.entradas - m.saidas;
                      return (
                        <div key={m.chave} className="grid grid-cols-[1.4fr_150px_150px_160px_130px] items-center gap-3 border-b border-[#F1F4F2] px-1 py-[13px]">
                          <span className="text-[13.5px] font-semibold">{m.rotulo}</span>
                          <span className="text-right text-[13.5px] font-semibold text-[#0A7A42]">+ {numero(m.entradas)}</span>
                          <span className="text-right text-[13.5px] font-semibold text-[#B3261E]">− {numero(m.saidas)}</span>
                          <span className={`text-right text-[14.5px] font-bold ${r >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{sinal(r)} {numero(Math.abs(r))}</span>
                          <span className="text-right text-[13px] text-[#4C6355]">{m.entradas > 0 ? `${Math.round((r / m.entradas) * 100)}% de margem` : "sem entradas"}</span>
                        </div>
                      );
                    })}
                    <div className="grid grid-cols-[1.4fr_150px_150px_160px_130px] items-center gap-3 px-1 pb-1 pt-4">
                      <span className="text-[14px] font-bold">Total do período</span>
                      <span className="text-right text-[14px] font-bold text-[#0A7A42]">+ {numero(t.entradas)}</span>
                      <span className="text-right text-[14px] font-bold text-[#B3261E]">− {numero(t.saidas)}</span>
                      <span className={`text-right text-[16px] font-bold ${t.resultado >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{sinal(t.resultado)} {numero(Math.abs(t.resultado))}</span>
                      <span className="text-right text-[13.5px] font-bold text-[#4C6355]">{pontos(t.margem)}%</span>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </RelatorioShell>
  );
}
