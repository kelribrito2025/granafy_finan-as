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

/** O que o ator é na empresa aberta. Decide quem pode escrever (Fase B). */
export type Papel = "dono" | "contador";

/**
 * O papel do ator numa empresa, em uma linha — e a linha é o que define a
 * Fase A: dono é quem consta em `companyProfiles.userId`; todo o resto que
 * chegou até a lista visível chegou por vínculo, e é contador.
 */
export function papelDaEmpresa(atorId: number, empresa: { userId: number }): Papel {
  return empresa.userId === atorId ? "dono" : "contador";
}

/**
 * Monta o escopo a partir do contexto do request.
 *
 * É o único lugar do servidor onde as duas chaves se encontram — e é por isso
 * que ele é um lugar só. O tipo é estrutural de propósito: assim este módulo
 * não precisa importar o contexto do tRPC, e o contexto não precisa saber que
 * escopo existe.
 *
 * A PARTIR DA FASE A, o `userId` do escopo é o DONO da empresa aberta — lido
 * de `ctx.companies`, que o contexto já carregou —, e não mais quem está
 * logado. Para o dono, dá o mesmo número de sempre. Para o contador, dá o id
 * do cliente dele: as ~96 guardas continuam filtrando pelo dono, que é o que
 * sempre fizeram, e o ator não entra em WHERE nenhum. Quem está logado fica em
 * `ctx.ator`, para quem precisar registrar QUEM fez — nunca para filtrar.
 *
 * Isso é o dividendo de ter concentrado as duas chaves aqui: mudar como este
 * lugar calcula uma delas muda o sistema inteiro sem tocar nas consultas.
 */
export function escopoDe(ctx: {
  user: { id: number } | null;
  activeCompanyId: number | null;
  companies: readonly { id: number; userId: number }[];
}): Escopo {
  if (!ctx.user || ctx.activeCompanyId === null) {
    /*
     * Não deveria acontecer: `protectedProcedure` já barrou os dois casos antes
     * de qualquer procedure rodar. Lançar aqui é o cinto além do suspensório —
     * o que não pode, de jeito nenhum, é devolver um escopo pela metade e
     * deixá-lo escorrer para dentro de um WHERE.
     */
    throw new Error("Escopo pedido fora de uma procedure autenticada com empresa ativa.");
  }

  const empresa = ctx.companies.find(candidata => candidata.id === ctx.activeCompanyId);
  if (!empresa) {
    /*
     * Também não deveria acontecer: `pickActiveCompany` escolhe a ativa DE
     * DENTRO desta lista. Se ela não está aqui, o contexto foi montado à mão
     * ou a lista mudou por baixo. Cair de volta para `ctx.user.id` seria o
     * pior conserto possível — reintroduziria ator = dono em silêncio, que é
     * exatamente o furo que esta fase fecha. Falhar alto.
     */
    throw new Error("A empresa ativa não está na lista de empresas visíveis do request.");
  }

  return { userId: empresa.userId, companyId: empresa.id };
}
