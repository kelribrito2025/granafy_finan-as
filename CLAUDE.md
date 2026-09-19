# GranaFy — instruções para agentes

## Antes de mexer em interface

Leia `DESIGN.md` na raiz do projeto antes de qualquer trabalho de UI (telas do app, componentes, landing, e-mails). Comece pela seção "Neste projeto", no fim: dela veio a decisão que vale hoje — **do design system Voltura o projeto adotou a composição (casca, grade, espaçamento), e não a pele**. Cor e fonte são as do GranaFy: verde `#12B85C` sobre branco, fonte Geist. A paleta e a tipografia descritas no topo do DESIGN.md são as do pacote original e não valem aqui.

- Visão geral: um desenho só, `client/src/pages/visaogeral/VisaoGeralPainel.tsx`, remarcado com as classes `v-*` (CSS em `client/src/styles/voltura.css`, escopo `.voltura`) e com os dados em `useVisaoGeral`. Vale nos dois temas: a paleta clara do produto está em `.voltura` e a escura em `.dark .voltura`. Cor nova entra como token nos dois blocos, nunca como valor solto na marcação.
- Demais telas do painel (Fluxo de caixa, A pagar e receber, Pagas e recebidas, Lançamentos, Conciliação, Relatórios, DRE, Balanço, Contas e categorias, Configurações): mesma casca e mesmo espaçamento, sem remarcação — elas mantêm as classes de cor, a fonte e os raios do app, e a tabela dentro de `.vg-casca` só traduz cor para token. Os relatórios entram todos pelo `RelatorioShell`.
- Landing (`client/public/site/index.html`) e telas de entrada (login, cadastro, convite, senha, termos): visual anterior do app, de propósito. Não estender o Voltura a elas sem decisão explícita do dono do produto.

## Fluxo de entrega

- Desenvolver na branch de trabalho; o ambiente `development` do Railway (dev.granafy.com) publica a branch automaticamente.
- Só avançar `main` (produção, granafy.com) quando o dono do produto aprovar, sempre por fast-forward.
- Antes de publicar: `pnpm run check`, `pnpm build`, testes, e subir `dist/index.js` localmente para conferir que a raiz responde 200.
