# Recuperação embutida no login

O link “Esqueceu a senha?” troca somente o conteúdo do painel branco da direita. O painel verde, a divisão da tela, o rodapé e a URL `/login` permanecem inalterados. A tela de solicitação aparece sem navegação para outra página e oferece retorno imediato ao formulário de entrada.

O e-mail foi preenchido e o envio foi iniciado enquanto a URL permaneceu em `/login`; não houve transição para `/esqueci-senha` ou `/redefinir-senha`.

A etapa de seis dígitos também foi renderizada no painel direito mantendo `/login`. O botão “Alterar e-mail” retornou ao primeiro passo dentro da mesma tela, preservando o endereço digitado e sem recarregar o layout.

O botão “Voltar para entrar” restaurou o formulário original de login e a URL continuou `/login`. Todo o fluxo ocorre por troca de estado no mesmo componente, sem página dedicada.
