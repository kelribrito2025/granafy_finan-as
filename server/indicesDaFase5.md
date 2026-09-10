# Fase 5 · os quatro índices únicos que ignoram a empresa

Decisão tomada no fechamento da sub-leva 4 da Fase 4. Os quatro entram **na
mesma migration**, com o do fechamento em primeiro lugar por ser o único
destrutivo.

Não há urgência: hoje nenhum login tem duas empresas, então nenhum dos quatro
pode disparar. O que garante que isso não seja esquecido são os testes de
isolamento que travam a definição atual de cada índice — eles ficam vermelhos no
dia em que a definição mudar, e a Fase 6 (mover coisa entre empresas) não sobe
sem isso resolvido.

## 1. O destrutivo

`balance_sheet_snapshots_user_date_uidx` — hoje `(userId, referenceDate)`.

O fechamento é gravado com `onDuplicateKeyUpdate` nessa chave. Para um dono com
duas empresas, **fechar setembro na empresa B sobrescreve o fechamento de
setembro da empresa A**: sem erro, sem aviso, e a foto do mês da primeira some.
E 30/09 é 30/09 para toda empresa — não existe o caso em que as datas não
colidem.

Precisa virar `(userId, companyId, referenceDate)`.

Foi descoberto porque o arreio do patrimônio não aceitou semear as duas empresas
da Ana com fechamento na mesma data. O índice mandou, e a semeadura usa 30/09 e
31/08 por causa dele. Travado por
`server/patrimonio.isolation.test.ts`.

## 2, 3 e 4. Os chatos

Nenhum destrói dado: o `INSERT` é recusado e a pessoa vê o erro. O que eles
fazem é proibir o que deveria ser permitido.

| índice | hoje | proíbe |
| --- | --- | --- |
| `patrimonial_items_user_name_uidx` | `(userId, name)` | duas empresas do mesmo dono terem um bem chamado "Notebook" |
| `transactions_user_fingerprint_uidx` | `(userId, fingerprint)` | o mesmo lançamento existir em duas empresas do mesmo dono |
| `statement_balances_account_date_uidx` | `(userId, accountId, asOf)` | (inócuo hoje: a conta já pertence a uma empresa só) |

Os três precisam ganhar `companyId`. Travados por
`server/patrimonio.isolation.test.ts` e
`server/conciliacao.isolation.test.ts`.

## O efeito colateral bom

Enquanto esses índices não incluírem `companyId`, **três guardas de empresa são
inverificáveis por mutação** — o banco já garante uma linha por dono no recorte,
então apagar a guarda não muda resultado nenhum. As três estão marcadas no
código com `// inverificável-por-índice-único` e ficam fora do padrão da
varredura.

Quando a migration rodar, as três passam a valer sozinhas, saem da exceção e
precisam de teste. É a mesma migration: não dá para consertar o índice e
esquecer as guardas.
