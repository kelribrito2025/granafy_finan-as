# GranaFy — instruções para agentes

## Antes de mexer em interface

Leia `DESIGN.md` na raiz do projeto antes de qualquer trabalho de UI (telas do app, componentes, landing, e-mails). Ele descreve o design system Voltura: cores, tipografia, espaçamento, raios, componentes e estados de interação, além da seção "Neste projeto", que diz onde o CSS está, em que tela já é aplicado e quais conflitos existem com o visual atual do app.

- Visão geral: um desenho só, `client/src/pages/visaogeral/VisaoGeralPainel.tsx`, com o Voltura sob o escopo `.voltura` (CSS em `client/src/styles/voltura.css`) e os dados em `useVisaoGeral`. Vale nos dois temas: a paleta clara está em `.voltura` e a escura em `.dark .voltura`. Cor nova entra como token nos dois blocos, nunca como valor solto na marcação.
- Demais telas do painel (Fluxo de caixa, A pagar e receber, Pagas e recebidas, Lançamentos, Conciliação, Relatórios, DRE, Balanço, Contas e categorias, Configurações): mesma casca, mas sem remarcação — elas mantêm as classes de cor do app e são traduzidas pela tabela dentro de `.vg-casca`, em `voltura.css`. Os relatórios entram todos pelo `RelatorioShell`.
- Landing (`client/public/site/index.html`) e telas de entrada (login, cadastro, convite, senha, termos): visual anterior do app, de propósito. Não estender o Voltura a elas sem decisão explícita do dono do produto.

## Fluxo de entrega

- Desenvolver na branch de trabalho; o ambiente `development` do Railway (dev.granafy.com) publica a branch automaticamente.
- Só avançar `main` (produção, granafy.com) quando o dono do produto aprovar, sempre por fast-forward.
- Antes de publicar: `pnpm run check`, `pnpm build`, testes, e subir `dist/index.js` localmente para conferir que a raiz responde 200.
