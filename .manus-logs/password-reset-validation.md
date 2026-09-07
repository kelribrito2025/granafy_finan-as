# Validação da recuperação de senha

A rota `/esqueci-senha` reproduz a identidade visual solicitada com cartão central, ícone Iconly de mensagem, campo compacto, CTA sem sombra, aviso informativo e retorno para o login. O e-mail é tratado como campo controlado e a composição não apresenta sobreposição ou rolagem horizontal na viewport desktop.

A solicitação criou um registro seguro no TiDB e navegou automaticamente para `/redefinir-senha`. A segunda etapa apresenta seis campos individuais, suporte a código de uso único, contador de reenvio, CTA sem sombra e aviso transparente de que o provedor de e-mail ainda precisa ser conectado. Nenhum código foi exibido na interface ou nos logs.

A captura mobile em 390 × 844 confirma que a solicitação permanece compacta, legível e sem rolagem horizontal. A implementação final passou em 10 testes: hash de senha, código HMAC, token temporário, identificador opaco contra enumeração, sessão, backend e presença das duas tabelas no TiDB. TypeScript e build também foram aprovados.
