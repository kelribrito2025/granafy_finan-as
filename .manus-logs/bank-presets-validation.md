# Validação — instituições bancárias sugeridas

O formulário “Nova conta” agora exibe quatro opções compactas na primeira linha: **Efi Bank**, **Conta Simples**, **CloudWalk** e **Outro**. A opção Outro começa selecionada e revela o campo “Nome da instituição”, permitindo cadastrar qualquer banco não listado. O modal permanece totalmente visível em 1400 × 720, preserva a identidade visual do dashboard e não utiliza sombras nos botões.

Ao selecionar **Efi Bank**, o campo personalizado desaparece, o nome da conta é preenchido inicialmente como “Efi Bank” e a cor muda para a identidade sugerida, permanecendo livre para edição. Ao selecionar **Outro**, os campos de instituição e nome são liberados novamente e os valores preenchidos automaticamente são removidos, sem criar registros no banco durante o teste.

Após a atualização automática do servidor, a página voltou ao estado limpo sem criar conta nem preservar dados temporários do modal.

Na versão final recarregada, **Efi Bank** voltou a preencher nome e cor automaticamente, com indicação visual clara de seleção e sem alterar o tipo ou saldo inicial.

A opção **Outro** restaurou corretamente a cor padrão verde `#12B85C`, exibiu o campo de nome da instituição e limpou os valores automáticos. O cancelamento retornou à lista vazia; nenhuma conta de teste foi salva.
