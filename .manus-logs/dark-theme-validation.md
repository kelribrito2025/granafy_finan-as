# Validação do tema claro e escuro

A página protegida de Lançamentos permaneceu autenticada e o menu da conta passou a exibir a seção **Aparência**, com as opções **Claro** e **Escuro**, além dos dados da conta e da ação de sair. Os controles estão expostos como botões acessíveis.

A alternância para **Escuro** atualizou imediatamente toda a página de Lançamentos. A inspeção visual confirmou fundo geral verde quase preto, sidebar e cartões em superfícies distintas, textos claros, verdes e vermelhos preservados, tabela legível, campo de busca escuro e seletor indicando **Escuro** como ativo. A página permaneceu sem overflow horizontal e os itens indisponíveis continuaram visualmente desabilitados.

A preferência escura persistiu ao navegar entre rotas. Na **Visão geral**, o card principal, cards de indicadores, gráfico, estados vazios e área “Precisa de você” mantiveram hierarquia e contraste. No **Balanço Patrimonial**, indicadores, abas, estrutura patrimonial, avisos contábeis e CTAs ficaram legíveis, com diferenças claras entre fundo, painéis e cartões. A identidade verde permaneceu consistente.

A página **Contas e categorias** também manteve contraste correto em indicadores, abas e estado vazio. Na rota de **login**, a preferência escura persistiu após nova navegação: o painel institucional permaneceu verde profundo, a área da conta ganhou superfície escura própria e o seletor Claro/Escuro ficou visível no canto superior direito. Não houve flash perceptível de fundo claro durante a navegação.

A opção **Claro** restaurou imediatamente a paleta original sem alterar a sessão. Após recarregar a rota, o tema claro permaneceu selecionado, confirmando a persistência local das duas preferências e o carregamento sem alternância visual indevida.

O tema escuro foi reativado e persistiu ao retornar para Organização, preparando a validação dos componentes sobrepostos e campos de formulário.

O modal **Nova conta** foi aberto no tema escuro. A sobreposição, superfície do modal, cartões de instituições, campos de texto, seletor, saldo monetário, seletor de cor, botões e placeholders apresentaram contraste adequado. Nenhum dado foi salvo durante a validação.

O modal foi fechado sem persistir dados. O menu da conta em Organização exibiu corretamente a mesma seção **Aparência — Claro/Escuro**, confirmando a reutilização do componente nas páginas autenticadas.

A autenticação foi capturada em **375 × 812 px** sem sessão: marca e seletor ficaram alinhados no topo, sem colisão; título, campos, recuperação de senha, CTA e rodapé permaneceram dentro do viewport. A tela de login real exibiu o formulário completo e a opção de aparência antes da autenticação.

## Validação técnica

Foram aprovados **53 testes em 11 arquivos**, a checagem TypeScript, o build de produção e `git diff --check`. A preferência usa `localStorage` com chave própria, aplica `color-scheme`, atualiza `theme-color` e é restaurada antes da montagem do React para evitar flash entre temas.
