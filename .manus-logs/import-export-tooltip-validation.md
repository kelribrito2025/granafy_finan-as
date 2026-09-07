# Validação dos tooltips de importação e exportação

A página protegida de Lançamentos carregou corretamente após a alteração. Os botões Importar e Exportar mantiveram seus nomes acessíveis. A primeira simulação de hover por coordenadas não exibiu o tooltip na captura, indicando que a posição do cursor deve ser confirmada pelas dimensões reais do elemento antes da validação final.

Após medir o viewport real (1280 × 1100), o hover no centro do botão Importar exibiu corretamente o tooltip escuro **“Importar OFX ou CSV”** abaixo do botão, com seta centralizada e sem deslocar o layout.
O hover no botão Exportar também exibiu corretamente **“Exportar CSV”** abaixo do botão, com o mesmo estilo e posicionamento.
