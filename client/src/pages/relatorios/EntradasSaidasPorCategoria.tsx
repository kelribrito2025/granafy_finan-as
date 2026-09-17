import { ArrowDownIcon, ArrowUpIcon, TagIcon } from "@/components/IconlyIcons";
import { CarregandoRelatorio, ErroDoRelatorio, EstadoVazioRelatorio, IlustracaoBarras, Kpi, RelatorioShell, dinheiro, numero } from "@/components/relatorios/RelatorioShell";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { useRelatorioPorCategoria } from "@/lib/relatorios";
import { useLocation } from "wouter";

const pct = (parte: number, todo: number) => (todo > 0 ? ((parte / todo) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : "0,0");

function ListaPorCategoria({ titulo, icone, tom, total, itens }: {
  titulo: string; icone: "entrada" | "saida"; tom: "positivo" | "negativo"; total: number; itens: Array<{ nome: string; valor: number }>;
}) {
  const cor = tom === "positivo" ? "text-[#0A7A42]" : "text-[#B3261E]";
  const barra = tom === "positivo" ? "bg-[#12B85C]" : "bg-[#F0A6A0]";
  const maior = Math.max(...itens.map(i => i.valor), 1);
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-3.5 rounded-[20px] bg-white p-[26px] ring-1 ring-[#E1E8E3]">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] ${tom === "positivo" ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FDECEA] text-[#B3261E]"}`}>
          {icone === "entrada" ? <ArrowUpIcon size={15} /> : <ArrowDownIcon size={15} />}
        </span>
        <h2 className="text-[15px] font-bold">{titulo}</h2>
        <span className={`ml-auto whitespace-nowrap text-[13.5px] font-bold ${cor}`}>{dinheiro(total)}</span>
      </div>
      <div className="flex flex-col">
        {itens.map(item => (
          <div key={item.nome} className="grid grid-cols-[1fr_110px_56px] items-center gap-3.5 border-b border-[#F1F4F2] py-[11px]">
            <div className="flex min-w-0 flex-col gap-[7px]">
              <span className="truncate text-[13px] font-semibold">{item.nome}</span>
              <span className="h-2 overflow-hidden rounded bg-[#EDF2EE]"><span className={`block h-full ${barra}`} style={{ width: `${Math.round((item.valor / maior) * 100)}%` }} /></span>
            </div>
            <span className={`whitespace-nowrap text-right text-[13.5px] font-bold ${cor}`}>{tom === "positivo" ? "+" : "−"} {numero(item.valor)}</span>
            <span className="whitespace-nowrap text-right text-[12.5px] text-[#4C6355]">{pct(item.valor, total)}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function EntradasSaidasPorCategoria() {
  const podeEscrever = !useSomenteLeitura();
  const [, setLocation] = useLocation();
  const { janela, setJanela, rotuloDoMes, mudarMes, dados, carregando, erro, recarregar } = useRelatorioPorCategoria();

  const categorias = dados?.categorias ?? [];
  const vazio = dados ? !dados.temLancamentos || categorias.length === 0 : false;
  const entradas = categorias.filter(c => c.entradas > 0).map(c => ({ nome: c.nome, valor: c.entradas })).sort((a, b) => b.valor - a.valor);
  const saidas = categorias.filter(c => c.saidas > 0).map(c => ({ nome: c.nome, valor: c.saidas })).sort((a, b) => b.valor - a.valor);
  const totalEntradas = entradas.reduce((s, i) => s + i.valor, 0);
  const totalSaidas = saidas.reduce((s, i) => s + i.valor, 0);
  const maiorValor = Math.max(...categorias.map(c => Math.max(c.entradas, c.saidas)), 1);
  const ordenadas = [...categorias].sort((a, b) => Math.max(b.entradas, b.saidas) - Math.max(a.entradas, a.saidas));

  return (
    <RelatorioShell
      icone={TagIcon}
      titulo="Entradas vs. saídas por categoria"
      subtitulo={vazio ? "nenhuma categoria movimentada no período" : dados ? `${categorias.length} ${categorias.length === 1 ? "categoria movimentada" : "categorias movimentadas"} · ${dados.periodo.de} a ${dados.periodo.ate}` : "carregando…"}
      vazio={vazio}
      janela={janela} onJanela={setJanela}
      mes={rotuloDoMes} onMes={mudarMes}
      rodape="Só lançamentos pagos, sem transferências. Lançamentos sem categoria ficam agrupados em “Outras” — vale revisá-los na tela de Lançamentos para deixar o relatório mais preciso."
    >
      {erro ? <ErroDoRelatorio mensagem={erro} onTentar={recarregar} /> : !dados && carregando ? <CarregandoRelatorio /> : (
      <>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi rotulo="Categorias de entrada" valor={`${entradas.length} ${entradas.length === 1 ? "categoria" : "categorias"}`} apoio={`${dinheiro(totalEntradas)} no total`} tom="positivo" vazio={vazio} />
        <Kpi rotulo="Categorias de saída" valor={`${saidas.length} ${saidas.length === 1 ? "categoria" : "categorias"}`} apoio={`${dinheiro(totalSaidas)} no total`} tom="negativo" vazio={vazio} />
        <Kpi rotulo="Maior entrada" valor={entradas[0]?.nome ?? "—"} apoio={entradas[0] ? `${pct(entradas[0].valor, totalEntradas)}% de tudo que entrou` : undefined} vazio={vazio} />
        <Kpi rotulo="Maior saída" valor={saidas[0]?.nome ?? "—"} apoio={saidas[0] ? `${pct(saidas[0].valor, totalSaidas)}% de tudo que saiu` : undefined} vazio={vazio} />
      </div>

      {vazio ? (
        <EstadoVazioRelatorio
          ilustracao={<IlustracaoBarras />}
          titulo="Nenhuma categoria para comparar"
          texto="Este relatório mostra o peso de cada categoria no que entrou e no que saiu do caixa neste período. Classifique os lançamentos pagos e as categorias aparecem aqui, das maiores para as menores."
          acaoPrincipal="Novo lançamento"
          onAcaoPrincipal={() => setLocation("/lancamentos")}
          mostrarAcoes={podeEscrever}
        />
      ) : (
        <>
          <section className="flex flex-col gap-5 rounded-[20px] bg-white p-[26px] ring-1 ring-[#E1E8E3]">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-[16px] font-bold tracking-[-.01em]">Peso de cada categoria no caixa</h2>
              <span className="text-[12.5px] text-[#4C6355]">saídas à esquerda, entradas à direita</span>
              <span className="ml-auto flex gap-3.5 text-[12px] text-[#4C6355]">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#12B85C]" />Entradas</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#F0A6A0]" />Saídas</span>
              </span>
            </div>
            <div className="overflow-x-auto">
              <div className="flex min-w-[640px] flex-col">
                {ordenadas.map(c => {
                  const liquido = c.entradas - c.saidas;
                  return (
                    <div key={c.chave} className="grid grid-cols-[200px_1fr_1fr_120px] items-center border-b border-[#F8FAF9] py-[9px]">
                      <span className="truncate pr-3.5 text-[12.5px] text-[#28382E]">{c.nome}</span>
                      <span className="flex justify-end pr-[3px]"><span className="h-[18px] rounded-l-[5px] bg-[#F0A6A0]" style={{ width: `${(c.saidas / maiorValor) * 100}%` }} /></span>
                      <span className="flex justify-start border-l-2 border-[#E3EBE6] pl-[3px]"><span className="h-[18px] rounded-r-[5px] bg-[#12B85C]" style={{ width: `${(c.entradas / maiorValor) * 100}%` }} /></span>
                      <span className={`whitespace-nowrap text-right text-[12.5px] font-bold ${liquido >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{liquido >= 0 ? "+" : "−"} {numero(Math.abs(liquido))}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="flex flex-col gap-5 lg:flex-row">
            <ListaPorCategoria titulo="Entradas por categoria" icone="entrada" tom="positivo" total={totalEntradas} itens={entradas} />
            <ListaPorCategoria titulo="Saídas por categoria" icone="saida" tom="negativo" total={totalSaidas} itens={saidas} />
          </div>
        </>
      )}
      </>
      )}
    </RelatorioShell>
  );
}
