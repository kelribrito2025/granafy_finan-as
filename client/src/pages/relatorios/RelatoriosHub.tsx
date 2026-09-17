import { ArrowUpIcon, ChevronRightIcon, DownloadIcon, ReportsIcon, TrendUpIcon, WalletIcon, type IconlyIcon } from "@/components/IconlyIcons";
import { EstadoVazioRelatorio, IlustracaoBarras, RelatorioShell, dinheiro } from "@/components/relatorios/RelatorioShell";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { CONTAS_MOCK, MESES_MOCK, PERIODO_MOCK, SALDO_INICIAL_MOCK, totais } from "@/lib/relatoriosMock";
import { toast } from "@/lib/toast";
import type { ReactNode } from "react";
import { useLocation, useSearch } from "wouter";

/*
 * Relatórios — o hub. Três cartões, um por relatório; embaixo, a faixa do
 * pacote em PDF. Enquanto a tela roda com amostra, `?vazio=1` mostra a versão
 * sem dados, para as duas serem conferidas sem mexer no banco.
 */

export function usarVazio() {
  const busca = useSearch();
  return new URLSearchParams(busca).get("vazio") === "1";
}

function Cartao({ href, icone: Icone, titulo, texto, kicker, valor, tom, previa, vazio, busca }: {
  href: string; icone: IconlyIcon; titulo: string; texto: string; kicker: string; valor: string; tom?: "positivo"; previa: ReactNode; vazio: boolean; busca: string;
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
      onClick={() => setLocation(`${href}${busca}`)}
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
        <span className={`text-[20px] font-bold ${tom === "positivo" ? "text-[#0A7A42]" : "text-[#0B1F14]"}`}>{valor}</span>
        <span className="mt-2 flex h-10 items-center justify-center gap-2 rounded-[11px] bg-[#F1FBF6] text-[13px] font-bold text-[#0A7A42] transition group-hover:bg-[#12B85C] group-hover:text-white">
          Abrir relatório <ChevronRightIcon size={15} />
        </span>
      </div>
    </button>
  );
}

export default function RelatoriosHub() {
  const vazio = usarVazio();
  const busca = vazio ? "?vazio=1" : "";
  const [, setLocation] = useLocation();
  const podeEscrever = !useSomenteLeitura();
  const t = totais(MESES_MOCK);
  const saldoHoje = SALDO_INICIAL_MOCK + t.resultado;

  return (
    <RelatorioShell
      icone={ReportsIcon}
      titulo="Relatórios"
      subtitulo={vazio ? "nenhum dado para consolidar ainda" : `escolha um relatório para abrir · dados de ${PERIODO_MOCK.de} a ${PERIODO_MOCK.ate}`}
      vazio={vazio}
      rodape={vazio
        ? "Os relatórios usam apenas lançamentos pagos — por isso podem levar um ciclo para refletir importações recentes."
        : "Os relatórios usam apenas lançamentos pagos. Títulos a pagar e a receber aparecem na projeção do fluxo de caixa, não aqui."}
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <Cartao
          href="/relatorios/entradas-vs-saidas" busca={busca} vazio={vazio} icone={ArrowUpIcon}
          titulo="Entradas vs. saídas geral"
          texto="Compare quanto entrou e quanto saiu do caixa, mês a mês, com o resultado líquido de cada período."
          kicker="Resultado nos últimos 6 meses" valor={`+ ${dinheiro(t.resultado)}`} tom="positivo"
          previa={(
            <div className="flex h-14 items-end gap-[5px]">
              {[[30, 24], [38, 33], [48, 28], [56, 34]].map(([e, s], i) => (
                <span key={i} className="contents"><span className="w-[11px] rounded-t-[3px] bg-[#12B85C]" style={{ height: e }} /><span className="w-[11px] rounded-t-[3px] bg-[#F0A6A0]" style={{ height: s }} /></span>
              ))}
            </div>
          )}
        />
        <Cartao
          href="/relatorios/fluxo-de-caixa-geral" busca={busca} vazio={vazio} icone={TrendUpIcon}
          titulo="Fluxo de caixa geral"
          texto="A curva do saldo consolidado de todas as contas, com saldo inicial, movimentações e saldo final."
          kicker="Saldo consolidado hoje" valor={dinheiro(saldoHoje)}
          previa={(
            <svg width="150" height="56" viewBox="0 0 150 56" fill="none" aria-hidden="true">
              <polygon points="0,44 30,38 60,26 90,30 120,14 150,6 150,56 0,56" fill="#12B85C" opacity=".12" />
              <polyline points="0,44 30,38 60,26 90,30 120,14 150,6" stroke="#12B85C" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="150" cy="6" r="4" fill="#12B85C" />
            </svg>
          )}
        />
        <Cartao
          href="/relatorios/fluxo-por-conta" busca={busca} vazio={vazio} icone={WalletIcon}
          titulo="Fluxo de caixa por conta bancária"
          texto="Veja o movimento de cada banco separadamente e o peso de cada conta no caixa da empresa."
          kicker="Contas acompanhadas" valor={`${CONTAS_MOCK.length} contas`}
          previa={(
            <div className="flex w-[150px] flex-col gap-2">
              {[100, 62, 34, 22].map((p, i) => (
                <span key={i} className="flex items-center gap-2"><span className="h-1.5 w-4 rounded bg-[#DCE5DF]" /><span className="h-1.5 flex-1 overflow-hidden rounded bg-[#EDF2EE]"><span className={`block h-full ${i === 2 ? "bg-[#F0A6A0]" : "bg-[#12B85C]"}`} style={{ width: `${p}%` }} /></span></span>
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
          <button type="button" onClick={() => toast.info("O pacote em PDF entra junto com os dados reais.")} className="h-11 whitespace-nowrap rounded-[12px] bg-[#12B85C] px-5 text-[13.5px] font-bold hover:bg-[#0F9E4E]">Exportar pacote em PDF</button>
        </div>
      )}
    </RelatorioShell>
  );
}
