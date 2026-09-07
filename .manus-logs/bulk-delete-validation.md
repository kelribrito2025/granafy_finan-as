# Validação — exclusão em massa de lançamentos

A falha ocorria antes de qualquer consulta de exclusão: o contrato tRPC aceitava no máximo 500 IDs, enquanto a tela enviou 668. A validação retornava o objeto técnico `too_big` diretamente ao usuário.

A API agora aceita até 20.000 IDs por operação e elimina duplicidades antes da execução. O banco processa os IDs em lotes de 500 dentro de uma única transação, preservando atomicidade: se qualquer lote falhar, nenhum deles é confirmado.

Na interface, a exclusão exige confirmação explícita com a quantidade selecionada, exibe “Excluindo em lotes...” durante a operação, informa a quantidade efetivamente removida e converte eventuais validações técnicas em uma mensagem amigável.

A API foi executada com exatamente 668 IDs associados a um usuário inexistente. O resultado confirmou dois lotes (500 + 168), 668 solicitações aceitas e zero registros removidos, garantindo que o teste não alterou dados reais.
