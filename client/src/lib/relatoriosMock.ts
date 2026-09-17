/*
 * Dados de amostra dos três relatórios novos — por categoria, por centro de
 * custo e entradas vs. saídas por conta. São os números dos protótipos, para
 * a tela ser vista antes do back. Quando as consultas entrarem, este arquivo
 * sai; a forma dos objetos aqui é a que o servidor vai devolver.
 *
 * `?vazio=1` em qualquer uma das três URLs mostra a versão sem dados.
 */

import { useSearch } from "wouter";

export function usarVazio() {
  const busca = useSearch();
  return new URLSearchParams(busca).get("vazio") === "1";
}

export const PERIODO_MOCK = { de: "abril", ate: "setembro de 2026" };

export type CategoriaDoRelatorio = { nome: string; entradas: number; saidas: number };

export const CATEGORIAS_MOCK: CategoriaDoRelatorio[] = [
  { nome: "Mensalidades de clientes", entradas: 412_800, saidas: 0 },
  { nome: "Folha de pagamento", entradas: 0, saidas: 218_400 },
  { nome: "Custos de plataforma e nuvem", entradas: 0, saidas: 172_330 },
  { nome: "Serviços de implantação", entradas: 154_300, saidas: 0 },
  { nome: "Consultoria e treinamentos", entradas: 78_900, saidas: 0 },
  { nome: "Marketing e aquisição", entradas: 0, saidas: 68_200 },
  { nome: "Impostos e taxas", entradas: 0, saidas: 54_870 },
  { nome: "Ocupação e estrutura", entradas: 0, saidas: 26_800 },
  { nome: "Rendimentos de aplicações", entradas: 24_600, saidas: 0 },
  { nome: "Outras receitas", entradas: 12_600, saidas: 0 },
  { nome: "Outras despesas", entradas: 0, saidas: 14_300 },
];

export type CentroDeCustoDoRelatorio = {
  id: number;
  nome: string;
  detalhe: string;
  cor: string;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  /** Saídas de cada mês, em reais, para o gráfico empilhado. */
  saidasPorMes: number[];
  curva: number[];
};

export const CENTROS_MOCK: CentroDeCustoDoRelatorio[] = [
  { id: 1, nome: "Operação e Suporte", detalhe: "CC 01 · 14 pessoas", cor: "#12B85C", saldoInicial: 38_400, entradas: 246_800, saidas: 198_300, saidasPorMes: [14_200, 16_400, 15_100, 17_800, 16_200, 18_400], curva: [38, 42, 46, 44, 52, 60] },
  { id: 2, nome: "Tecnologia", detalhe: "CC 02 · 9 pessoas", cor: "#7EE2A8", saldoInicial: 31_200, entradas: 164_500, saidas: 186_240, saidasPorMes: [12_800, 14_900, 13_200, 15_400, 14_100, 15_900], curva: [31, 29, 26, 23, 19, 13] },
  { id: 3, nome: "Comercial", detalhe: "CC 03 · 7 pessoas", cor: "#0A7A42", saldoInicial: 26_100, entradas: 208_900, saidas: 132_480, saidasPorMes: [9_100, 10_200, 9_800, 11_400, 10_600, 12_000], curva: [26, 30, 34, 36, 44, 52] },
  { id: 4, nome: "Administrativo", detalhe: "CC 04 · 4 pessoas", cor: "#B9C7BE", saldoInicial: 12_340, entradas: 63_000, saidas: 37_880, saidasPorMes: [3_400, 3_800, 3_600, 4_200, 3_900, 4_400], curva: [12, 13, 15, 14, 17, 19] },
];

export const MESES_CURTOS_MOCK = ["Abr", "Mai", "Jun", "Jul", "Ago", "Set"];

export type ContaMovimentoDoRelatorio = { id: number; nome: string; detalhe: string; entradas: number; saidas: number };

export const CONTAS_MOVIMENTO_MOCK: ContaMovimentoDoRelatorio[] = [
  { id: 1, nome: "Banco do Brasil", detalhe: "CC 4471-2", entradas: 62_480, saidas: 41_930 },
  { id: 2, nome: "Itaú", detalhe: "CC 0092-8", entradas: 38_210, saidas: 36_480 },
  { id: 3, nome: "Nubank PJ", detalhe: "CC 7788-1", entradas: 24_660, saidas: 28_140 },
  { id: 4, nome: "Caixa", detalhe: "Aplicação CDB", entradas: 9_000, saidas: 8_590 },
];
