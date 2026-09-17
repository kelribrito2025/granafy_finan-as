import { TrendUpIcon } from "@/components/IconlyIcons";
import { EstadoVazioRelatorio, Kpi, RelatorioShell, dinheiro, numero, type Janela } from "@/components/relatorios/RelatorioShell";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { MESES_MOCK, PERIODO_MOCK, SALDO_INICIAL_MOCK, curvaDoSaldo, totais } from "@/lib/relatoriosMock";
import { useState } from "react";
import { useLocation } from "wouter";
import { usarVazio } from "./RelatoriosHub";

function IlustracaoCurva() {
  return (
    <>
      <svg width="72" height="46" viewBox="0 0 72 46" fill="none" className="absolute left-5 top-[26px]" aria-hidden="true">
        <polyline points="2,40 16,32 30,36 44,18 58,22 70,6" stroke="#12B85C" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="70" cy="6" r="5" fill="#12B85C" />
      </svg>
      <span className="absolute bottom-3 left-1/2 flex h-[34px] w-[34px] -translate-x-1/2 items-center justify-center rounded-full bg-[#12B85C] text-[22px] font-bold leading-none text-white shadow-[0_6px_16px_rgba(18,184,92,.35)]">+</span>
    </>
  );
}

export default function FluxoCaixaGeral() {
  const vazio = usarVazio();
  const podeEscrever = !useSomenteLeitura();
  const [, setLocation] = useLocation();
  const [janela, setJanela] = useState<Janela>("6m");
  const linhas = curvaDoSaldo(MESES_MOCK, SALDO_INICIAL_MOCK);
  const t = totais(MESES_MOCK);
  const saldoFinal = linhas[linhas.length - 1]!.saldoFinal;
  const melhor = [...linhas].sort((a, b) => (b.entradas - b.saidas) - (a.entradas - a.saidas))[0]!;
  const apertado = [...linhas].sort((a, b) => (a.entradas - a.saidas) - (b.entradas - b.saidas))[0]!;

  // A curva: 6 pontos entre o menor e o maior saldo final, com folga em cima e embaixo.
  const valores = linhas.map(l => l.saldoFinal);
  const min = Math.min(SALDO_INICIAL_MOCK, ...valores) * 0.9;
  const max = Math.max(...valores) * 1.05;
  const pontos = valores.map((v, i) => [i * (600 / (valores.length - 1)), 220 - ((v - min) / (max - min)) * 220] as const);
  const poly = pontos.map(([x, y]) => `${x},${y.toFixed(1)}`).join(" ");

  return (
    <RelatorioShell
      icone={TrendUpIcon}
      titulo="Fluxo de caixa geral"
      subtitulo={vazio ? "nenhum saldo para consolidar ainda" : `saldo consolidado de todas as contas · ${PERIODO_MOCK.de} a ${PERIODO_MOCK.ate}`}
      vazio={vazio}
      voltar
      janela={janela} onJanela={setJanela}
      mes="Set 2026" onMes={() => undefined}
      rodape="Este relatório mostra apenas o realizado. Para o previsto, use a projeção em Fluxo de caixa."
    >
      {!vazio && (
        <div className="flex flex-col gap-5 lg:flex-row">
          <aside className="flex w-full shrink-0 flex-col gap-2.5 rounded-[20px] bg-[#0B1F14] p-6 text-white lg:w-[320px]">
            <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8FB39E]">Saldo consolidado hoje</span>
            <span className="text-[36px] font-bold leading-none tracking-[-.03em]">{dinheiro(saldoFinal)}</span>
            <span className="text-[12.5px] font-semibold text-[#7EE2A8]">+ {(((saldoFinal - SALDO_INICIAL_MOCK) / SALDO_INICIAL_MOCK) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. {PERIODO_MOCK.de}</span>
            <div className="mt-3 flex flex-col gap-2.5 border-t border-[#1F3D2B] pt-3.5 text-[12.5px]">
              <div className="flex justify-between"><span className="text-[#C5DACE]">Saldo inicial do período</span><span className="font-bold">{dinheiro(SALDO_INICIAL_MOCK)}</span></div>
              <div className="flex justify-between"><span className="text-[#C5DACE]">Melhor mês</span><span className="font-bold text-[#7EE2A8]">{melhor.rotulo.split(" ")[0]}</span></div>
              <div className="flex justify-between"><span className="text-[#C5DACE]">Mês mais apertado</span><span className="font-bold">{apertado.rotulo.split(" ")[0]}</span></div>
            </div>
          </aside>
          <section className="flex min-w-0 flex-1 flex-col gap-[18px] rounded-[20px] bg-white p-[26px] ring-1 ring-[#E1E8E3]">
            <div className="flex items-baseline gap-3">
              <h2 className="text-[16px] font-bold tracking-[-.01em]">Curva do saldo consolidado</h2>
              <span className="text-[12.5px] text-[#4C6355]">fim de cada mês</span>
            </div>
            <div className="relative h-[220px] border-b border-l border-[#E3EBE6]">
              <svg viewBox="0 0 600 220" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
                <polygon points={`${poly} 600,220 0,220`} fill="#12B85C" opacity=".12" />
                <polyline points={poly} fill="none" stroke="#12B85C" strokeWidth="3" />
              </svg>
              <svg viewBox="0 0 600 220" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                {pontos.map(([x, y], i) => i === pontos.length - 1
                  ? <circle key={i} cx={x} cy={y} r="5.5" fill="#12B85C" />
                  : <circle key={i} cx={x} cy={y} r="4.5" fill="#fff" stroke="#12B85C" strokeWidth="3" />)}
              </svg>
            </div>
            <div className="flex justify-between pl-0.5 text-[12px] text-[#4C6355]">
              {linhas.map(l => <span key={l.chave}>{l.rotuloCurto}</span>)}
            </div>
          </section>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo="Saldo inicial" valor={dinheiro(SALDO_INICIAL_MOCK)} apoio={`em ${PERIODO_MOCK.inicio}`} vazio={vazio} />
        <Kpi rotulo="Entradas do período" valor={`+ ${dinheiro(t.entradas)}`} apoio={`${MESES_MOCK.length} meses acumulados`} tom="positivo" vazio={vazio} />
        <Kpi rotulo="Saídas do período" valor={`− ${dinheiro(t.saidas)}`} apoio={`${MESES_MOCK.length} meses acumulados`} tom="negativo" vazio={vazio} />
        <Kpi rotulo="Saldo final" valor={dinheiro(saldoFinal)} apoio={`em ${PERIODO_MOCK.fim}`} vazio={vazio} />
      </div>

      {vazio ? (
        <EstadoVazioRelatorio
          ilustracao={<IlustracaoCurva />}
          titulo="A curva do seu caixa começa aqui"
          texto="Este relatório acompanha o saldo consolidado de todas as contas ao fim de cada mês. Registre as primeiras movimentações e a curva passa a ser desenhada automaticamente."
          acaoPrincipal="Novo lançamento"
          onAcaoPrincipal={() => setLocation("/lancamentos")}
          mostrarAcoes={podeEscrever}
        />
      ) : (
        <section className="rounded-[20px] bg-white p-[26px] ring-1 ring-[#E1E8E3]">
          <div className="flex items-baseline gap-3 pb-3">
            <h2 className="text-[16px] font-bold tracking-[-.01em]">Movimento mês a mês</h2>
            <span className="text-[12.5px] text-[#4C6355]">saldo inicial, movimentações e saldo final</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1.4fr_150px_140px_140px_160px] gap-3 border-b border-[#E3EBE6] px-1 pb-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">
                <span>Período</span><span className="text-right">Saldo inicial</span><span className="text-right">Entradas</span><span className="text-right">Saídas</span><span className="text-right">Saldo final</span>
              </div>
              {linhas.map(l => (
                <div key={l.chave} className="grid grid-cols-[1.4fr_150px_140px_140px_160px] items-center gap-3 border-b border-[#F1F4F2] px-1 py-[13px]">
                  <span className="text-[13.5px] font-semibold">{l.rotulo}</span>
                  <span className="text-right text-[13.5px] text-[#4C6355]">{dinheiro(l.saldoInicial)}</span>
                  <span className="text-right text-[13.5px] font-semibold text-[#0A7A42]">+ {numero(l.entradas)}</span>
                  <span className="text-right text-[13.5px] font-semibold text-[#B3261E]">− {numero(l.saidas)}</span>
                  <span className="text-right text-[14.5px] font-bold">{dinheiro(l.saldoFinal)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </RelatorioShell>
  );
}
