# Validação dos filtros pelos cards

Ao clicar em “Saídas”, o card recebe contorno vermelho de seleção e a tabela mantém somente lançamentos com valores negativos. Os grupos diários e seus totais são recalculados usando apenas as saídas filtradas; o dia 04/09, que possui apenas entrada, deixa de aparecer.

Ao clicar em “Entradas”, a tabela troca diretamente para lançamentos positivos, preservando os grupos 01/09, 04/09 e 05/09 com totais recalculados. Um segundo clique no card ativo remove o filtro e restaura todos os lançamentos. O card “Saldo do período” também restaura a visualização completa. Os cards utilizam `aria-pressed` e contorno verde ou vermelho para comunicar o estado selecionado.
