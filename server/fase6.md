# Fase 6 — um login, várias empresas

O que a fase entregou, o que ela decidiu não fazer, e o que provou em produção.

A Fase 4 pôs a guarda de empresa em 87 funções. A Fase 5 apertou o banco:
`companyId` NOT NULL em 13 colunas, nove índices únicos por empresa, e a queda
do `company_profiles_user_uidx`, que era a proibição de um login ter duas
empresas. A Fase 6 é a fase em que isso passa a existir na tela.

## Leva 1 — criar, listar, renomear, arquivar

`createCompany` com teto de `MAXIMO_DE_EMPRESAS`, e a empresa nova nascendo com
o catálogo de categorias-padrão inteiro — empresa sem categoria não deixa
lançar nada. `setCompanyArchived` recusa arquivar a única empresa ativa, e a
ordem da verificação importa: primeiro "é sua?", depois "sobra ativa?". Invertida,
a resposta para a empresa de outra pessoa era "não dá para arquivar a única
ativa" — recusava pelo motivo errado, contando as ativas de quem pediu.

## Leva 2 — trocar de empresa, e a empresa nova nascer com boas-vindas

A escolha vira cookie `app_company_id` de 30 dias, gravado só depois de conferir
que a empresa é do login e está ativa. Depois de trocar, o cliente recarrega em
`/`: limpa o cache do TanStack Query inteiro em vez de invalidar chave por
chave, porque trocar de empresa muda tudo na tela e não há chave a preservar.

O assistente de boas-vindas passou a ser por empresa comparando
`companyCreatedAt` com `completedAt`, e não por coluna nova. A limitação disso
está escrita em `onboarding.ts`, com a decisão de resolvê-la na Fase 7.

### Validado por uso real em produção

Não por teste: pelo dono, na conta de verdade, com duas empresas de verdade.
Criou a segunda, caiu nas boas-vindas dela, cadastrou conta, importou extrato,
trocou para a primeira e voltou. Todas as telas obedeceram à empresa ativa e
nada apareceu fora do lugar. É o critério que fecha as levas 1 e 2 — a suíte
prova que o isolamento existe, o uso prova que o produto funciona.

## Leva 3 — não move

**Decisão: lançamento não muda de empresa.** Quem errou a empresa apaga e
relança. "Mover só o que não tem passado" fica registrado como refinamento
futuro se houver demanda; "mover com rastro" foi descartado — não vale o risco
no fechamento de mês.

A leva 3 não removeu botão nenhum, porque não havia botão. O que ela fez foi
conferir em três níveis e trancar o que estava aberto:

- **Tela**: nenhum caminho de mover ou transferir entre empresas. O que existe
  de "Transferência" é entre CONTAS da mesma empresa.
- **Rotas**: uma única procedure aceita `companyId` do cliente — o `alvoSchema`
  de `companies.ts`, e ele confere se a empresa é do login. Nenhuma procedure de
  lançamento recebe `companyId`.
- **`db.ts`**: `TransactionValues` e o update em lote são `Pick`, lista de
  permissão, e `companyId` não está nela. Nenhuma das escritas de `companyId` no
  arquivo mora num `.set()`: todas são INSERT carimbando do escopo.

E **três portas estavam destrancadas no tipo**, nenhuma alcançável na época:

| onde | aceitava | o que isso permitia |
|---|---|---|
| `updatePatrimonialItem` | `companyId` | mover item para QUALQUER empresa, inclusive de outro dono — o `WHERE` conferia, o `SET` não |
| `saveCompanyProfile` | `id` | renumerar a empresa e orfanar as linhas filhas de treze tabelas |
| `createCompany` | `id` | escolher o número da empresa criada |

Nenhuma tinha chamador abusando: os endpoints passam schemas zod que não têm
essas chaves. O problema é que **só o chamador impedia** — trocar um schema
bastava para abrir o caminho, sem uma linha de erro do compilador.

As três foram trancadas no tipo, e a invariante em `guardas.test.ts` recusa
qualquer `Omit<Insert…>` que não exclua a chave da empresa e qualquer `Pick` que
a admita. A terceira porta foi a própria invariante que apontou. As três trancas
foram provadas por mutação: censo completo, 3 de 3 vermelhas.

## Leva 4 — limites por plano: SÓ o cartão de uso, e por decisão

A página de Planos é mockup declarado: não existe assinatura, fatura nem coluna
de plano no banco. Ela promete 1 empresa no Essencial e no Controle, 5 no Grupo;
o código permite 20 para todos. Promete limites de usuários e de contas que não
existem, e cobra por conciliação, DRE, balanço e patrimônio que hoje estão
liberados para todo mundo.

**Decidido:** o cartão "Uso no ciclo" passa a mostrar números verdadeiros, e
mais nada. Ele estava mentindo — dizia "Empresas 1 de 1" com alerta de estouro
numa conta com duas empresas.

- **Teto por plano no servidor: fica para quando a cobrança for ativada.** Os
  números e a lógica do trial se decidem lá. Sem cobrança, trancar porta sem
  vender a chave não faz sentido.
- **Cadeado por recurso: descartado.** Sem cobrança conectada, só serviria para
  tirar recurso de quem já usa.

## Leva 5 — o modal deixa de ser lista de botões

Depois de usar com duas empresas de verdade, o modal estava errado de um jeito
que só o uso mostra: "Editar" e "Arquivar" na cara de cada linha punham duas
ações de gestão no caminho de quem só queria TROCAR. O modal é de troca; gestão
é o desvio, não o destino.

- As duas ações foram para trás de um menu `⋮`, ao lado da marca de seleção.
- A marca virou rádio: check verde cheio na aberta, círculo vazio nas outras. A
  seta dizia "vai para lá", que é verdade mas não responde a pergunta da tela.
- **O saldo entrou**, embaixo do nome, e é o MESMO número do "Caixa disponível"
  do painel — `saldosDeCaixaPorEmpresa` copia o critério do `openingBalance` e
  do `sumPaidBefore` em vez de reinventar: saldo inicial das contas mais o que
  está pago antes de amanhã, transferência de fora. Duas consultas com
  `GROUP BY companyId` para todas as empresas, e não duas por empresa.

## O que ficou anotado, não esquecido

- **Papéis de usuário.** O rótulo "Administradora" está FIXO na tela, por
  decisão: o desenho pede a linha e é o que é verdade hoje para todo mundo que a
  vê, porque um login tem acesso total às empresas dele e não existe convite. No
  dia em que houver papel, ele passa a sair do banco.
- **Último acesso por empresa.** NÃO entrou, e foi decisão contra o pedido:
  nenhuma coluna sabe quando alguém abriu uma empresa, e data inventada em tela
  é o erro que acabou de sair do cartão de uso dos Planos. A linha mostra a
  criação, que é verdade. Ter o último acesso custa uma coluna e uma escrita no
  `gravarEscolha`.
- **Excluir empresa.** Desenhada e adiada pelo dono: menu com Excluir,
  confirmação digitando `deletar`, e backup opcional em 3 CSV (lançamentos,
  contas, categorias) com o botão virando "Continuar para exclusão" depois do
  download. Fica como leva própria porque mexe em DELETE, e o `Excluir` só sobe
  depois de um arreio que prove que apagar a empresa A não tira uma linha da B.
  Custo conhecido a decidir junto: apagar os lançamentos não apaga os anexos do
  storage, que ficam pagos e inalcançáveis.
