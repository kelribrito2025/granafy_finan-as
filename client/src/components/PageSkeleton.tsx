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

/** A linha de KPIs: moldura, rótulo esmaecido e o anel onde vai o valor. */
export function KpiRowSkeleton({ cards = 4, className = "" }: { cards?: number; className?: string }) {
  return (
    <section className={`grid gap-5 sm:grid-cols-2 xl:grid-cols-4 ${className}`} aria-hidden="true">
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
