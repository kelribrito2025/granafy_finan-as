import { ArrowUpIcon } from "@/components/IconlyIcons";
import { EstadoVazioRelatorio, IlustracaoBarras, Kpi, RelatorioShell, dinheiro, mil, numero, type Janela } from "@/components/relatorios/RelatorioShell";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { MESES_MOCK, PERIODO_MOCK, totais } from "@/lib/relatoriosMock";
import { useState } from "react";
import { useLocation } from "wouter";
import { usarVazio } from "./RelatoriosHub";

export default function EntradasVsSaidas() {
  const vazio = usarVazio();
  const podeEscrever = !useSomenteLeitura();
  const [, setLocation] = useLocation();
  const [janela, setJanela] = useState<Janela>("6m");
  const meses = MESES_MOCK;
  const t = totais(meses);
  const teto = 140_000;
  const positivos = meses.filter(m => m.entradas > m.saidas).length;

  return (
    <RelatorioShell
      icone={ArrowUpIcon}
      titulo="Entradas vs. saídas geral"
      subtitulo={vazio ? "nenhuma movimentação registrada ainda" : `realizado de ${PERIODO_MOCK.de} a ${PERIODO_MOCK.ate} · todas as contas`}
      vazio={vazio}
      voltar
      janela={janela} onJanela={setJanela}
      mes="Set 2026" onMes={() => undefined}
      rodape="Transferências entre contas próprias são compensadas e não contam como entrada nem saída."
    >
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo="Total de entradas" valor={dinheiro(t.entradas)} apoio={`média de ${dinheiro(t.entradas / meses.length)}/mês`} tom="positivo" vazio={vazio} />
        <Kpi rotulo="Total de saídas" valor={dinheiro(t.saidas)} apoio={`média de ${dinheiro(t.saidas / meses.length)}/mês`} tom="negativo" vazio={vazio} />
        <Kpi rotulo="Resultado do período" valor={`+ ${dinheiro(t.resultado)}`} apoio={`${positivos} meses positivos de ${meses.length}`} tom="positivo" vazio={vazio} />
        <Kpi rotulo="Margem de caixa" valor={`${t.margem.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`} apoio="+3,4 p.p. vs. semestre anterior" vazio={vazio} />
      </div>

      {vazio ? (
        <EstadoVazioRelatorio
          ilustracao={<IlustracaoBarras />}
          titulo="Nada para comparar ainda"
          texto="Este relatório coloca lado a lado o que entrou e o que saiu do caixa em cada mês. Assim que houver lançamentos classificados, as barras e a margem de cada período aparecem aqui."
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
                {[140, 105, 70, 35, 0].map(v => <span key={v}>{v}</span>)}
              </div>
              <div className="flex min-w-0 flex-1 items-start gap-2.5 border-l border-[#E3EBE6] overflow-x-auto">
                {meses.map(m => (
                  <div key={m.chave} className="flex min-w-[64px] flex-1 flex-col items-center gap-2.5">
                    <div className="flex h-[220px] w-full items-end justify-center gap-2">
                      <span title={`entradas ${dinheiro(m.entradas)}`} className="w-[30px] rounded-t-[7px] bg-[#12B85C]" style={{ height: `${(m.entradas / teto) * 220}px` }} />
                      <span title={`saídas ${dinheiro(m.saidas)}`} className="w-[30px] rounded-t-[7px] bg-[#F0A6A0]" style={{ height: `${(m.saidas / teto) * 220}px` }} />
                    </div>
                    <span className="text-[12.5px] text-[#4C6355]">{m.rotulo.split(" ")[0]}</span>
                    <span className={`text-[13px] font-bold ${m.entradas >= m.saidas ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{m.entradas >= m.saidas ? "+" : "−"} {mil(Math.abs(m.entradas - m.saidas))}</span>
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
                      <span className={`text-right text-[14.5px] font-bold ${r >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{r >= 0 ? "+" : "−"} {numero(Math.abs(r))}</span>
                      <span className="text-right text-[13px] text-[#4C6355]">{Math.round((r / m.entradas) * 100)}% de margem</span>
                    </div>
                  );
                })}
                <div className="grid grid-cols-[1.4fr_150px_150px_160px_130px] items-center gap-3 px-1 pb-1 pt-4">
                  <span className="text-[14px] font-bold">Total do período</span>
                  <span className="text-right text-[14px] font-bold text-[#0A7A42]">+ {numero(t.entradas)}</span>
                  <span className="text-right text-[14px] font-bold text-[#B3261E]">− {numero(t.saidas)}</span>
                  <span className="text-right text-[16px] font-bold text-[#0A7A42]">+ {numero(t.resultado)}</span>
                  <span className="text-right text-[13.5px] font-bold text-[#4C6355]">{t.margem.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </RelatorioShell>
  );
}
