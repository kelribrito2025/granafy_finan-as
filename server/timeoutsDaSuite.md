# Padrão em aberto: a suíte que morre no seeding

Registro de um padrão **não explicado**. Não é um bug conhecido com causa
conhecida — é uma tabela de ocorrências aberta para que a próxima vez tenha
onde encaixar. Quem chegar aqui depois de um `Hook timed out`, acrescenta a
linha antes de investigar.

## O que caracteriza o padrão

Sempre a mesma forma, e é o que separa isso de um teste ruim:

- A falha **nunca é uma assertiva**. Nenhuma ocorrência mostrou um valor errado.
  Até a quarta, era sempre `Test timed out in 30000ms` ou `Hook timed out in
  120000ms`. A quinta trouxe uma segunda forma — `read ECONNRESET`, e em
  seguida `Can't add new command when connection is in closed state` em todo
  teste restante do arquivo. Timeout e conexão derrubada são o mesmo padrão
  visto de dois lados: numa a consulta não volta, na outra o servidor corta.
- Trava **sempre em arreio de isolamento**, os que semeiam duas empresas no
  `granafy_test`. Nunca em teste puro, nunca em `tidb.connection`.
- Trava no `beforeAll`/`beforeEach` — na semeadura, não na verificação.
- Na rodada seguinte, sem mudar nada, passa. A `suite14` fechou verde 57/57
  logo depois da pior ocorrência.

## As ocorrências

| # | quando | duração da suíte | timeouts | arquivo que travou | tempo do arquivo | o que rodava em paralelo (verificado) |
|---|--------|-----------------:|---------:|--------------------|-----------------:|---------------------------------------|
| 1 | sessão anterior, sem log preservado | — | — | `backfillCompanies` (a "intermitência do backfill") | — | não registrado |
| 2 | 09/09 19:42:06 | 268,51 s | 2 | `signupCompany.isolation.test.ts` | 47.146 ms | varredura de mutação encerrada 19:38:24, 3m42s antes |
| 3 | 09/09 21:59:43 | 463,22 s | 2 | `cadastros.isolation.test.ts` | 109.027 ms | varredura de mutação encerrada 21:59:36, **7 segundos antes** |
| 4 | 10/09 00:19:46 | **1846,60 s** | 13 | `cadastros.isolation.test.ts` (11/11) + `empresas.isolation.test.ts` | **1.441.441 ms** (24 min) | nenhuma varredura desde 23:22; produção em uso pelo dono na mesma janela (não medido) |
| 5 | 10/09 08:19:58 | 467,75 s | 0 — **ECONNRESET** | `cadastros.isolation.test.ts` (11/11) | 78.924 ms | dois `ALTER TABLE ADD COLUMN` em produção, **~40 s antes** |
| 6 | 12/09 12:46:19 | 522,92 s | 2 | `signupCompany.isolation.test.ts` | **47.036 ms** | nada medido rodando em paralelo |
| 7 | 12/09 08:56:44 | **707,16 s** | 2 + **ECONNRESET** | `aperto.isolation.test.ts` (9/9) | **258.695 ms** | a rodada seguinte à sexta, sem nada entre as duas |

A ocorrência 1 é a que faz esta a quarta vez. Ela não tem números porque o log
não sobreviveu à sessão, e a causa dela **foi atribuída depois**: três arreios
compartilhavam o literal `openId 'a'`, e um vitest morto deixava linha órfã que
derrubava o arreio seguinte. Isso foi corrigido (`usuarioDeTeste` +
`arreios.test.ts`) — e as ocorrências 2 a 4 aconteceram **depois** da correção.
Ou seja: a explicação da 1 não explica as outras três.

### A quinta, em detalhe

O ponto exato da morte: `INSERT INTO companyProfiles` no `semear`
(`cadastros.isolation.test.ts:99`), 77,5 s pendurado e então `ECONNRESET`. Os
outros dez testes do arquivo caíram em 1 ms cada, sobre a conexão já fechada.

Ela parecia resolver o mistério: a tabela do INSERT era **a mesma** que a
migration da Fase 7 tinha acabado de alterar em produção, quarenta segundos
antes, e o schema do TiDB é versionado no cluster inteiro, não por banco.

**E a hipótese caiu no teste.** O arquivo sozinho passou em 69,1 s. Depois
passou de novo, em 70,1 s, com 120 ciclos de `CREATE TABLE` + `ALTER TABLE ADD
COLUMN` + `DROP TABLE` rodando no `granafy_test` durante a rodada inteira — 360
comandos DDL concorrentes, e nem um segundo de diferença. DDL no cluster não
derruba consulta concorrente. A vizinhança da migration foi coincidência.

O que a quinta acrescenta de verdade é outra coisa: o mesmo arquivo leva 69 s
sozinho, 78,9 s dentro da suíte cheia, 109 s na terceira ocorrência e 1.441 s na
quarta. **O que degrada é a suíte inteira em paralelo**, não o arquivo.

### A primeira repetição — e o que ela é de verdade

