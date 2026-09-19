# GranaFy — instruções para agentes

## Antes de mexer em interface

Leia `DESIGN.md` na raiz do projeto antes de qualquer trabalho de UI (landing, telas do app, componentes, e-mails). Ele descreve o design system Verda Finance: cores, tipografia, espaçamento, raios, componentes e estados de interação, além da seção "Neste projeto", que diz onde o CSS está, onde já é aplicado e quais conflitos existem com o visual atual do app.

- Landing: `client/public/site/index.html`, que importa `/site/css/system.css` uma única vez. Use as classes `vf-*` do sistema e só escreva CSS próprio para layout da página.
- App logado (`client/src`): ainda não adota o sistema. Não misturar tokens `--vf-*` lá sem decisão explícita do dono do produto.

## Fluxo de entrega

- Desenvolver na branch de trabalho; o ambiente `development` do Railway (dev.granafy.com) publica a branch automaticamente.
- Só avançar `main` (produção, granafy.com) quando o dono do produto aprovar, sempre por fast-forward.
- Antes de publicar: `pnpm run check`, `pnpm build`, testes, e subir `dist/index.js` localmente para conferir que a raiz responde 200.
