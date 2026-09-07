# Validação — máscara monetária automática

O formulário de conta abriu com o saldo inicial normalizado em `0,00`. O campo continua compacto, usa teclado decimal em dispositivos móveis e seleciona todo o conteúdo ao receber foco para facilitar a substituição por novos dígitos.

A digitação foi validada no navegador: `100` tornou-se imediatamente `1,00` e `1000` tornou-se `10,00`, sem perder o foco nem exigir saída do campo.

Seguindo o padrão monetário brasileiro e a regra de centavos, `35678` tornou-se `356,78`. Para representar trinta e cinco mil seiscentos e setenta e oito reais, `3567800` tornou-se `35.678,00`, usando ponto para milhar e vírgula para centavos.

O modal de **Novo lançamento** também abriu com o campo Valor normalizado em `0,00`, confirmando que saldo inicial e lançamentos usam o mesmo componente lógico de formatação.

No campo Valor do lançamento, `1234567` tornou-se `12.345,67` durante a digitação. O modal foi cancelado em seguida e nenhum lançamento de teste foi persistido.
