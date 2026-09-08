/*
 * Limite de tentativas de entrada.
 *
 * O login não tinha nenhum: dava para varrer senha à vontade, sem custo
 * nenhum, contra qualquer e-mail. A redefinição de senha já tinha teto — cinco
 * tentativas de código, trinta segundos entre pedidos —, e o login era o único
 * lugar sem.
 *
 * A decisão mora aqui, longe do banco, porque é ela que precisa de teste: a
 * consulta é trivial, a regra de quando alguém está barrado não é.
 */

/** Falha some da conta depois disso, e é também o que dura o bloqueio. */
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60_000;

/** Falhas dentro da janela que fecham a porta. */
export const LOGIN_FAILURE_LIMIT = 5;

/**
 * Até quando o e-mail está barrado, ou `null` se ainda pode tentar.
 *
 * A janela é deslizante: em vez de guardar "bloqueado até tal hora", conta as
 * falhas recentes. Cinco falhas às 10h00 barram até as 10h15, quando a mais
 * antiga sai da conta; falhas espalhadas ao longo da hora nunca fecham a
 * porta, que é o comportamento certo para quem só erra a senha de vez em
 * quando.
 *
 * O efeito conhecido é que, passada a janela, sobra uma tentativa a cada
 * quinze minutos. O alvo aqui é a rajada — mil senhas em um minuto —, não o
 * atacante paciente; para esse, o limite por IP é que vai valer.
 */
export function loginLockedUntil(failedAt: readonly Date[], now: Date): Date | null {
  const naJanela = failedAt
    .filter(at => now.getTime() - at.getTime() < LOGIN_FAILURE_WINDOW_MS)
    .sort((a, b) => a.getTime() - b.getTime());

  if (naJanela.length < LOGIN_FAILURE_LIMIT) return null;

  // Para a contagem cair abaixo do limite, esta é a falha que precisa expirar.
  const decisiva = naJanela[naJanela.length - LOGIN_FAILURE_LIMIT];
  return new Date(decisiva.getTime() + LOGIN_FAILURE_WINDOW_MS);
}

/**
 * A mensagem que a pessoa barrada lê.
 *
 * É a mesma para e-mail cadastrado e para e-mail que não existe. Contar
 * também o que não existe custa uma linha e evita que o bloqueio vire um
 * detector de conta: quem varre e-mails receberia "muitas tentativas" só nos
 * que existem, e isso já é a resposta que ele procura.
 */
export function loginLockMessage(until: Date, now: Date) {
  const minutos = Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000));
  return `Muitas tentativas de entrada. Tente de novo em ${minutos} ${minutos === 1 ? "minuto" : "minutos"}.`;
}
