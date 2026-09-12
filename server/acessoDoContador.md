# Estudo — acesso do contador

Ainda não é código. É o levantamento do que existe hoje, o que muda, o que NÃO
muda, e em que ordem fazer. Números conferidos no repositório em 12/09/2026.

## O que existe hoje

- `Escopo = { userId, companyId }`, montado num lugar só (`escopoDe`, em
  `server/escopo.ts`).
- **96 funções** de `db.ts` recebem `escopo: Escopo` — a Fase 4 tinha 87.
- **11 funções** podem receber `userId` cru, e a lista é FECHADA por nome dentro
  da sentinela. Acrescentar uma é decisão explícita, não efeito de assinatura.
- **54 mutações** e **35 consultas** em 12 routers, com ~215 chamadas a
  `escopoDe(ctx)`.
- 3 tipos de procedure: `publicProcedure`, `protectedProcedure`, `adminProcedure`.
- 11 suítes de isolamento, 48 arquivos de teste no total.
- Anexos moram em `{pasta}/{userId}/…` e a posse é conferida em dois caminhos
  (`storageProxy` e o tRPC de assinatura de URL).
- Exportação de CSV é **do navegador**: `URL.createObjectURL` sobre um Blob, em
  seis telas. O servidor não vê exportação nenhuma acontecer.

## 1. Modelo — separar QUEM PERGUNTA de DE QUEM É O DADO

Hoje as duas coisas são o mesmo número. `escopo.userId` é o dono da linha E o
usuário da sessão, porque até agora não existia caso em que fossem diferentes.

A mudança é essa, e só essa:

```
hoje:    escopoDe(ctx) → { userId: ctx.user.id,      companyId: cookie }
depois:  escopoDe(ctx) → { userId: DONO_DA_EMPRESA,  companyId: cookie }
```

O `ator` (quem está logado) passa a viver ao lado, em `ctx.ator`, e não entra em
WHERE nenhum. O `userId` do escopo continua sendo o dono — que é exatamente o
que as 96 guardas já filtram.

**Quantas guardas mudam: zero.** Nenhum WHERE é reescrito, nenhuma das 96
assinaturas muda, nenhum dos ~215 `escopoDe(ctx)` muda de forma. O que muda é
como aquele único lugar calcula o `userId`. É o dividendo de ter concentrado as
duas chaves em uma função só — a decisão da Fase 4 paga aqui.

### A tabela de vínculo

`companyAccess` — login × empresa × papel:

| coluna | por quê |
|---|---|
| `userId` | o ATOR: quem recebe acesso |
| `companyId` | a empresa liberada, uma linha por empresa |
| `papel` | enum `contador` por ora; o enum é o lugar onde papéis futuros entram |
| `grantedBy` | quem liberou — o dono, para o registro fazer sentido |
| `createdAt` / `revokedAt` | revogar é carimbar, não apagar: o histórico fica |

Uma linha por empresa, e não "acesso à conta do dono": é isso que permite ao
dono liberar duas das suas quatro empresas. Revogação é `revokedAt` preenchido,
e toda leitura filtra por `revokedAt IS NULL`.

**Propriedade continua onde está.** `companyProfiles.userId` segue sendo o dono,
e não vira linha de `companyAccess`. Dois motivos: não precisa de backfill (o
ritual fica CREATE puro) e o dono nunca pode perder acesso por causa de uma
linha de vínculo que alguém apagou.

`listCompanies(userId)` passa a ter uma irmã: `empresasVisiveisPara(atorId)` =
as próprias UNION as liberadas. É ela que alimenta `ctx.companies`, que alimenta
`pickActiveCompany`, que já confere posse contra essa lista em todo request.

### Como a sentinela passa a vigiar o papel

A sentinela de hoje lê `db.ts` e prova paridade de guardas. Ela ganha um segundo
alvo — `server/routers/` — e três invariantes novas:

1. **Toda `.mutation(` é construída sobre `escritaProcedure`.** Uma mutação nova
   escrita sobre `protectedProcedure` quebra a suíte. É a mesma técnica do
   `,[ \t]+\)`: pegar a forma do acidente, não a intenção.
2. **`escopoDe` não é chamado fora de `escopo.ts` com `ctx.user.id` literal.**
   Impede alguém remontar o escopo à mão e reintroduzir o ator no WHERE.
