# Validação — categorias padrão

A conta autenticada passou a exibir **45 categorias ativas**. A aba Categorias carregou todos os nomes extraídos das imagens, preservando a hierarquia textual com `/`, classificando cada item como **Saída** e usando cores consistentes por grupo. Os registros aparecem disponíveis para edição, desativação e exclusão conforme as regras atuais do sistema.

No formulário de novo lançamento, o catálogo respeita o tipo financeiro: como todas as categorias fornecidas representam despesas, elas não aparecem quando **Entrada** está selecionada e serão exibidas ao escolher **Saída**.

Ao selecionar **Saída**, o seletor passou a listar as 45 categorias, incluindo Custos Operacionais, Despesas Fixas, Despesas Financeiras, Despesas Variáveis e Impostos. O modal foi cancelado após a inspeção e nenhum lançamento de teste foi criado.

## Banco e ciclo de vida

O catálogo versionado foi aplicado uma única vez às **4 contas existentes**, com 45 categorias por conta. Um cadastro técnico temporário confirmou que toda conta nova recebe as mesmas 45 categorias dentro da própria transação de criação; essa conta e seus registros foram removidos ao final. A versão gravada no usuário impede que categorias excluídas manualmente sejam recriadas em logins futuros. A suíte final aprovou **32 testes**, incluindo conexão TLS, integridade do catálogo, tipagem e build de produção.
