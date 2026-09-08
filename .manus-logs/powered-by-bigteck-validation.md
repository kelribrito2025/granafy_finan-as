# Validação — Powered by Bigteck

O texto foi atualizado nos três usos reais do componente `GranafyLogo`: painel esquerdo da autenticação, cabeçalho móvel da autenticação e barra lateral. O campo `legalName` em Configurações mantém o placeholder “Número Virtual LTDA” por representar a razão social, não o subtítulo da marca.

A suíte concluiu 257 testes em 26 arquivos, além de TypeScript, build e `git diff --check`. A primeira tentativa de inspeção visual encontrou o iframe de preview sem montar o React; a validação do servidor continua antes do checkpoint.

A verificação WebDev confirmou o servidor em execução, HTTP 200 e captura visual do login com **Powered by Bigteck** corretamente posicionado abaixo do wordmark GranaFy. O iframe apresentou uma falha transitória na primeira abertura, mas o status gerenciado confirmou que o componente está renderizado sem alterações de layout.
