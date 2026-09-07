# Validação da autenticação local com TiDB

- A conexão TLS com o TiDB Cloud foi validada por teste automatizado.
- O banco `granafy_database` foi criado e as migrations `0000`, `0001` e `0002` foram aplicadas antes do código novo.
- A tela `/login` renderiza corretamente os campos reais de e-mail e senha, preservando a identidade visual.
- A tela `/cadastro` renderiza nome, e-mail, senha e confirmação de senha sem overflow ou cortes em desktop.
- O backend usa tRPC, hash scrypt com salt, comparação em tempo constante e sessão JWT em cookie HTTP-only SameSite Lax.
- O campo `passwordHash` é removido do tipo público e nunca é retornado ao navegador.

O formulário de cadastro aceitou corretamente nome e e-mail, preservou o estado controlado dos campos e manteve o CTA visível. Nenhuma senha ou credencial foi registrada neste relatório.
Os dois campos de senha foram preenchidos e permaneceram mascarados visualmente na interface. O formulário está pronto para envio e nenhuma credencial foi copiada para arquivos do projeto.

O cadastro foi enviado com sucesso, criou uma sessão autenticada e redirecionou ao dashboard. Uma consulta parametrizada confirmou que a conta existe no TiDB com `loginMethod` local e `passwordHash` no formato scrypt; nenhum valor sensível foi impresso.
