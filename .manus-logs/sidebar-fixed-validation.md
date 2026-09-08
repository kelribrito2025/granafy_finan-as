# Validação — sidebar recolhida fixa e tooltips

A barra recolhida foi retirada do fluxo rolável e colocada em um contêiner `position: fixed`, com reserva de 76 px no layout para o conteúdo não deslocar. A inspeção do DOM confirmou posição fixa, `top: 20px` e camada `z-index: 70`. Os tooltips usam `z-index: 90`, acima dos cards, e o painel do modo hover usa `z-index: 80` dentro da camada elevada da sidebar.

Foi criada temporariamente uma página de 2.600 px apenas no DOM de teste. Ao rolar **800 px**, o rail permaneceu exatamente em `top: 20px`, comprovando que não acompanha o conteúdo. O DOM foi restaurado ao final. A inspeção visual manteve a coluna recolhida alinhada à esquerda e reservou corretamente seu espaço no dashboard.

No hover real sobre **DRE**, após o atraso previsto de 400 ms, o botão permaneceu em `:hover`, o tooltip atingiu opacidade `1`, ocupou a área entre `x=92` e `x=139` e manteve `z-index: 90`. Como o rail inteiro está na camada fixa `70`, ele fica acima dos cards da página; `pointer-events: none` preserva a interação com o ícone.

A captura final mostrou o texto **DRE** renderizado na frente do card verde de Caixa, confirmando que o tooltip não fica mais escondido pelo conteúdo.

## Validação técnica

Foram aprovados 257 testes em 26 arquivos, a checagem TypeScript, o build de produção e `git diff --check`. Nenhum comando de banco ou migration foi executado.