A sexta é a mesma da segunda: mesmo arquivo, **mesmo teste** — "a conta nova
nasce com exatamente uma empresa" —, e o arquivo levando 47.036 ms contra
47.146 ms. Na primeira leitura isso pareceu um limite configurado escondido em
algum lugar. Não é, e vale deixar escrito por que não:

    30.008 ms  o teste que morreu, no timeout do vitest
     3.309 ms  nenhuma categoria-padrão nasce sem empresa
     3.665 ms  as categorias apontam para a empresa daquela conta
     5.072 ms  entrar de novo recria a empresa que faltar
    ─────────
    47.036 ms  o arquivo

Os 47 s são 30 s de timeout mais quatro testes determinísticos que levam o
mesmo tempo toda vez. A "repetição exata" é aritmética, não pista.

O que sobra, e é real: **nas duas vezes morreu o PRIMEIRO teste do arquivo** —
o primeiro a rodar depois do `beforeAll` que semeia. Na rodada verde ele leva
3,3 s. Então não é "o arquivo fica lento"; é uma consulta específica, a
primeira depois da semeadura, que trava enquanto as seguintes andam normal. É
a mesma forma da quinta ocorrência, em que o `INSERT` do semear morreu e os
testes seguintes caíram em 1 ms sobre a conexão fechada.

Isso aponta para a **primeira ida ao banco depois de um lote grande de
escrita** — e não para o cluster em geral, que responde normal um segundo
depois. O que investigar na próxima: instrumentar o `beforeAll` e o primeiro
teste com `console.time`, para saber se o tempo vai na semeadura, no
`await` de conexão ou na primeira consulta de leitura.

### A sétima: duas seguidas, e o banco lento a rodada inteira

Veio logo depois da sexta, na rodada de confirmação. Morreu no `DELETE` do
`limparTabelas` — a limpeza do `beforeEach` —, com `ECONNRESET`, dois hooks
estourando os 120 s e os seis testes restantes caindo em 1 ms sobre a conexão
fechada. É a quinta ocorrência outra vez, com o verbo trocado: lá o `INSERT` do
semear, aqui o `DELETE` do limpar. **Sempre uma escrita de preparação.**

E um dado que contradiz uma linha da lista de descartados: a suíte inteira levou
707 s, contra 450–500 s de uma rodada normal, e os quatro arreios pesados foram
todos mais lentos — `conciliacao.isolation` 102 s, `empresas.isolation` 93 s.
"Banco lento em geral" foi descartado medindo DEPOIS da quarta ocorrência,
quando ele já tinha se recomposto. Durante esta, ele estava lento sim, para
todo mundo. O descarte continua valendo para o que mediu; não vale como "o
banco nunca está lento quando isso acontece".

Duas seguidas mudam a regra prática: repetir a rodada não é mais resposta. A
próxima rodada cheia só depois de instrumentar o `beforeAll`/`beforeEach` com
tempo por comando, para a ocorrência seguinte dizer ONDE o tempo foi — e não só
que foi.

## O que já foi descartado com medição

- **Vazamento de conexão.** Medido durante a rodada: o vitest mantém de 0 a 3
  conexões, estável, sem crescer. Não é pool esgotando.
- **Arreio novo culpado.** A `empresas.isolation` é nova e travou junto na
  ocorrência 4 — mas o `signupCompany` rodou em 3,36 s na mesma rodada logo
  depois. Não é um arquivo específico.
- **Banco lento em geral.** Medido imediatamente DEPOIS da quarta ocorrência:
  180 ms por query, normal. Vale para o que mediu — a sétima mostrou a rodada
  inteira lenta enquanto acontecia. Ver acima.
- **DDL no cluster.** Falsificado com experimento, não com raciocínio: 360
  comandos DDL concorrentes não mudaram o tempo do arreio em nada. Ver a quinta
  ocorrência acima.

## A hipótese que sobrou, e não foi testada

`granafy_test` e a produção moram no **mesmo cluster TiDB Cloud Serverless**.
Serverless cobra e limita por Request Unit no cluster inteiro, não por schema.
As três ocorrências com log ficam perto de consumo pesado nesse cluster — duas
delas a minutos de uma varredura de mutação (que roda o mesmo arreio dezenas de
vezes, semeando tudo de novo em cada mutação), e a quarta na janela em que a
produção estava sendo usada de verdade.

Isso explicaria a forma da falha melhor que qualquer bug de código: o que trava
é sempre o `INSERT` em lote da semeadura, o item mais caro em RU de toda a
suíte; e passa a andar de novo quando a cota se recompõe, sem mudar uma linha.

**Como confirmar ou derrubar, quando acontecer de novo:** olhar o gráfico de
Request Units do cluster no console da TiDB Cloud na janela da rodada. Se houver
throttling ali, o padrão fecha e a resposta é não rodar varredura e suíte no
mesmo cluster ao mesmo tempo. Se o consumo estiver folgado, a hipótese cai e
volta a ser um mistério — e aí o próximo passo é instrumentar a semeadura para
registrar quanto cada `INSERT` levou.

Enquanto não fechar: **intermitência não se commita, se investiga.** Uma rodada
vermelha por timeout não bloqueia o commit se a rodada limpa seguinte fechar
verde, mas a ocorrência entra nesta tabela antes do commit sair.
