# Fase 5 · aplicada em produção

Foram **dez** índices, não quatro. Os arreios da Fase 4 encostaram em quatro; o
censo do schema achou dez únicos por dono que ignoravam a empresa — e os seis
que faltavam eram os que mais doíam na prática: nome de conta, de categoria e de
centro de custo. Duas empresas do mesmo dono não podiam ter uma conta "Itaú" nem
uma categoria "Vendas".

## O que a sentada fez

Trinta e dois comandos, em quatro blocos, com contagem antes e depois de cada um.

| bloco | comandos | efeito |
| --- | --- | --- |
| `backfill` | 13 UPDATE + 1 INSERT | 5 órfãs adotadas → 0 |
| `indices` | 9 ADD CONSTRAINT | os novos, por dono **e** empresa |
| `limpar` | 10 DROP INDEX | os antigos, incluindo `company_profiles_user_uidx` |
| `apertar` | 13 MODIFY COLUMN | `companyId` NOT NULL nas treze tabelas |

Estado final, medido no `information_schema`: 13 de 13 colunas NOT NULL, 9
índices únicos por empresa, 0 antigos, 29.378 linhas, 0 órfã, 0 dono cruzado.

`scripts/sentada-fase5.mjs` roda os blocos e, sem `--bloco`, apenas conta. Ele
LÊ os comandos de `drizzle/0023_cuddly_sage.sql` em vez de redigitá-los — o que
foi para produção é exatamente o que o ensaio aplicou no `granafy_test`.

## As duas ordens que não eram preferência

**No arquivo da migration.** O drizzle-kit põe todos os `DROP` primeiro, o que
abriria uma janela de 23 comandos sem unicidade nenhuma enquanto o app segue
aceitando escrita. Foi invertido à mão: cada índice novo nasce antes de o antigo
morrer, e o `NOT NULL` fica por último por ser o único que pode falhar por causa
dos dados.

**Entre deploy e migration.** Apertar com produção ainda rodando código que não
carimba não corrompe dado: faz o banco recusar a inserção, e quem descobre é o
usuário. A contagem do primeiro bloco pegou isso — cinco órfãs onde o plano
previa quatro, e a nova era de um caminho que o código novo já carimbava.

## O que ficou aberto

`user_preferences_user_uidx` continua único em `(userId)`, e está certo:
preferência é do login, não da empresa — a tabela nem tem a coluna.

O `backfillCompanies.ts` usa `JOIN companyProfiles ON c.userId = x.userId`, que
só é determinístico com uma empresa por dono. Rodou antes de o único cair, então
estava garantido. **Não serve para ser reusado a partir de agora.**
