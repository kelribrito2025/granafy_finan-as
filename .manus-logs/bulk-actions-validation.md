# Validação — ações em lote nos lançamentos

Ao selecionar um lançamento, surgiu uma barra branca compacta acima dos cartões de resumo, com **Marcar como pago**, **Editar** e **Excluir** à esquerda e “1 item selecionado” à direita. Os botões usam contornos finos e não possuem sombra; a ação de pagamento é verde, edição neutra e exclusão vermelha, alinhadas à identidade do painel.

Com dois lançamentos marcados, a contagem mudou para “2 itens selecionados”. **Editar** abriu um modal compacto informando a quantidade e permitindo alterar somente os campos desejados: status, data, conta, categoria e recorrência. Como os dois registros eram despesas, apenas categorias compatíveis com saídas foram listadas. Nenhuma alteração foi aplicada nesta inspeção visual.

A ação **Marcar como pago** foi executada nos dois registros temporários. A barra desapareceu após a conclusão, o sistema confirmou “2 lançamentos marcados como pago” e ambos os indicadores de status mudaram de Pendente para Pago, comprovando a atualização persistente em lote.

## Verificação final

A API aceita até 20.000 IDs, remove duplicidades e processa atualizações em lotes de 500 dentro de uma única transação. O teste ponta a ponta alterou data, recorrência e status de dois registros, confirmou que o terceiro não selecionado permaneceu intacto e removeu toda a amostra técnica. A suíte final aprovou 47 testes, tipagem e build; a página voltou ao estado real vazio da conta de desenvolvimento.
