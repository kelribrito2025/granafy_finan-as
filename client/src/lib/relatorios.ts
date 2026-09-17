import { trpc } from "@/lib/trpc";
import { deslocarMes, rotuloCurtoDoMes, type Janela, type Mes } from "@shared/relatorios";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useState } from "react";

export type RelatorioDeFluxo = inferRouterOutputs<AppRouter>["relatorios"]["fluxo"];

/*
 * A consulta dos Relatórios com os controles do cabeçalho: janela (6 meses,
 * 12 meses, ano) e o mês final. Cada tela guarda o próprio recorte; o cache do
 * tRPC responde de novo sem ida ao banco quando o recorte é o mesmo.
 */
export function useRelatorioDeFluxo() {
  const [janela, setJanela] = useState<Janela>("6m");
  /** Nulo = o mês de hoje, que o servidor resolve no fuso da conta. */
  const [ate, setAte] = useState<Mes | null>(null);

  const consulta = trpc.relatorios.fluxo.useQuery(
    { janela, ate: ate ?? undefined },
    { staleTime: 60_000, placeholderData: anterior => anterior },
  );

  const mesAtual = ate ?? consulta.data?.ate ?? null;
  const mudarMes = (passo: -1 | 1) => {
    if (!mesAtual) return;
    setAte(deslocarMes(mesAtual, passo));
  };

  return {
    janela,
    setJanela,
    rotuloDoMes: mesAtual ? rotuloCurtoDoMes(mesAtual, true) : "…",
    mudarMes,
    dados: consulta.data,
    carregando: consulta.isLoading,
    erro: consulta.error?.message ?? null,
    recarregar: () => void consulta.refetch(),
  };
}

export { totais, curvaDoSaldo, tetoDoEixo } from "@shared/relatorios";
