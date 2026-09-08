export type Greeting = "Bom dia" | "Boa tarde" | "Boa noite";

/** Fuso de Brasília, sem horário de verão desde 2019. */
export const APP_TIME_ZONE = "America/Sao_Paulo";

/**
 * A hora do relógio de Brasília, 0–23, independente do fuso da máquina.
 *
 * `hourCycle: "h23"` pede explicitamente a faixa 0–23, e o `% 24` fecha a
 * porta: parte dos motores devolve "24" para a meia-noite, e a saudação cairia
 * fora de todas as faixas. O Node desta máquina não faz isso, então o teste da
 * meia-noite passa dos dois jeitos — o módulo está aqui pelos navegadores que
 * fazem, não porque a suíte pegue.
 */
export function brasiliaHour(date: Date) {
  const hour = new Intl.DateTimeFormat("pt-BR", {
    timeZone: APP_TIME_ZONE,
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  return Number(hour) % 24;
}

export function greetingFor(date: Date): Greeting {
  const hour = brasiliaHour(date);
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}
