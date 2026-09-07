# Validação — contas, categorias e importação

A rota autenticada `/organizacao` carregou corretamente no My Browser com a sidebar fixa, a identidade visual do dashboard, os três indicadores e o estado vazio real vindo do TiDB. As abas “Contas bancárias” e “Categorias” alternam o conteúdo no mesmo endereço e o CTA do cabeçalho muda contextualmente entre “Nova conta” e “Nova categoria”. Em 1400 × 720, a composição ocupa toda a largura útil, mantém densidade compacta e não apresenta rolagem ou sobreposição na sidebar.

O modal “Nova categoria” abriu centralizado, compacto e sem sombra nos botões. Nome, tipo (entrada, saída ou ambos), cor, cancelar e salvar ficaram totalmente visíveis em 720 px de altura. O controle de fechar cancelou a operação e retornou ao estado vazio sem criar qualquer registro.

O cabeçalho de `/lancamentos` agora apresenta uma ação de importação ao lado da exportação, preservando o seletor mensal na linha do título. O modal “Importar OFX ou CSV” abriu na mesma página, sem alterar a URL, com seletor de arquivo de até 5 MB, formato, conta de destino e categoria padrão. Como a conta autenticada ainda não possui cadastros, a interface bloqueou corretamente a revisão e mostrou o atalho “Gerenciar agora”.

Após criar uma conta e uma categoria temporárias pelo próprio backend, o importador passou a listá-las imediatamente nos seletores reais. A sidebar também passou a exibir “Contas e categorias” em um grupo separado chamado Organização, tanto no dashboard quanto em Lançamentos.

O importador foi reaberto com conta e categoria temporárias disponíveis e os dois seletores refletiram corretamente os registros do TiDB. A interface permaneceu compacta, sem sombra nos botões e com o CTA de revisão desabilitado até que arquivo, conta e categoria sejam informados. Os registros e arquivos usados apenas nessa checagem foram removidos integralmente depois do teste.

## Verificação final

Depois da limpeza, as abas Contas bancárias e Categorias voltaram a exibir zero registros, saldo organizado de R$ 0,00 e estados vazios corretos. A auditoria direta no TiDB confirmou que nenhuma conta, categoria, importação ou lançamento técnico permaneceu. O fluxo ponta a ponta validou criação, importação de duas linhas, detecção integral na segunda leitura, sincronização de nomes após renomear e exclusão dos dados de teste.

A validação automatizada final concluiu com 19 testes aprovados, TypeScript sem erros, build de produção concluído e migration real confirmada no TiDB.
