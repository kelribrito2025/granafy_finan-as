# Validação — importação grande sem limite de lançamentos

A etapa inicial passou a informar **“máximo de 25 MB · sem limite de lançamentos”**. O limite fixo de 1.000 registros foi removido do parser e do contrato de confirmação. A única conta temporária do teste foi pré-selecionada junto das categorias padrão de receita e despesa.

O arquivo de teste com **1.205 movimentos** e 116,1 KB foi aceito pela interface. O botão iniciou a análise sem retornar a mensagem antiga de limite de 1.000 registros.

A análise concluiu com **1.205 de 1.205 selecionados**, sem duplicatas e sem erro. A interface renderizou apenas as primeiras 100 linhas e criou **13 páginas**, evitando travamento visual. O DOM confirmou “Página 1 de 13 · 1–100” e o CTA final “Importar 1205 lançamentos”. A tentativa de rolar pelo ponto central não encontrou o contêiner pela automação, mas não alterou o estado nem confirmou a importação.

## Persistência e limpeza

A confirmação real pelo roteador gravou os **1.205 lançamentos** no TiDB em três lotes atômicos de 500, 500 e 205. A contagem no banco confirmou todos os registros. Em seguida, o lote, os lançamentos, a conta e o arquivo técnicos foram removidos; a interface recarregada voltou a mostrar zero contas temporárias.

A suíte final aprovou **40 testes**, além da tipagem e do build de produção.
