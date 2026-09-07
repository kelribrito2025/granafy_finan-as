# Validação do módulo de Balanço Patrimonial

Data da validação: 2026-09-07.

## Fluxo funcional

A rota protegida `/balanco-patrimonial` redirecionou corretamente ao login sem sessão. Após autenticação com a conta de desenvolvimento, o item **Balanço Patrimonial** apareceu nas seções de análise da navegação e abriu a nova página.

Foi cadastrado temporariamente um bem não circulante com valor de aquisição de R$ 15.000,00 e valor atual de R$ 13.500,00. A máscara monetária converteu corretamente as entradas, o TiDB persistiu o registro e os indicadores recalcularam ativos totais e patrimônio líquido para R$ 13.500,00.

A seção **Bens e direitos** listou o registro persistido com data, grupo, tipo, valor contábil e ações de edição, ativação e exclusão. Em seguida foi salva uma posição patrimonial; a aba **Evolução** exibiu o primeiro ponto real e o fechamento correspondente. Tanto o fechamento quanto o bem temporário foram excluídos ao final da validação, deixando a conta sem dados técnicos.

## Validação visual

A página preserva a identidade do painel: Geist Sans, Iconly Outline Curved, botões sem sombra, cards compactos, fundo verde-claro e sidebar fixa sem rolagem interna. O cadastro abre em modal compacto e rolável, com campos organizados em uma ou duas colunas conforme o viewport.

No viewport de 1280 px foi detectado inicialmente um overflow horizontal na aba de evolução. A grade foi movida para o breakpoint 2XL e a medição final retornou `clientWidth = 1280` e `scrollWidth = 1280`, confirmando a correção.

## Validação automática

A suíte final aprovou 53 testes em 11 arquivos, incluindo cálculos de depreciação, caixa, saldos devedores, ativos, passivos, patrimônio líquido, índices e validações de data. A checagem TypeScript e o build de produção também foram concluídos sem erros. O teste TLS confirmou as oito tabelas da aplicação e as colunas patrimoniais no TiDB efetivamente usado.

## Inspeção final

No estado final após a limpeza, a página exibiu ativos totais de R$ 0,00 para a conta de desenvolvimento, não continha o bem técnico temporário e permaneceu sem overflow horizontal (`clientWidth = 1280`, `scrollWidth = 1280`).