3. **A lista de funções por `userId` cru continua fechada**, e ganha a exigência
   extra: nenhuma delas pode ser chamada com o id do ATOR.

## 2. Como garantir que o contador NÃO escreve

Três camadas, e a primeira sozinha já resolve o caso honesto. As outras duas
existem porque a primeira depende de alguém lembrar.

**Camada 1 — o tipo.** `escritaProcedure = protectedProcedure + middleware que
recusa se `ctx.papel !== "dono"`. As 54 mutações migram para ela. Uma chamada de
contador a qualquer mutação devolve FORBIDDEN antes de a procedure rodar.

**Camada 2 — a sentinela.** A invariante 1 acima. Sem ela, a camada 1 protege
as 54 mutações de hoje e nenhuma das de amanhã.

**Camada 3 — o banco.** Opcional, e a decisão é sua: um usuário MySQL só-leitura
para a conexão do contador seria a garantia que não depende de código nenhum.
Custa uma segunda pool e complica o `getDb`. Minha recomendação é deixar fora da
v1 e reavaliar depois — as duas primeiras camadas já são estruturais, e a
terceira é a única que não dá para esquecer, mas também é a única que pode
derrubar o produto inteiro se a pool for escolhida errado.

**Esconder botão não entra na conta.** A tela do contador esconde o que ele não
pode fazer porque botão que dá erro é pior que botão nenhum — mas o servidor
recusa igual se a chamada vier do console do navegador.

## 3. Migrations e ritual

Duas, as duas **CREATE puro**, nenhum ALTER em tabela existente:

1. `companyAccess` — o vínculo descrito acima.
2. `accessLog` — quando o ator entrou, em qual empresa, e o que exportou.

`users.role` **não muda**. Ela é global ('user' | 'admin') e continua sendo. O
papel do contador é por empresa e mora no vínculo — confundir os dois eixos
daria a um contador o `adminProcedure`, que ignora empresa por desenho.

Ritual de sempre: geradas com `DATABASE_URL` apontando para o vazio, ensaiadas
no `granafy_test` pelo `prepararSchemaDeTeste`, backup do dia conferido no
console antes, aplicadas com você acompanhando, checklist depois. As duas podem
ir juntas — são CREATE, não tocam em dado existente.

## 4. Plano em fases

Cada uma é deployável sozinha e não muda nada visível até a Fase C.

**Fase A — o ator sai de dentro do escopo.** `ctx.ator` nasce, `escopoDe` passa
a resolver o dono pela empresa, `empresasVisiveisPara` nasce devolvendo só as
próprias. Migration 1 aplicada, tabela vazia. Nenhuma tela muda.
*Tamanho: pequeno-médio.* Toca `escopo.ts`, `context.ts`, `db.ts` (uma consulta
nova) e as 11 suítes de isolamento, que ganham uma terceira persona: o contador
que não tem vínculo e não pode ver nada.

**Fase B — a tranca da escrita.** `escritaProcedure`, as 54 mutações migradas, a
invariante nova na sentinela. Nenhuma tela muda, e nenhum contador existe ainda
— é de propósito: a tranca é provada antes de haver o que trancar.
*Tamanho: médio, mas mecânico.* 12 arquivos de router, uma linha cada mutação.

**Fase C — o dono libera.** Configurações → Acessos: convidar, escolher
empresas, listar, revogar. Convite por e-mail (ver abaixo). Migration 2 ainda
não precisa.
*Tamanho: médio.* Uma tela nova, um router novo, o fluxo de convite.

**Fase D — o contador entra e vê.** O seletor de empresas já serve: ele lista o
que `ctx.companies` traz, e na Fase A isso passou a incluir as liberadas. A tela
esconde Assinatura, Usuários, Configurações e todo botão de escrita.
*Tamanho: médio.* Nenhuma consulta nova — as telas de leitura já existem.

**Fase E — o registro.** Migration 2, gravação na entrada e na troca de empresa,
a tela do dono. Exportação entra como aviso do cliente, com a limitação escrita
(ver risco 5).
*Tamanho: pequeno-médio.*

## 5. Fora da v1 — lista explícita

- Contador escrevendo qualquer coisa: lançar, conciliar, fechar mês, anexar.
- Contador convidando outro contador.
- Papéis além de `contador`: sócio, financeiro, somente-um-relatório.
- Convite de sócio, e qualquer papel que escreva.
- Escolher POR RELATÓRIO o que o contador vê. Na v1 é tudo-ou-nada por empresa.
- Contador criando empresa, mesmo que para o próprio escritório.
- Prazo de validade automático do acesso.
- Exigir 2FA do contador.
- Notificar o dono por e-mail a cada acesso.
- Usuário MySQL só-leitura (camada 3 da pergunta 2).
- Marca d'água ou rastro em PDF/CSV exportado.

## 6. Riscos — onde um deslize mostra a empresa errada

**1. O anexo é por LOGIN, não por empresa.** `{pasta}/{userId}/…` e
`ownsAttachment(user.id, key)`. Hoje bate porque ator e dono são o mesmo. Se a
conferência for relaxada para "o dono da empresa aberta", o contador liberado
para a empresa A alcança o comprovante da empresa B do mesmo dono — e o
`storageProxy` entrega o arquivo direto, fora do tRPC. **É o maior risco do
projeto.** O conserto que não mexe em arquivo existente: resolver o anexo até a
linha (lançamento ou item) e conferir o `companyId` dela; a chave continua como
está. Fase D não sobe sem isso.

**2. `ctx.companies` virou superfície de segurança.** Ela alimenta
`pickActiveCompany`, que é quem recusa o cookie de empresa alheia. Se
`empresasVisiveisPara` devolver uma linha a mais — vínculo revogado que entrou,
JOIN sem filtro — o cookie passa a ser aceito e todas as 96 guardas obedecem,
porque para elas está tudo certo. A consulta do vínculo precisa do mesmo tipo de
arreio que as guardas têm.

**3. `saldosDeCaixaPorEmpresa`.** É a única função da lista fechada que toca
tabela com empresa, e ela agrega TODAS as empresas de um `userId`. Chamada com o
id do ator não devolve nada; chamada com o id do dono devolve as empresas dele
INTEIRAS, inclusive as não liberadas. É a consulta do seletor de empresas — a
mesma tela que o contador vai usar.

**4. `adminProcedure` ignora empresa por desenho.** Um contador que por engano
recebesse `users.role = 'admin'` veria o sistema inteiro. Por isso o papel do
contador não pode morar em `users.role`, e por isso a tela de Acessos nunca
escreve nessa coluna.

**5. O registro de exportação é declaratório, não provado.** O CSV é montado no
navegador em seis telas; o servidor não participa. O aviso que o cliente manda é
melhor que nada e vale para uso honesto, mas não é evidência: quem chamar a API
direto lê o mesmo dado sem registrar. O que É provável de registrar com
honestidade é a ENTRADA e a troca de empresa, que passam pelo servidor. A tela
do dono precisa dizer essa diferença, senão ela promete uma auditoria que não
tem.

**6. As 11 suítes de isolamento assumem ator == dono.** Todas elas. Enquanto a
terceira persona não entrar nelas, elas continuam verdes e não provam mais o que
o produto precisa.

## Convite por e-mail, não senha cadastrada pelo dono

Você perguntou qual é mais seguro. É o convite, por quatro motivos, e o primeiro
é o que decide sozinho:

1. **Senha que o dono digita é senha que o dono sabe.** A partir daí todo acesso
   registrado em nome do contador é negável — "o dono tinha minha senha". O
   registro de acesso, que é um dos entregáveis que você pediu, perde o valor no
   mesmo movimento.
2. **A senha teria que viajar.** WhatsApp, e-mail, papel. Nenhum desses caminhos
   é seu.
3. **O convite prova o e-mail**, que é justamente a identidade que o registro
   vai nomear.
4. **Contador já tem login.** Ele atende vários clientes; o convite liga o
   vínculo ao login que já existe, em vez de criar uma conta por cliente.

Forma: token de uso único, 7 dias, guardado como hash, que só vale para o e-mail
convidado. Quem já tem login aceita e ganha o vínculo; quem não tem cria a senha
no aceite. Reenviar invalida o anterior. Nada disso é novo aqui — é o mesmo
desenho do código de redefinição de senha que já está no ar.
