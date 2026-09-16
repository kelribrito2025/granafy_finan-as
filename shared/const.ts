export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/*
 * O login autenticado que chega sem empresa ativa.
 *
 * Não deveria acontecer: desde o backfill toda conta tem uma, o cadastro cria a
 * sua e o login recria a que faltar. Se ainda assim acontecer, a mensagem tem
 * de apontar um caminho que FUNCIONA — e "sair e entrar" só entrou aqui depois
 * de o login passar a recriar a empresa padrão de verdade. Mensagem que manda
 * tentar algo inócuo é pior que mensagem que só avisa: gasta a paciência da
 * pessoa e ainda esconde o defeito.
 */
export const SEM_EMPRESA_ERR_MSG =
  "Esta conta está sem empresa ativa. Saia e entre de novo — o login recria a empresa padrão. Se continuar assim, é defeito nosso: avise o suporte citando o código 10003.";

/*
 * Quem entrou por vínculo tentando gravar.
 *
 * O contador vê a empresa do cliente inteira, e não muda nada nela. A recusa
 * precisa dizer isso com todas as letras: sem o "somente leitura" explícito, um
 * botão que falha parece defeito do produto, e a pessoa tenta de novo. Diz
 * também A QUEM pedir — porque a resposta existe e é uma só: o dono.
 */
export const SOMENTE_LEITURA_ERR_MSG =
  "Seu acesso a esta empresa é somente leitura. Peça ao dono da empresa para fazer esta alteração (10004).";

/** A empresa escolhida no seletor. Lida desde a Fase 3; escrita a partir da 6. */
export const COMPANY_COOKIE_NAME = "app_company_id";

// One-time nonce cookie that binds an OAuth login to the browser that started
// it. The `__Host-` prefix forces the cookie host-only (Secure, Path=/, no
// Domain), so a sibling *.manus.space site cannot plant a matching value in a
// victim's browser.
export const OAUTH_STATE_COOKIE = "__Host-oauth_state";

// `state` carries the callback redirect URI (used at token exchange) plus the
// CSRF nonce. Defined here so the client encoder and server decoder never drift.
export type OAuthState = { redirectUri: string; nonce?: string };

export const encodeOAuthState = (state: OAuthState): string =>
  btoa(JSON.stringify(state));

export const decodeOAuthState = (state: string): OAuthState => {
  let decoded: string;
  try {
    decoded = atob(state);
  } catch {
    // Malformed base64 (e.g. attacker-supplied garbage). Return no nonce so the
    // callback's CSRF guard rejects it with 403 — never throw, since the caller
    // runs outside the request handler's try/catch.
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
    // Legacy links: `state` was a bare base64(redirectUri) with no nonce.
  }
  return { redirectUri: decoded };
};
