# GranaFy — instruções para agentes

## Antes de mexer em interface

Leia `DESIGN.md` na raiz do projeto antes de qualquer trabalho de UI (telas do app, componentes, landing, e-mails). Ele descreve o design system Voltura: cores, tipografia, espaçamento, raios, componentes e estados de interação, além da seção "Neste projeto", que diz onde o CSS está, em que tela já é aplicado e quais conflitos existem com o visual atual do app.

- Visão geral: dois desenhos, escolhidos pelo tema em `client/src/pages/Home.tsx`. No claro vale `VisaoGeralClara` (o painel de sempre); no escuro vale `VisaoGeralEscura`, que usa o Voltura com o CSS em `client/src/styles/voltura.css` sob o escopo `.voltura`. Os dados dos dois vêm de `useVisaoGeral`. Mudança de dado entra no hook; mudança de desenho entra nos dois arquivos, ou o claro fica para trás.
- Demais telas, barra lateral e landing (`client/public/site/index.html`): ainda com o visual anterior do app. Não estender o Voltura a elas sem decisão explícita do dono do produto.

## Fluxo de entrega

- Desenvolver na branch de trabalho; o ambiente `development` do Railway (dev.granafy.com) publica a branch automaticamente.
- Só avançar `main` (produção, granafy.com) quando o dono do produto aprovar, sempre por fast-forward.
- Antes de publicar: `pnpm run check`, `pnpm build`, testes, e subir `dist/index.js` localmente para conferir que a raiz responde 200.
