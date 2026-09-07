# Validação — categoria automática por crédito e débito

O importador passou a exibir dois campos distintos e semanticamente coloridos: **Categoria para entradas · Receitas** e **Categoria para saídas · Despesas**. Cada seletor lista somente categorias compatíveis com a natureza correspondente.

Na conta de desenvolvimento, a única conta disponível foi pré-selecionada. As categorias também foram preenchidas automaticamente com **Outras Receitas** para créditos e **Custos Operacionais** para débitos. Nenhum lançamento foi importado nesta etapa.

O OFX misto foi carregado e revisado sem gravação. O crédito de **R$ 1.250,00** apareceu automaticamente como **Receita → Outras Receitas**, e o débito de **R$ 89,90** apareceu como **Despesa → Custos Operacionais**. Na linha de receita, o seletor mostra apenas as cinco categorias de entrada; na linha de despesa, apenas as categorias de saída.

A categorização manual por linha também foi validada: o crédito foi ajustado para **Receitas Operacionais/Prestação de Serviços** e o débito para **Despesas Financeiras/Tarifas Bancárias e de Cartão**. A natureza e o sinal dos valores permaneceram corretos. O botão final de importação não foi acionado.

## Validação final

O roteador tRPC recebeu o mesmo OFX misto com as categorias específicas escolhidas e confirmou a associação correta de sinal, natureza e categoria sem persistir lançamentos. A conta e o arquivo temporários foram removidos; após recarregar, o importador voltou a mostrar zero contas, comprovando a limpeza. A suíte final aprovou **39 testes**, além da tipagem e do build de produção.
