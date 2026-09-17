import { BuildingIcon } from "@/components/IconlyIcons";
import { CarregandoRelatorio, ErroDoRelatorio, EstadoVazioRelatorio, RelatorioShell, dinheiro, mil, numero } from "@/components/relatorios/RelatorioShell";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { tetoDoEixo, useRelatorioPorCentroDeCusto } from "@/lib/relatorios";
import { useLocation } from "wouter";

function Linha({ curva, cor }: { curva: number[]; cor: string }) {
  if (curva.length < 2) return null;
  const min = Math.min(...curva); const max = Math.max(...curva);
  const pts = curva.map((v, i) => `${i * (110 / (curva.length - 1))},${(30 - ((v - min) / ((max - min) || 1)) * 22).toFixed(1)}`).join(" ");
  return <svg width="110" height="34" viewBox="0 0 110 34" fill="none" className="shrink-0" aria-hidden="true"><polyline points={pts} stroke={cor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function IlustracaoPredios() {
  return (
    <>
      <span className="absolute bottom-[30px] left-6 flex items-end gap-1.5">
        <span className="h-[30px] w-[16px] rounded-t-[4px] bg-[#DCE5DF]" /><span className="h-[48px] w-[18px] rounded-t-[4px] bg-[#7EE2A8]" /><span className="h-[38px] w-[16px] rounded-t-[4px] bg-[#B9C7BE]" />
      </span>
      <span className="absolute bottom-3 left-1/2 flex h-[34px] w-[34px] -translate-x-1/2 items-center justify-center rounded-full bg-[#12B85C] text-[22px] font-bold leading-none text-white shadow-[0_6px_16px_rgba(18,184,92,.35)]">+</span>
    </>
  );
}

export default function FluxoPorCentroDeCusto() {
  const podeEscrever = !useSomenteLeitura();
  const [, setLocation] = useLocation();
  const { janela, setJanela, rotuloDoMes, mudarMes, dados, carregando, erro, recarregar } = useRelatorioPorCentroDeCusto();

  const vazio = dados ? !dados.temCentros : false;
  const meses = dados?.meses ?? [];
  const centros = (dados?.centros ?? []).map(c => ({ ...c, saldoFinal: c.curva.length ? c.curva[c.curva.length - 1]! : c.saldoInicial, detalhe: `${c.lancamentos} ${c.lancamentos === 1 ? "lançamento" : "lançamentos"} no período` }));
  const totalSaidas = centros.reduce((s, c) => s + c.saidas, 0);
  const totalInicial = centros.reduce((s, c) => s + c.saldoInicial, 0);
  const totalEntradas = centros.reduce((s, c) => s + c.entradas, 0);
  const totalFinal = centros.reduce((s, c) => s + c.saldoFinal, 0);
  const peso = (c: { saidas: number }) => (totalSaidas > 0 ? Math.round((c.saidas / totalSaidas) * 100) : 0);
  const totaisDoMes = meses.map((_, i) => centros.reduce((s, c) => s + (c.saidasPorMes[i] ?? 0), 0));
  const teto = tetoDoEixo(Math.max(...totaisDoMes, 0));
  const eixo = [1, 0.75, 0.5, 0.25, 0].map(f => Math.round((teto * f) / 1000));
  const emQueda = centros.filter(c => c.saldoFinal < c.saldoInicial);

  return (
    <RelatorioShell
      icone={BuildingIcon}
      titulo="Fluxo de caixa por centro de custo"
      subtitulo={vazio ? "nenhum centro de custo cadastrado" : dados ? `${centros.length} ${centros.length === 1 ? "centro de custo" : "centros de custo"} · ${dados.periodo.de} a ${dados.periodo.ate}` : "carregando…"}
      vazio={vazio}
      janela={janela} onJanela={setJanela}
      mes={rotuloDoMes} onMes={mudarMes}
      rodape={!vazio && emQueda.length > 0
        ? `${emQueda.map(c => c.nome).join(", ")} consumiu mais do que trouxe no período — esperado para um centro de custo de estrutura, mas vale conferir os rateios.`
        : "Só lançamentos pagos com centro de custo informado, sem transferências. O saldo inicial é o acumulado do centro antes do período."}
    >
      {erro ? <ErroDoRelatorio mensagem={erro} onTentar={recarregar} /> : !dados && carregando ? <CarregandoRelatorio /> : (
      <>
      {!vazio && (
      <div className="grid gap-5 lg:grid-cols-2">
        {centros.map(c => (
          <article key={c.chave} className="flex flex-col gap-[18px] rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
            <div className="flex items-center gap-3">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] bg-[#F1FBF6] text-[#0A7A42]"><BuildingIcon size={18} /></span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold">{c.nome}</span>
                <span className="truncate text-[12px] text-[#8A968D]">{c.detalhe}</span>
              </div>
              <Linha curva={[c.saldoInicial, ...c.curva]} cor={c.saldoFinal < c.saldoInicial ? "#F0A6A0" : "#12B85C"} />
            </div>
            <div className="flex flex-col gap-2.5 border-t border-[#F1F4F2] pt-4 text-[12.5px]">
              <div className="flex justify-between gap-3"><span className="text-[#4C6355]">Saldo inicial</span><span className="font-semibold">{dinheiro(c.saldoInicial)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[#4C6355]">Entradas</span><span className="font-semibold text-[#0A7A42]">+ {numero(c.entradas)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[#4C6355]">Saídas</span><span className="font-semibold text-[#B3261E]">− {numero(c.saidas)}</span></div>
              <div className="flex items-baseline justify-between gap-3 border-t border-[#F1F4F2] pt-2.5"><span className="font-bold">Saldo final</span><span className="text-[18px] font-bold">{dinheiro(c.saldoFinal)}</span></div>
              <div className="flex items-center gap-2.5 pt-1">
                <span className="h-2 flex-1 overflow-hidden rounded bg-[#EDF2EE]"><span className={`block h-full ${c.saldoFinal < c.saldoInicial ? "bg-[#F0A6A0]" : "bg-[#12B85C]"}`} style={{ width: `${peso(c)}%` }} /></span>
                <span className="whitespace-nowrap text-[12px] text-[#4C6355]">{peso(c)}% das saídas</span>
              </div>
            </div>
          </article>
        ))}
      </div>
      )}

      {vazio ? (
        <EstadoVazioRelatorio
          ilustracao={<IlustracaoPredios />}
          titulo="Nenhum centro de custo cadastrado"
          texto="Este relatório separa o caixa por área da empresa e mostra quanto cada centro de custo consome das saídas. Cadastre os centros em Contas e categorias e informe-os nos lançamentos."
          acaoPrincipal="Cadastrar centro de custo"
          onAcaoPrincipal={() => setLocation("/organizacao")}
          mostrarAcoes={podeEscrever}
        />
      ) : (
        <>
          <section className="flex flex-col gap-[22px] rounded-[20px] bg-white p-[26px] ring-1 ring-[#E1E8E3]">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-[16px] font-bold tracking-[-.01em]">Saídas mês a mês por centro de custo</h2>
              <span className="text-[12.5px] text-[#4C6355]">em milhares de reais</span>
              <span className="ml-auto flex flex-wrap justify-end gap-3.5 text-[12px] text-[#4C6355]">
                {centros.map(c => <span key={c.chave} className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-3 w-3 rounded" style={{ background: c.cor }} />{c.nome}</span>)}
              </span>
            </div>
            <div className="flex gap-4">
              <div className="flex h-[200px] w-[52px] shrink-0 flex-col items-end justify-between text-[11px] text-[#8A968D]">
                {eixo.map((v, i) => <span key={i}>{v}</span>)}
              </div>
              <div className="flex min-w-0 flex-1 items-start gap-2.5 overflow-x-auto border-l border-[#E3EBE6]">
                {meses.map((mes, i) => (
                  <div key={mes.chave} className="flex min-w-[64px] flex-1 flex-col items-center gap-2.5">
                    <div className="flex h-[200px] w-[52px] flex-col justify-end overflow-hidden rounded-t-[7px]">
                      {[...centros].reverse().map(c => (
                        <span key={c.chave} title={`${c.nome} · ${mil(c.saidasPorMes[i] ?? 0)}`} style={{ height: `${((c.saidasPorMes[i] ?? 0) / teto) * 200}px`, background: c.cor }} />
                      ))}
                    </div>
                    <span className="text-[12.5px] text-[#4C6355]">{mes.rotuloCurto}</span>
                    <span className="whitespace-nowrap text-[12.5px] font-bold">{mil(totaisDoMes[i] ?? 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[20px] bg-white p-[26px] ring-1 ring-[#E1E8E3]">
            <div className="flex flex-wrap items-baseline gap-3 pb-3">
              <h2 className="text-[16px] font-bold tracking-[-.01em]">Comparativo entre centros de custo</h2>
              <span className="text-[12.5px] text-[#4C6355]">acumulado antes do período, movimento e saldo ao fim</span>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <div className="grid grid-cols-[1.6fr_140px_140px_140px_150px_120px] gap-3 border-b border-[#E3EBE6] px-1 pb-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">
                  <span>Centro de custo</span><span className="text-right">Saldo inicial</span><span className="text-right">Entradas</span><span className="text-right">Saídas</span><span className="text-right">Saldo final</span><span className="text-right">Peso</span>
                </div>
                {centros.map(c => (
                  <div key={c.chave} className="grid grid-cols-[1.6fr_140px_140px_140px_150px_120px] items-center gap-3 border-b border-[#F1F4F2] px-1 py-3.5">
                    <span className="flex min-w-0 flex-col"><span className="text-[13.5px] font-semibold">{c.nome}</span><span className="text-[11.5px] text-[#8A968D]">{c.detalhe}</span></span>
                    <span className="text-right text-[13.5px] text-[#4C6355]">{dinheiro(c.saldoInicial)}</span>
                    <span className="text-right text-[13.5px] font-semibold text-[#0A7A42]">+ {numero(c.entradas)}</span>
                    <span className="text-right text-[13.5px] font-semibold text-[#B3261E]">− {numero(c.saidas)}</span>
                    <span className="text-right text-[14.5px] font-bold">{dinheiro(c.saldoFinal)}</span>
                    <span className="text-right text-[13px] text-[#4C6355]">{peso(c)}%</span>
                  </div>
                ))}
                <div className="grid grid-cols-[1.6fr_140px_140px_140px_150px_120px] items-center gap-3 px-1 pb-1 pt-4">
                  <span className="text-[14px] font-bold">Total consolidado</span>
                  <span className="text-right text-[14px] font-bold text-[#4C6355]">{dinheiro(totalInicial)}</span>
                  <span className="text-right text-[14px] font-bold text-[#0A7A42]">+ {numero(totalEntradas)}</span>
                  <span className="text-right text-[14px] font-bold text-[#B3261E]">− {numero(totalSaidas)}</span>
                  <span className={`text-right text-[16px] font-bold ${totalFinal >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{dinheiro(totalFinal)}</span>
                  <span className="text-right text-[13.5px] font-bold text-[#4C6355]">100%</span>
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
