# Padrão em aberto: a suíte que trava no seeding

Registro de um padrão **não explicado**. Não é um bug conhecido com causa
conhecida — é uma tabela de ocorrências aberta para que a próxima vez tenha
onde encaixar. Quem chegar aqui depois de um `Hook timed out`, acrescenta a
linha antes de investigar.

## O que caracteriza o padrão

Sempre a mesma forma, e é o que separa isso de um teste ruim:

- A falha é **sempre** `Test timed out in 30000ms` ou `Hook timed out in 120000ms`.
  Nunca uma assertiva. Nenhuma ocorrência mostrou um valor errado.
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

A ocorrência 1 é a que faz esta a quarta vez. Ela não tem números porque o log
não sobreviveu à sessão, e a causa dela **foi atribuída depois**: três arreios
compartilhavam o literal `openId 'a'`, e um vitest morto deixava linha órfã que
derrubava o arreio seguinte. Isso foi corrigido (`usuarioDeTeste` +
`arreios.test.ts`) — e as ocorrências 2 a 4 aconteceram **depois** da correção.
Ou seja: a explicação da 1 não explica as outras três.

## O que já foi descartado com medição

- **Vazamento de conexão.** Medido durante a rodada: o vitest mantém de 0 a 3
  conexões, estável, sem crescer. Não é pool esgotando.
- **Arreio novo culpado.** A `empresas.isolation` é nova e travou junto na
  ocorrência 4 — mas o `signupCompany` rodou em 3,36 s na mesma rodada logo
  depois. Não é um arquivo específico.
- **Banco lento em geral.** Medido imediatamente depois da pior ocorrência:
  180 ms por query, normal. Quando a rodada seguinte roda, o banco está bom.

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
