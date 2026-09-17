import { trpc } from "@/lib/trpc";
import { deslocarMes, rotuloCurtoDoMes, type Janela, type Mes } from "@shared/relatorios";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useState } from "react";

type Saidas = inferRouterOutputs<AppRouter>["relatorios"];
export type RelatorioDeFluxo = Saidas["fluxo"];
export type RelatorioPorCategoria = Saidas["porCategoria"];
export type RelatorioPorCentroDeCusto = Saidas["porCentroDeCusto"];

/*
 * Os controles do cabeçalho dos Relatórios: janela (6 meses, 12 meses, ano) e
 * o mês final. Cada tela guarda o próprio recorte; o cache do tRPC responde de
 * novo sem ida ao banco quando o recorte é o mesmo.
 */
function usarControles() {
  const [janela, setJanela] = useState<Janela>("6m");
  /** Nulo = o mês de hoje, que o servidor resolve no fuso da conta. */
  const [ate, setAte] = useState<Mes | null>(null);
  return { janela, setJanela, ate, setAte, entrada: { janela, ate: ate ?? undefined } };
}

const OPCOES = { staleTime: 60_000, placeholderData: <T,>(anterior: T) => anterior } as const;

function montar<T extends { ate: Mes }>(
  controles: ReturnType<typeof usarControles>,
  consulta: { data: T | undefined; isLoading: boolean; error: { message: string } | null; refetch: () => unknown },
) {
  const mesAtual = controles.ate ?? consulta.data?.ate ?? null;
  return {
    janela: controles.janela,
    setJanela: controles.setJanela,
    rotuloDoMes: mesAtual ? rotuloCurtoDoMes(mesAtual, true) : "…",
    mudarMes: (passo: -1 | 1) => { if (mesAtual) controles.setAte(deslocarMes(mesAtual, passo)); },
    dados: consulta.data,
    carregando: consulta.isLoading,
    erro: consulta.error?.message ?? null,
    recarregar: () => void consulta.refetch(),
  };
}

export function useRelatorioDeFluxo() {
  const controles = usarControles();
  return montar<RelatorioDeFluxo>(controles, trpc.relatorios.fluxo.useQuery(controles.entrada, OPCOES));
}

export function useRelatorioPorCategoria() {
  const controles = usarControles();
  return montar<RelatorioPorCategoria>(controles, trpc.relatorios.porCategoria.useQuery(controles.entrada, OPCOES));
}

export function useRelatorioPorCentroDeCusto() {
  const controles = usarControles();
  return montar<RelatorioPorCentroDeCusto>(controles, trpc.relatorios.porCentroDeCusto.useQuery(controles.entrada, OPCOES));
}

export { totais, curvaDoSaldo, tetoDoEixo } from "@shared/relatorios";
