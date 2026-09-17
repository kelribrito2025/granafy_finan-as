import { TrendUpIcon } from "@/components/IconlyIcons";
import { CarregandoRelatorio, ErroDoRelatorio, EstadoVazioRelatorio, Kpi, RelatorioShell, dinheiro, numero } from "@/components/relatorios/RelatorioShell";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { curvaDoSaldo, totais, useRelatorioDeFluxo } from "@/lib/relatorios";
import { useLocation } from "wouter";

const sinal = (v: number) => (v >= 0 ? "+" : "−");
const pontos = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

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
  const podeEscrever = !useSomenteLeitura();
  const [, setLocation] = useLocation();
  const { janela, setJanela, rotuloDoMes, mudarMes, dados, carregando, erro, recarregar } = useRelatorioDeFluxo();

  const vazio = dados ? !dados.temLancamentos : false;
  const meses = dados?.meses ?? [];
  const saldoInicial = dados?.saldoInicial ?? 0;
  const linhas = curvaDoSaldo(meses, saldoInicial);
  const t = totais(meses);
  const saldoFinal = linhas.length ? linhas[linhas.length - 1]!.saldoFinal : saldoInicial;
  const porResultado = [...linhas].sort((a, b) => (b.entradas - b.saidas) - (a.entradas - a.saidas));
  const melhor = porResultado[0];
  const apertado = porResultado[porResultado.length - 1];
  const variacao = saldoInicial !== 0 ? ((saldoFinal - saldoInicial) / Math.abs(saldoInicial)) * 100 : null;

  // A curva: um ponto por mês entre o menor e o maior saldo, com folga em cima e embaixo.
  const valores = linhas.map(l => l.saldoFinal);
  const menor = Math.min(saldoInicial, ...valores);
  const maior = Math.max(saldoInicial, ...valores);
  const folga = Math.max((maior - menor) * 0.15, Math.abs(maior) * 0.05, 1);
  const min = menor - folga;
  const max = maior + folga;
  const passo = valores.length > 1 ? 600 / (valores.length - 1) : 0;
  const pontosDaCurva = valores.map((v, i) => [valores.length > 1 ? i * passo : 300, 220 - ((v - min) / (max - min)) * 220] as const);
  const poly = pontosDaCurva.map(([x, y]) => `${x},${y.toFixed(1)}`).join(" ");
  const mesFinal = linhas.length ? linhas[linhas.length - 1]!.rotuloCurto : "";

  return (
    <RelatorioShell
      icone={TrendUpIcon}
      titulo="Fluxo de caixa geral"
      subtitulo={vazio ? "nenhum saldo para consolidar ainda" : dados ? `saldo consolidado de todas as contas · ${dados.periodo.de} a ${dados.periodo.ate}` : "carregando…"}
      vazio={vazio}
      janela={janela} onJanela={setJanela}
      mes={rotuloDoMes} onMes={mudarMes}
      rodape="Este relatório mostra apenas o realizado (lançamentos pagos). Para o previsto, use a projeção em Fluxo de caixa."
    >
      {erro ? <ErroDoRelatorio mensagem={erro} onTentar={recarregar} /> : !dados && carregando ? <CarregandoRelatorio /> : (
        <>
          {!vazio && (
            <div className="flex flex-col gap-5 lg:flex-row">
              <aside className="flex w-full shrink-0 flex-col gap-2.5 rounded-[20px] bg-[#0B1F14] p-6 text-white lg:w-[320px]">
                <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8FB39E]">Saldo consolidado em {mesFinal}</span>
                <span className="text-[36px] font-bold leading-none tracking-[-.03em]">{dinheiro(saldoFinal)}</span>
                <span className={`text-[12.5px] font-semibold ${saldoFinal >= saldoInicial ? "text-[#7EE2A8]" : "text-[#F0A6A0]"}`}>
                  {variacao === null ? `${sinal(saldoFinal - saldoInicial)} ${dinheiro(Math.abs(saldoFinal - saldoInicial))} no período` : `${sinal(variacao)} ${pontos(Math.abs(variacao))}% vs. ${dados?.periodo.de}`}
                </span>
                <div className="mt-3 flex flex-col gap-2.5 border-t border-[#1F3D2B] pt-3.5 text-[12.5px]">
                  <div className="flex justify-between"><span className="text-[#C5DACE]">Saldo inicial do período</span><span className="font-bold">{dinheiro(saldoInicial)}</span></div>
                  {melhor && <div className="flex justify-between"><span className="text-[#C5DACE]">Melhor mês</span><span className="font-bold text-[#7EE2A8]">{melhor.rotulo.split(" ")[0]}</span></div>}
                  {apertado && <div className="flex justify-between"><span className="text-[#C5DACE]">Mês mais apertado</span><span className="font-bold">{apertado.rotulo.split(" ")[0]}</span></div>}
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
                    {pontosDaCurva.map(([x, y], i) => (
                      <g key={i}>
                        <title>{`${linhas[i]!.rotulo}: ${dinheiro(linhas[i]!.saldoFinal)}`}</title>
                        {i === pontosDaCurva.length - 1
                          ? <circle cx={x} cy={y} r="5.5" fill="#12B85C" />
                          : <circle cx={x} cy={y} r="4.5" fill="#fff" stroke="#12B85C" strokeWidth="3" />}
                      </g>
                    ))}
                  </svg>
                </div>
                <div className="flex justify-between pl-0.5 text-[12px] text-[#4C6355]">
                  {linhas.map(l => <span key={l.chave}>{l.rotuloCurto}</span>)}
                </div>
              </section>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi rotulo="Saldo inicial" valor={dinheiro(saldoInicial)} apoio={dados ? `em ${dados.periodo.inicio}` : undefined} vazio={vazio} />
            <Kpi rotulo="Entradas do período" valor={`+ ${dinheiro(t.entradas)}`} apoio={`${meses.length} meses acumulados`} tom="positivo" vazio={vazio} />
            <Kpi rotulo="Saídas do período" valor={`− ${dinheiro(t.saidas)}`} apoio={`${meses.length} meses acumulados`} tom="negativo" vazio={vazio} />
            <Kpi rotulo="Saldo final" valor={dinheiro(saldoFinal)} apoio={dados ? `em ${dados.periodo.fim}` : undefined} vazio={vazio} />
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
        </>
      )}
    </RelatorioShell>
  );
}
