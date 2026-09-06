# Verificação visual

- Desktop 1440 px: tipografia, cores, cartões, gráficos e hierarquia estão fiéis à referência. A primeira captura mostrou o hero empilhado por breakpoint; o breakpoint foi corrigido de 2xl para xl para recuperar a composição original lado a lado.
- Mobile 390 px: conteúdo permanece legível, sem overflow horizontal, com menu lateral recolhido, cabeçalho compacto, período em linha própria, cartões empilhados e lançamentos truncados de forma segura.
- Nenhuma imagem externa é necessária: a referência é integralmente vetorial/HTML e os ícones foram incorporados como SVGs oficiais do Iconly.
- Próximos testes: confirmar a composição desktop após o ajuste e validar abertura/fechamento do modal e o popover de notificações.

## Teste interativo em desktop

Após o ajuste de breakpoint, a largura de 1440 px reproduz a organização original: sidebar fixa, hero de caixa à esquerda, KPIs e gráfico à direita, lançamentos abaixo e coluna financeira lateral. O modal “Novo lançamento” abriu corretamente, manteve dimensões compactas, foco automático, hierarquia visual, campos acessíveis e contraste adequado. O fundo escurecido preserva contexto sem prejudicar a leitura do formulário.

O modal fechou corretamente pelo botão dedicado e devolveu o foco visual ao dashboard. O popover de notificações abriu ancorado à campainha, com duas mensagens compactas, bom contraste e sem sobreposição indevida do cabeçalho. Os dois componentes responderam conforme esperado.

## Pacote Iconly Outline Regular

Todos os componentes Lucide visíveis foram substituídos por SVGs oficiais do Iconly, usando `currentColor` para preservar os estados verde, vermelho, neutro e branco. Nas capturas, os controles de menu, notificações, novo lançamento, KPIs de entrada/saída/margem e seta de extrato renderizaram corretamente, sem deslocar textos ou cartões. O layout full-bleed e o comportamento responsivo permaneceram inalterados. A sidebar continua disponível no breakpoint desktop amplo e pelo botão de menu nas larguras menores; seus nove itens agora usam o mesmo pacote Iconly.

## Tipografia SF Pro

A implementação ainda carregava Roboto. O carregamento externo foi removido e todo o painel agora usa a pilha `"SF Pro Display", "SF Pro Text", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`, também registrada no token `--font-sans` do Tailwind. A captura desktop em 1440 × 900 confirmou que a mudança preservou alinhamentos, densidade, truncamentos e dimensões dos cartões. Em dispositivos Apple, o navegador usa a SF Pro instalada no sistema; nos demais ambientes, aplica o fallback nativo equivalente.

## Iconly Outline Curved 48 px

O pacote anterior foi substituído integralmente pelo tipo Curved (`type_id: 3`) do estilo Outline (`style_id: 5`). Os 13 SVGs oficiais usam um canvas-base interno de 48 × 48 px e são redimensionados proporcionalmente nos pontos de uso para preservar a densidade compacta do dashboard. A captura em 1440 × 900 confirmou curvas mais suaves e consistência visual na sidebar, KPIs, notificações, botão de novo lançamento, modal e seta de extrato, sem regressões de alinhamento ou layout.

## Teste com Geist Sans

A pilha SF Pro foi substituída por `"Geist", "Geist Sans", ui-sans-serif, system-ui, sans-serif`, carregando os pesos 400, 500, 600 e 700 via Google Fonts. `font-variant-numeric: tabular-nums` foi habilitado globalmente para dar largura consistente aos valores financeiros. A captura desktop em 1440 × 900 mostrou melhor definição nos números, títulos mais contemporâneos e boa legibilidade nas linhas compactas, sem cortes ou regressões de layout.
