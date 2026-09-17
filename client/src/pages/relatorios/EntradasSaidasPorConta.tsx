import { ChartIcon } from "@/components/IconlyIcons";
import { EstadoVazioRelatorio, IlustracaoBarras, Kpi, RelatorioShell, dinheiro, numero, type Janela } from "@/components/relatorios/RelatorioShell";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { CONTAS_MOVIMENTO_MOCK, PERIODO_MOCK, usarVazio } from "@/lib/relatoriosMock";
import { tetoDoEixo } from "@shared/relatorios";
import { useState } from "react";
import { useLocation } from "wouter";

const pct = (parte: number, todo: number) => (todo > 0 ? ((parte / todo) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : "0,0");
const sinal = (v: number) => (v >= 0 ? "+" : "−");
const emMil = (v: number) => (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

export default function EntradasSaidasPorConta() {
  const vazio = usarVazio();
  const podeEscrever = !useSomenteLeitura();
  const [, setLocation] = useLocation();
  const [janela, setJanela] = useState<Janela>("6m");

  const contas = CONTAS_MOVIMENTO_MOCK.map(c => ({ ...c, resultado: c.entradas - c.saidas }));
  const totalEntradas = contas.reduce((s, c) => s + c.entradas, 0);
  const totalSaidas = contas.reduce((s, c) => s + c.saidas, 0);
  const totalResultado = totalEntradas - totalSaidas;
  const maisRecebe = [...contas].sort((a, b) => b.entradas - a.entradas)[0];
  const maisPaga = [...contas].sort((a, b) => b.saidas - a.saidas)[0];
  const porResultado = [...contas].sort((a, b) => b.resultado - a.resultado);
  const melhor = porResultado[0];
  const pior = porResultado[porResultado.length - 1];
  const teto = tetoDoEixo(Math.max(...contas.map(c => Math.max(c.entradas, c.saidas)), 1));
  const eixo = [1, 0.75, 0.5, 0.25, 0].map(f => teto * f);

  return (
    <RelatorioShell
      icone={ChartIcon}
      titulo="Entradas vs. saídas por conta"
      subtitulo={vazio ? "nenhuma conta bancária cadastrada" : `${contas.length} contas bancárias · ${PERIODO_MOCK.de} a ${PERIODO_MOCK.ate}`}
      vazio={vazio}
      janela={janela} onJanela={setJanela}
      mes="Set 2026" onMes={() => undefined}
      rodape="Aqui o foco é o movimento de cada conta, não o saldo. Para acompanhar saldo inicial e final por banco, use o relatório de fluxo de caixa por conta bancária."
    >
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo="Conta que mais recebe" valor={maisRecebe?.nome ?? "—"} apoio={maisRecebe ? `${pct(maisRecebe.entradas, totalEntradas)}% das entradas` : undefined} vazio={vazio} />
        <Kpi rotulo="Conta que mais paga" valor={maisPaga?.nome ?? "—"} apoio={maisPaga ? `${pct(maisPaga.saidas, totalSaidas)}% das saídas` : undefined} vazio={vazio} />
        <Kpi rotulo="Melhor margem" valor={melhor?.nome ?? "—"} apoio={melhor ? `${sinal(melhor.resultado)} ${dinheiro(Math.abs(melhor.resultado))} no período` : undefined} tom="positivo" vazio={vazio} />
        {pior && pior.resultado < 0
          ? <Kpi rotulo="Margem negativa" valor={pior.nome} apoio={`− ${dinheiro(Math.abs(pior.resultado))} no período`} tom="negativo" vazio={vazio} />
          : <Kpi rotulo="Margem negativa" valor="Nenhuma" apoio="todas as contas fecharam positivas" vazio={vazio} />}
      </div>

      {vazio ? (
        <EstadoVazioRelatorio
          ilustracao={<IlustracaoBarras />}
          titulo="Nenhuma conta para comparar"
          texto="Este relatório compara quanto entrou e quanto saiu em cada conta bancária no período. Cadastre a primeira conta e registre ou importe as movimentações para começar."
          acaoPrincipal="Cadastrar conta bancária"
          onAcaoPrincipal={() => setLocation("/organizacao?nova=conta")}
          mostrarAcoes={podeEscrever}
        />
      ) : (
        <>
          <section className="flex flex-col gap-[22px] rounded-[20px] bg-white p-[26px] ring-1 ring-[#E1E8E3]">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-[16px] font-bold tracking-[-.01em]">Quanto entrou e saiu em cada conta</h2>
              <span className="text-[12.5px] text-[#4C6355]">acumulado do período, em reais</span>
              <span className="ml-auto flex gap-3.5 text-[12px] text-[#4C6355]">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#12B85C]" />Entradas</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#F0A6A0]" />Saídas</span>
              </span>
            </div>
            <div className="flex gap-4">
              <div className="flex h-[220px] w-[62px] shrink-0 flex-col items-end justify-between text-[11px] text-[#8A968D]">
                {eixo.map((v, i) => <span key={i}>{i === 0 ? `${emMil(v)} mil` : emMil(v)}</span>)}
              </div>
              <div className="flex min-w-0 flex-1 items-start gap-2.5 overflow-x-auto border-l border-[#E3EBE6]">
                {contas.map(c => (
                  <div key={c.id} className="flex min-w-[120px] flex-1 flex-col items-center gap-3">
                    <div className="flex h-[220px] w-full items-end justify-center gap-2.5">
                      <span title={`entradas ${dinheiro(c.entradas)}`} className="w-[38px] rounded-t-[7px] bg-[#12B85C]" style={{ height: `${(c.entradas / teto) * 220}px` }} />
                      <span title={`saídas ${dinheiro(c.saidas)}`} className="w-[38px] rounded-t-[7px] bg-[#F0A6A0]" style={{ height: `${(c.saidas / teto) * 220}px` }} />
                    </div>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="whitespace-nowrap text-[13px] font-semibold">{c.nome}</span>
                      <span className="whitespace-nowrap text-[11.5px] text-[#8A968D]">{c.detalhe}</span>
                    </div>
                    <span className={`whitespace-nowrap text-[13px] font-bold ${c.resultado >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{sinal(c.resultado)} {numero(Math.abs(c.resultado))}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[20px] bg-white p-[26px] ring-1 ring-[#E1E8E3]">
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div className="grid grid-cols-[1.6fr_150px_150px_160px_130px] gap-3 border-b border-[#E3EBE6] px-1 pb-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">
                  <span>Conta</span><span className="text-right">Entradas</span><span className="text-right">Saídas</span><span className="text-right">Resultado</span><span className="text-right">Margem</span>
                </div>
                {contas.map(c => (
                  <div key={c.id} className="grid grid-cols-[1.6fr_150px_150px_160px_130px] items-center gap-3 border-b border-[#F1F4F2] px-1 py-3.5">
                    <span className="flex min-w-0 flex-col"><span className="text-[13.5px] font-semibold">{c.nome}</span><span className="text-[11.5px] text-[#8A968D]">{c.detalhe}</span></span>
                    <span className="text-right text-[13.5px] font-semibold text-[#0A7A42]">+ {numero(c.entradas)}</span>
                    <span className="text-right text-[13.5px] font-semibold text-[#B3261E]">− {numero(c.saidas)}</span>
                    <span className={`text-right text-[14.5px] font-bold ${c.resultado >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{sinal(c.resultado)} {numero(Math.abs(c.resultado))}</span>
                    <span className="whitespace-nowrap text-right text-[13px] text-[#4C6355]">{c.entradas > 0 ? `${Math.round((c.resultado / c.entradas) * 100)}% de margem` : "sem entradas"}</span>
                  </div>
                ))}
                <div className="grid grid-cols-[1.6fr_150px_150px_160px_130px] items-center gap-3 px-1 pb-1 pt-4">
                  <span className="text-[14px] font-bold">Total consolidado</span>
                  <span className="text-right text-[14px] font-bold text-[#0A7A42]">+ {numero(totalEntradas)}</span>
                  <span className="text-right text-[14px] font-bold text-[#B3261E]">− {numero(totalSaidas)}</span>
                  <span className={`text-right text-[16px] font-bold ${totalResultado >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{sinal(totalResultado)} {numero(Math.abs(totalResultado))}</span>
                  <span className="text-right text-[13.5px] font-bold text-[#4C6355]">{pct(totalResultado, totalEntradas)}%</span>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </RelatorioShell>
  );
}
