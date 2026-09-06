# Validação de autenticação

## Banco e backend

A tabela `users` foi criada pela migration `drizzle/0000_magical_dragon_man.sql` antes da implementação das novas telas. O callback OAuth oficial persiste e atualiza automaticamente `openId`, nome, e-mail, método de login, função e último acesso. A sessão usa cookie HTTP-only gerenciado pelo backend.

## Interface desktop

A rota `/login` foi aberta no navegador em uma viewport desktop e apresentou corretamente o layout assimétrico: painel escuro de marca e métricas à esquerda, formulário de acesso claro à direita, Geist Sans, verde da identidade e ícones Iconly Outline Curved. Não houve overflow horizontal, cortes ou conflitos com a barra de prévia.

O seletor “Criar conta” foi clicado e navegou para `/cadastro` sem recarregamento indevido. A tela alterou título, texto de apoio, estado ativo e CTA para criação de conta, preservando a mesma estrutura visual. As duas telas têm caminho de retorno entre si e o botão principal conduz ao provedor seguro de autenticação.

## Interface mobile

A rota `/login` foi capturada em 390 × 844 px. O painel ilustrativo desktop foi removido pelo breakpoint, a marca e o selo de segurança permaneceram visíveis, o seletor de modo ocupou a largura útil e todas as mensagens, benefícios, CTA e links ficaram legíveis sem overflow. O rodapé permaneceu no fim da viewport e a hierarquia visual continuou consistente com o dashboard.

## Proteção

A rota `/` está protegida pelo estado de `auth.me`; visitantes anônimos são enviados a `/login`. Usuários autenticados veem o dashboard e têm um menu compacto de conta no cabeçalho com nome, e-mail e logout.

O CTA de criação de conta foi acionado no navegador e iniciou corretamente o portal oficial de autenticação, incluindo identificador do aplicativo, callback calculado a partir da origem atual e estado com nonce anti-CSRF. Nenhuma credencial é coletada ou armazenada diretamente pela interface do dashboard.
