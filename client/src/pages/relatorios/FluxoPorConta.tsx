import { WalletIcon } from "@/components/IconlyIcons";
import { EstadoVazioRelatorio, RelatorioShell, dinheiro, numero, type Janela } from "@/components/relatorios/RelatorioShell";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { CONTAS_MOCK, PERIODO_MOCK } from "@/lib/relatoriosMock";
import { useState } from "react";
import { useLocation } from "wouter";
import { usarVazio } from "./RelatoriosHub";

function Linha({ curva, cor }: { curva: number[]; cor: string }) {
  const min = Math.min(...curva); const max = Math.max(...curva);
  const pts = curva.map((v, i) => `${i * (110 / (curva.length - 1))},${(30 - ((v - min) / ((max - min) || 1)) * 22).toFixed(1)}`).join(" ");
  return <svg width="110" height="34" viewBox="0 0 110 34" fill="none" className="shrink-0" aria-hidden="true"><polyline points={pts} stroke={cor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function IlustracaoCartoes() {
  return (
    <>
      <span className="absolute left-[18px] top-[22px] h-[38px] w-[58px] -rotate-[7deg] rounded-[10px] border-[1.5px] border-dashed border-[#B9C7BE] bg-white" />
      <span className="absolute right-4 top-[34px] flex h-[38px] w-[58px] rotate-[6deg] items-center justify-center rounded-[10px] border-[1.5px] border-[#12B85C] bg-[#DFF6EA] text-[#0A7A42]"><WalletIcon size={18} /></span>
      <span className="absolute bottom-3 left-1/2 flex h-[34px] w-[34px] -translate-x-1/2 items-center justify-center rounded-full bg-[#12B85C] text-[22px] font-bold leading-none text-white shadow-[0_6px_16px_rgba(18,184,92,.35)]">+</span>
    </>
  );
}

export default function FluxoPorConta() {
  const vazio = usarVazio();
  const podeEscrever = !useSomenteLeitura();
  const [, setLocation] = useLocation();
  const [janela, setJanela] = useState<Janela>("6m");
  const contas = CONTAS_MOCK.map(c => ({ ...c, saldoFinal: c.saldoInicial + c.entradas - c.saidas }));
  const total = contas.reduce((s, c) => s + c.saldoFinal, 0);
  const totalInicial = contas.reduce((s, c) => s + c.saldoInicial, 0);
  const totalEntradas = contas.reduce((s, c) => s + c.entradas, 0);
  const totalSaidas = contas.reduce((s, c) => s + c.saidas, 0);
  const emQueda = contas.filter(c => c.saldoFinal < c.saldoInicial);

  return (
    <RelatorioShell
      icone={WalletIcon}
      titulo="Fluxo de caixa por conta bancária"
      subtitulo={vazio ? "nenhuma conta bancária cadastrada" : `${contas.length} contas acompanhadas · ${PERIODO_MOCK.de} a ${PERIODO_MOCK.ate}`}
      vazio={vazio}
      voltar
      janela={janela} onJanela={setJanela}
      mes="Set 2026" onMes={() => undefined}
      rodape={vazio
        ? "Transferências entre contas próprias aparecem nas duas contas envolvidas, mas se compensam no total consolidado."
        : emQueda.length > 0
          ? `${emQueda.map(c => c.nome).join(", ")} fechou o período com saldo menor que o inicial — vale revisar as saídas concentradas nessa conta.`
          : "Transferências entre contas próprias aparecem nas duas contas envolvidas, mas se compensam no total consolidado."}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {(vazio ? [0, 1, 2, 3] : contas).map((c, i) => typeof c === "number" ? (
          <article key={i} className="flex flex-col gap-[18px] rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
            <div className="flex items-center gap-3">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] bg-[#F1F4F2] text-[#B3BFB7]"><WalletIcon size={18} /></span>
              <div className="flex flex-1 flex-col gap-1.5"><span className="h-[9px] w-[62%] rounded-[5px] bg-[#EDF2EE]" /><span className="h-[7px] w-[42%] rounded bg-[#F1F4F2]" /></div>
            </div>
            <div className="flex flex-col gap-3 border-t border-[#F1F4F2] pt-4">
              <span className="h-[7px] w-full rounded bg-[#F1F4F2]" /><span className="h-[7px] w-[80%] rounded bg-[#F1F4F2]" /><span className="h-[7px] w-[66%] rounded bg-[#F1F4F2]" />
              <span className="pt-1.5 text-[20px] font-bold text-[#B3BFB7]">—</span>
            </div>
          </article>
        ) : (
          <article key={c.id} className="flex flex-col gap-[18px] rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
            <div className="flex items-center gap-3">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] bg-[#F1FBF6] text-[#0A7A42]"><WalletIcon size={18} /></span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold">{c.nome}</span>
                <span className="truncate text-[12px] text-[#8A968D]">{c.detalhe}</span>
              </div>
              <Linha curva={c.curva} cor={c.saldoFinal < c.saldoInicial ? "#F0A6A0" : "#12B85C"} />
            </div>
            <div className="flex flex-col gap-2.5 border-t border-[#F1F4F2] pt-4 text-[12.5px]">
              <div className="flex justify-between gap-3"><span className="text-[#4C6355]">Saldo inicial</span><span className="font-semibold">{dinheiro(c.saldoInicial)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[#4C6355]">Entradas</span><span className="font-semibold text-[#0A7A42]">+ {numero(c.entradas)}</span></div>
              <div className="flex justify-between gap-3"><span className="text-[#4C6355]">Saídas</span><span className="font-semibold text-[#B3261E]">− {numero(c.saidas)}</span></div>
              <div className="flex items-baseline justify-between gap-3 border-t border-[#F1F4F2] pt-2.5"><span className="font-bold">Saldo final</span><span className="text-[18px] font-bold">{dinheiro(c.saldoFinal)}</span></div>
              <div className="flex items-center gap-2.5 pt-1">
                <span className="h-2 flex-1 overflow-hidden rounded bg-[#EDF2EE]"><span className={`block h-full ${c.saldoFinal < c.saldoInicial ? "bg-[#F0A6A0]" : "bg-[#12B85C]"}`} style={{ width: `${Math.round((c.saldoFinal / total) * 100)}%` }} /></span>
                <span className="whitespace-nowrap text-[12px] text-[#4C6355]">{Math.round((c.saldoFinal / total) * 100)}% do caixa</span>
              </div>
            </div>
          </article>
        ))}
      </div>

      {vazio ? (
        <EstadoVazioRelatorio
          ilustracao={<IlustracaoCartoes />}
          titulo="Nenhuma conta bancária cadastrada"
          texto="Este relatório separa o movimento de cada banco e mostra o peso de cada conta no caixa da empresa. Cadastre a primeira conta para começar — depois basta registrar ou importar as movimentações."
          acaoPrincipal="Cadastrar conta bancária"
          onAcaoPrincipal={() => setLocation("/organizacao?nova=conta")}
          mostrarAcoes={podeEscrever}
        />
      ) : (
        <section className="rounded-[20px] bg-white p-[26px] ring-1 ring-[#E1E8E3]">
          <div className="flex flex-wrap items-baseline gap-3 pb-3">
            <h2 className="text-[16px] font-bold tracking-[-.01em]">Comparativo entre contas</h2>
            <span className="text-[12.5px] text-[#4C6355]">transferências entre contas próprias já compensadas</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[1.6fr_140px_140px_140px_150px_120px] gap-3 border-b border-[#E3EBE6] px-1 pb-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">
                <span>Conta</span><span className="text-right">Saldo inicial</span><span className="text-right">Entradas</span><span className="text-right">Saídas</span><span className="text-right">Saldo final</span><span className="text-right">Peso</span>
              </div>
              {contas.map(c => (
                <div key={c.id} className="grid grid-cols-[1.6fr_140px_140px_140px_150px_120px] items-center gap-3 border-b border-[#F1F4F2] px-1 py-3.5">
                  <span className="flex min-w-0 flex-col"><span className="text-[13.5px] font-semibold">{c.nome}</span><span className="text-[11.5px] text-[#8A968D]">{c.detalhe}</span></span>
                  <span className="text-right text-[13.5px] text-[#4C6355]">{dinheiro(c.saldoInicial)}</span>
                  <span className="text-right text-[13.5px] font-semibold text-[#0A7A42]">+ {numero(c.entradas)}</span>
                  <span className="text-right text-[13.5px] font-semibold text-[#B3261E]">− {numero(c.saidas)}</span>
                  <span className="text-right text-[14.5px] font-bold">{dinheiro(c.saldoFinal)}</span>
                  <span className="text-right text-[13px] text-[#4C6355]">{Math.round((c.saldoFinal / total) * 100)}%</span>
                </div>
              ))}
              <div className="grid grid-cols-[1.6fr_140px_140px_140px_150px_120px] items-center gap-3 px-1 pb-1 pt-4">
                <span className="text-[14px] font-bold">Total consolidado</span>
                <span className="text-right text-[14px] font-bold text-[#4C6355]">{dinheiro(totalInicial)}</span>
                <span className="text-right text-[14px] font-bold text-[#0A7A42]">+ {numero(totalEntradas)}</span>
                <span className="text-right text-[14px] font-bold text-[#B3261E]">− {numero(totalSaidas)}</span>
                <span className="text-right text-[16px] font-bold text-[#0A7A42]">{dinheiro(total)}</span>
                <span className="text-right text-[13.5px] font-bold text-[#4C6355]">100%</span>
              </div>
            </div>
          </div>
        </section>
      )}
    </RelatorioShell>
  );
}
