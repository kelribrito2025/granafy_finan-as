# Validação — classificação Receita/Despesa na importação

A etapa inicial do importador informa que **créditos e débitos do OFX são reconhecidos automaticamente**. Não há escolha obrigatória e redundante antes da leitura. As cinco novas categorias de receita já aparecem junto às 45 categorias de despesa na conta autenticada.

O primeiro upload automatizado identificou que o input estava separado do acionador visual. A área foi corrigida para um rótulo acessível com o `input[type=file]` descendente, preservando o mesmo visual e melhorando clique, teclado e testes.

Após a correção, o arquivo OFX foi carregado com sucesso pela área visual. O nome, tamanho e formato foram exibidos, sem iniciar ou confirmar qualquer importação.

A conta temporária e a categoria **Outras Receitas** foram selecionadas. O botão de revisão ficou habilitado, confirmando que categorias de entrada estão disponíveis no fluxo real.

O primeiro acionamento da prévia permaneceu na etapa inicial sem exibir erro textual. A causa será verificada diretamente pelo roteador antes de repetir o teste visual, sem confirmar importação.

A prévia foi validada diretamente pelo mesmo roteador tRPC: duas entradas positivas do OFX foram classificadas como **Receita** e receberam **Outras Receitas**, sem gravação. Na automação visual, conta e categoria permaneceram selecionadas após nova renderização; o clique automatizado no CTA não mudou a etapa, embora a API tenha respondido corretamente.

## Validação final

O teste ponta a ponta confirmou uma revisão mista: um crédito do OFX foi alterado para **Despesa** com valor negativo e categoria de saída, enquanto outro permaneceu **Receita** com valor positivo e categoria de entrada. Ambos foram persistidos corretamente e removidos em seguida. A conta, lote, lançamentos e arquivo temporários também foram eliminados; a interface voltou ao estado limpo.

As quatro contas de usuário receberam, de forma idempotente, cinco categorias padrão de receita. A auditoria confirmou 20 registros esperados, catálogo na versão 2 e ausência de dados técnicos. A suíte final aprovou 36 testes, tipagem e build de produção.
