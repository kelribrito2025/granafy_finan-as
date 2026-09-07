# Validação — ordenação dos lançamentos

Os cabeçalhos **Categoria, Valor, Conta e Status** passaram a exibir o indicador neutro `↕` e são acionáveis por mouse ou teclado. No primeiro clique em **Valor**, o indicador mudou para `↓` e os valores do grupo de 06/09/2026 foram ordenados por magnitude: R$ 100,00, R$ 50,00, R$ 20,00 e R$ 5,00.

No segundo clique em **Valor**, o indicador mudou para `↑` e a ordem foi invertida para R$ 5,00, R$ 20,00, R$ 50,00 e R$ 100,00. Ao clicar em **Categoria**, Valor voltou ao estado neutro e as linhas passaram à ordem alfabética das categorias, confirmando que apenas uma coluna fica ativa por vez.

**Conta** foi ordenada alfabeticamente como Bradesco, Efi e Nubank. **Status** agrupou Pago antes de Pendente. Os quatro cabeçalhos mantêm o mesmo ciclo: primeiro clique aplica a ordem inicial, segundo clique inverte a direção, e o indicador ativo muda entre `↑` e `↓`. As divisões e totais por data permanecem preservados.
