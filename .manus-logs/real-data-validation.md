# Validação de dados reais

A conta autenticada abriu `/lancamentos` sem qualquer registro fictício: os três resumos e o rodapé mostraram R$ 0,00, e a tabela exibiu o estado vazio “Nenhum lançamento salvo neste mês”. A sidebar indica conexão com TiDB Cloud. O modal de novo lançamento informa explicitamente que os dados serão salvos no banco e contém tipo, data, valor, contato, categoria, conta, status e recorrência.

O teste de criação iniciou com descrição e valor preenchidos no modal real. O preenchimento múltiplo não foi suportado pelo navegador conectado, então a validação prosseguiu por campos individuais sem alterar a implementação.

Durante o preenchimento do registro temporário, a extensão My Browser deixou de responder em duas operações. A validação foi concluída pelo mesmo roteador tRPC usado pela interface: criação, leitura, atualização, mudança de status, duplicação, isolamento entre usuários e exclusão foram confirmados contra o TiDB. Todos os registros temporários foram removidos. A captura WebDev sem cookie de sessão mostrou corretamente a tela de login, confirmando que as rotas financeiras continuam protegidas.

A sessão autenticada reabriu o dashboard final com todos os indicadores financeiros em zero, gráfico sem barras fictícias, estado vazio em últimos lançamentos e receita por categoria, e contadores de pendências zerados. Foi identificado um último bloco estático de “Contas conectadas” na sidebar; ele será removido para não sugerir saldos bancários que ainda não foram cadastrados.

## Verificação visual final

O dashboard autenticado agora mostra “Banco conectado · TiDB Cloud”, caixa, entradas, saídas, contas a pagar/receber, margem, pendências e gráfico todos derivados da API. Na ausência de registros, o painel exibe zeros e a mensagem “Sem histórico de movimentações”, sem barras ou contas bancárias fictícias. A página de lançamentos continua compacta, apresenta o mês na mesma linha do título, resumos em zero e estado vazio real após a limpeza do teste.
