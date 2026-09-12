import { GranafyBars, GranafyRing } from "@/components/GranafyLoader";

/*
 * A espera desenhada no lugar do conteúdo, e não por cima dele.
 *
 * Antes cada uma destas telas trocava tudo por um loader centralizado: a
 * moldura sumia, o loader aparecia, e quando o dado chegava a página pulava
 * de volta. Agora os cartões nascem vazios no lugar certo — o anel onde vai
 * o número, as barras onde vai o gráfico — e o layout não se mexe quando o
 * valor chega.
 */

/** Faixa cinza no lugar de um texto que ainda não chegou. */
function Barra({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block rounded-full bg-[#EDF2EE] ${className}`} />;
}

/**
 * A linha de KPIs: moldura, rótulo esmaecido e o anel onde vai o valor.
 *
 * `cards` tem que ser CONTADO na tela, e contar `<KpiCard` no arquivo não
 * serve: metade destas telas mistura KpiCard com AuroraSurface, com `article`
 * cru e com KpiCard embrulhado em `<Hint>`. Foi assim que três páginas ficaram
 * com esqueleto de tamanho errado — a Conciliação com três de quatro, o Balanço
 * com três de quatro e Pagas e recebidas com quatro de seis. Ao mexer aqui,
 * conte os filhos da grade, não as ocorrências de um nome.
 *
 * `colunas` existe porque contar cartões não diz a largura deles. Uma tela com
 * dois cartões lado a lado, desenhada numa grade de quatro, mostra dois
 * retângulos estreitos e meia linha vazia — e quando o dado chega os cartões
 * dobram de largura, que é o pulo de layout que este arquivo existe para
 * evitar. O padrão continua quatro para não mexer em quem já usa.
 */
export function KpiRowSkeleton({ cards = 4, colunas = 4, className = "" }: {
  cards?: number;
  colunas?: 2 | 3 | 4;
  className?: string;
}) {
  const grade = colunas === 2 ? "sm:grid-cols-2" : colunas === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2 xl:grid-cols-4";
  return (
    <section className={`grid gap-5 ${grade} ${className}`} aria-hidden="true">
      {Array.from({ length: cards }).map((_, indice) => (
        <div key={indice} className="flex min-h-[126px] flex-col gap-3 rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3]">
          <Barra className="h-2.5 w-24" />
          <GranafyRing size={24} />
          <Barra className="h-2 w-28 bg-[#F1F4F2]" />
        </div>
      ))}
    </section>
  );
}

/** O bloco de um gráfico que ainda está sendo calculado. */
export function ChartSkeleton({ minHeight = 220, className = "" }: { minHeight?: number; className?: string }) {
  return (
    <section
      role="status"
      aria-label="Carregando o gráfico"
      className={`flex items-center justify-center rounded-[20px] bg-white ring-1 ring-[#E1E8E3] ${className}`}
      style={{ minHeight }}
    >
      <GranafyBars height={56} />
    </section>
  );
}

/**
 * Um cartão estreito ao lado de um gráfico largo.
 *
 * É a forma do topo do Fluxo de caixa nas visões diária e semanal: um cartão de
 * largura fixa e a curva ocupando o resto. O esqueleto de antes era uma linha de
 * três KPIs mais um gráfico de largura total — desenhava uma tela que não
 * existe, e quando o dado chegava a página se remontava inteira na frente de
 * quem estava olhando.
 *
 * A FORMA é copiada da tela; a COR não. O cartão do saldo de hoje é escuro, e a
 * primeira versão disto era escura junto — o que punha um retângulo preto de
 * 340px na tela antes de existir qualquer número, gritando mais alto que o
 * conteúdo que estava chegando. Esqueleto é ausência de conteúdo, não prévia da
 * pintura: branco com faixa cinza, igual a todos os outros deste arquivo.
 */
export function SplitChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <section className={`flex flex-col gap-5 lg:flex-row ${className}`} aria-hidden="true">
      <div className="flex w-full shrink-0 flex-col gap-3 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3] lg:w-[340px]">
        <Barra className="h-2.5 w-24" />
        <GranafyRing size={28} />
        <Barra className="h-2 w-32 bg-[#F1F4F2]" />
        <div className="mt-3 flex flex-col gap-2.5 border-t border-[#EDF2EE] pt-3.5">
          {[0, 1, 2].map(indice => (
            <Barra key={indice} className="h-2 w-full bg-[#F1F4F2]" />
          ))}
        </div>
      </div>
      <div className="flex min-h-[260px] min-w-0 flex-1 items-center justify-center rounded-[20px] bg-white ring-1 ring-[#E1E8E3]">
        <GranafyBars height={56} />
      </div>
    </section>
  );
}

/** O bloco de uma tabela: cabeçalho e algumas linhas no lugar certo. */
export function TableSkeleton({ linhas = 4, className = "" }: { linhas?: number; className?: string }) {
  return (
    <section
      className={`flex flex-col gap-0.5 rounded-[20px] bg-white px-5 pb-6 pt-5 ring-1 ring-[#E1E8E3] sm:px-6 ${className}`}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3 pb-3.5">
        <Barra className="h-3 w-40" />
        <Barra className="ml-auto h-2 w-56 bg-[#F1F4F2]" />
      </div>
      {Array.from({ length: linhas }).map((_, indice) => (
        <div key={indice} className="flex items-center gap-3 border-b border-[#F1F4F2] py-3.5 last:border-b-0">
          <Barra className="h-2.5 w-14" />
          <Barra className="h-2.5 w-24 bg-[#F1F4F2]" />
          <Barra className="ml-auto h-2.5 w-28" />
        </div>
      ))}
    </section>
  );
}
