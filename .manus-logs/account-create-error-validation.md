# Diagnóstico — criação de conta financeira

A estrutura real da tabela `financialAccounts` no TiDB foi validada: `id` é auto-incremento, o saldo aceita `DECIMAL(15,2)` e uma inserção com `13.456,76` funciona quando o nome é único. A conta mostrada no erro já possui um registro chamado **Efi Bank** para o usuário, portanto a falha reproduzida é uma violação da chave única `(userId, name)`, não um problema no saldo ou na instituição.

A correção foi validada diretamente pelo roteador tRPC no usuário afetado: uma segunda conta chamada “Efi Bank” agora retorna somente **“Já existe uma conta com esse nome.”**, sem consulta, parâmetros ou detalhes internos. Uma conta temporária com nome único e saldo `13.456,76` foi criada, lida e excluída com sucesso no TiDB.

O formulário corrigido foi reaberto na conta de desenvolvimento sem contas financeiras. O teste visual usará a Efi Bank e o mesmo saldo da captura, seguido de remoção do registro de validação.

Na interface, a seleção **Efi Bank** preencheu corretamente instituição, nome e cor. A digitação `1345676` foi formatada automaticamente como **13.456,76**, reproduzindo os dados da captura.

O envio pela interface foi concluído com sucesso: a conta Efi Bank apareceu com saldo **R$ 13.456,76**, estado ativo e nenhum lançamento vinculado. Em seguida, o formulário foi reaberto para repetir o mesmo nome e verificar a nova mensagem de conflito.

Ao tentar criar uma segunda Efi Bank, o modal permaneceu aberto, destacou o campo de nome e exibiu apenas **“Já existe uma conta com esse nome.”**. Nenhuma consulta SQL, parâmetro interno ou detalhe do driver apareceu na interface.

A conta criada para o teste visual foi removida após a validação. A conta de desenvolvimento voltou a mostrar **0 contas cadastradas** e saldo zero, sem registros técnicos remanescentes.

## Validação final

A auditoria confirmou que não restou nenhuma conta de diagnóstico ou validação no TiDB e que a conta Efi original do usuário afetado permanece única. A suíte final aprovou **34 testes em 9 arquivos**, incluindo o novo teste de erros encapsulados pelo Drizzle, além de tipagem TypeScript e build de produção.
