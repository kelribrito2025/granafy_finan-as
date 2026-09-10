# Fase 7 — o cadeado

A fase que fecha a multiempresa. A Fase 4 pôs a guarda de empresa no código, a
Fase 5 apertou o banco, a Fase 6 pôs a empresa na tela. A Fase 7 tapa o que
sobrou — e o que sobrou eram três coisas que ninguém tinha notado.

## Feito

### As duas colunas (aplicadas em produção, com o dono acompanhando)

`ADD COLUMN` em `companyProfiles`, 365 ms e 383 ms, 11 empresas inalteradas,
conferência lida linha por linha depois. A migration foi ensaiada no
`granafy_test` — não por mim: `prepararSchemaDeTeste` aplica cada arquivo de
`drizzle/` uma vez, com diário próprio, então a rodada seguinte à criação do
arquivo aplicou os dois comandos verbatim e os 560 testes fecharam verde sobre
o schema já alterado.

### 1. As boas-vindas passam a ser por empresa

`companyProfiles.onboardingCompletedAt`. A Fase 6 tinha resolvido isso por
comparação de datas para não pedir migration no meio da fase, e deixou a
limitação escrita: concluir o fluxo numa empresa empurrava o `completedAt` do
LOGIN para agora, e todas as empresas criadas antes daquele instante paravam de
oferecer o assistente. Quem criasse três de uma vez e passasse pelo fluxo de uma
perdia a oferta nas outras duas.

A ordem das perguntas é o que faz a regra funcionar:

1. Esta empresa tem dado dentro? Então não precisa, e ponto.
2. Esta empresa já passou pelo fluxo? A coluna dela responde.
3. A coluna está nula? É empresa anterior à Fase 7 — e aí a comparação de datas
   antiga responde por ela, exatamente como respondia.

`users.onboardingCompletedAt` fica de pé e **sem escritor**. Voltar a escrever
ali ressuscitaria a limitação, porque o passo 3 de uma empresa antiga passaria a
ver a conclusão de uma empresa nova.

### 2. O catálogo de categorias passa a ser por empresa

`companyProfiles.categoryDefaultsVersion`. Este era um furo com prazo, não uma
melhoria: a versão morava em `users`, e `ensureDefaultTransactionCategories`
pedia a empresa padrão, inseria as categorias novas nela e carimbava o LOGIN. Com
duas empresas, a primeira recebia o catálogo novo, o login passava a constar
atualizado, e a segunda ficava sem ele **para sempre** — sem erro, sem aviso, e
descoberto só na hora de escolher categoria num lançamento.

A coluna nasce em 0 inclusive nas empresas que já têm tudo, e isso é decisão, não
descuido: o `onDuplicateKeyUpdate` contra `transaction_categories_company_name_uidx`
não toca na categoria que já existe — em especial no `isActive` dela —, então a
primeira passada por empresa antiga não insere nada e não ressuscita o que
alguém desativou. Nascer em 0 é o que faz a coluna **consertar** quem ficou
atrás em vez de só registrar o presente.

Uma transação por empresa, e não uma para todas: se a terceira falhar, as duas
primeiras já estão prontas e a chamada seguinte retoma da terceira.

### 3. A lista de quem pode receber `userId` cru está fechada

Dez funções, por nome, com o motivo de cada uma escrito ao lado, em
`guardas.test.ts`. `userId: number` no lugar de `escopo: Escopo` não é erro por
si — `listCompanies` não poderia receber uma empresa para listar empresas. O
risco é uma função **nova** nascer por login e tocar tabela que tem empresa, que
é precisamente o que aconteceu no item 2 e não fez ruído nenhum.

Meu `grep` achou sete dessas funções. A rede achou dez: `garantirEmpresaPadrao`,
`createPasswordResetRequest` e `completePasswordReset` têm assinatura em várias
linhas e passaram batido.

### 4. O número memorizado

O comentário do `createCompany` dizia "as cinquenta categorias". O catálogo tem
56. O arreio já comparava com `DEFAULT_TRANSACTION_CATEGORIES.length`; o
comentário é que tinha ficado atrás.

### A guarda que existia sem prova

A varredura desta leva teve uma **parada obrigatória**, e ela vale mais que os
quatro itens acima: apagar `eq(companyProfiles.userId, userId)` de
`garantirEmpresaPadrao` deixava a suíte **inteira verde**.

Sem esse filtro, o SELECT devolve a primeira empresa da tabela, de quem for. Um
login sem empresa passaria a "ter" a empresa de outra pessoa no login seguinte —
e no cadastro, que chama a mesma função dentro da transação, as 56
categorias-padrão do recém-chegado seriam inseridas dentro da empresa de um
estranho.

A guarda estava certa desde sempre. O que faltava era teste: todos os outros
arreios criam empresa por `createCompany`, que não passa por ali. Dois testes
novos, e a mutação morreu.

O detalhe que fecha a ironia: `garantirEmpresaPadrao` é um dos dez nomes que eu
tinha acabado de autorizar a receber `userId` cru, com a justificativa de que é
legitimamente por login. Era — e a guarda que a torna segura não tinha prova
nenhuma.

## Aberto

### As chaves estrangeiras — PENDÊNCIA DECIDIDA, sem data

Não é esquecimento e não é indecisão: é uma sentada própria, adiada pelo dono,
a ser marcada por ele. Nada foi montado nem ensaiado, de propósito.

**O que é:** 13 tabelas têm `companyId` e o schema declara **zero**
`references()`. Hoje nada no banco impede uma linha apontar para empresa que não
existe — só o código impede. Esse é o cadeado de verdade.

**O terreno está pronto:** a Fase 5 deixou órfãs em 0 e dono cruzado em 0, e os
índices por empresa cobrem a exigência de coluna indexada que cada FK tem. A
conferência será refeita na hora, antes do primeiro comando.

**O que a data precisa ter**, em ordem:

1. **Backup do dia com Succeeded**, conferido no console. Não negociável:
   `ADD CONSTRAINT` é o primeiro comando do projeto que pode RECUSAR com o banco
   cheio, porque uma única linha órfã derruba a validação.
2. **~45 min do dono**, acompanhando bloco a bloco.
3. **Não estar no meio de um fechamento de mês** — não por risco técnico, mas
   para que parar no meio seja uma opção sem custo.

**Não precisa de janela de baixa.** Isso foi medido, e contra a minha própria
recomendação anterior: 360 comandos DDL concorrentes no cluster não mudaram em
nada o tempo de um arreio rodando junto. Ver `timeoutsDaSuite.md`.
