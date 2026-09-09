/*
 * O escopo de uma consulta: o dono e a empresa, juntos e nomeados.
 *
 * A alternativa óbvia seria `getAlgo(userId, companyId, …)`. Não serve, e o
 * motivo é grave: os dois são `number`. `listFinancialAccounts(60001, 1)` e
 * `listFinancialAccounts(1, 60001)` compilam igual, e o TypeScript não tem como
 * saber qual é qual. Numa mudança de 87 pontos, uma transposição é questão de
 * estatística — e o sintoma seria ler os dados de outro dono.
 *
 * Com campos nomeados, transpor vira erro de compilação em vez de vazamento
 * silencioso. Custa uma mudança mecânica maior; paga com a única classe de erro
 * que este projeto não pode cometer.
 *
 * As duas chaves andam sempre juntas, e o `userId` fica para sempre: se um dia
 * a empresa ativa for resolvida errado, ele ainda impede que a conta de outra
 * pessoa apareça. O pior caso vira "vi a minha empresa errada", nunca "vi a
 * empresa de outro".
 */
export type Escopo = {
  userId: number;
  companyId: number;
};

/**
 * Monta o escopo a partir do contexto do request.
 *
 * É o único lugar do servidor onde as duas chaves se encontram — e é por isso
 * que ele é um lugar só. O tipo é estrutural de propósito: assim este módulo
 * não precisa importar o contexto do tRPC, e o contexto não precisa saber que
 * escopo existe.
 */
export function escopoDe(ctx: { user: { id: number } | null; activeCompanyId: number | null }): Escopo {
  if (!ctx.user || ctx.activeCompanyId === null) {
    /*
     * Não deveria acontecer: `protectedProcedure` já barrou os dois casos antes
     * de qualquer procedure rodar. Lançar aqui é o cinto além do suspensório —
     * o que não pode, de jeito nenhum, é devolver um escopo pela metade e
     * deixá-lo escorrer para dentro de um WHERE.
     */
    throw new Error("Escopo pedido fora de uma procedure autenticada com empresa ativa.");
  }
  return { userId: ctx.user.id, companyId: ctx.activeCompanyId };
}
