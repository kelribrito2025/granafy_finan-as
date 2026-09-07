# Validação — ordenação global dos lançamentos

A causa do comportamento anterior era a aplicação da ordenação dentro de cada grupo diário. A tabela foi ajustada para manter os agrupamentos por data no estado normal e, ao ativar Categoria, Valor, Conta ou Status, reunir todos os lançamentos filtrados em uma única sequência global.

O teste visual usou quatro lançamentos em 01/09, 02/09, 04/09 e 06/09. No primeiro clique em **Valor**, todas as datas foram ordenadas juntas em R$ 100,00, R$ 50,00, R$ 20,00 e R$ 5,00. No segundo clique, a lista inteira foi invertida para R$ 5,00, R$ 20,00, R$ 50,00 e R$ 100,00. A coluna **Data** passa a aparecer automaticamente durante a ordenação global, preservando o contexto de cada linha.
