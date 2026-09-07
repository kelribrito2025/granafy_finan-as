# Validação — botões sem sombra

Foi removida a sombra explícita dos botões do dashboard principal e da variante outline compartilhada. Uma regra global agora mantém `button`, elementos com `role="button"` e o componente Button sem `box-shadow`, inclusive em novas telas. Modais, popovers e cartões continuam podendo usar sombra por não serem botões.

A página de Lançamentos e o modal Novo lançamento foram revisados visualmente. Controles do mês, importação, exportação, novo lançamento, conta, filtro, status, fechar, cancelar e salvar aparecem sem sombra. A auditoria estática não encontrou nenhuma tag `<button>` com classe de sombra.
