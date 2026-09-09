import type { CookieOptions, Request } from "express";

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

/**
 * As opções do cookie de sessão.
 *
 * `sameSite` era "none", e o único motivo de isso não ser um buraco é que
 * `sessionCookieOptions`, em `auth.ts`, sobrescrevia para "lax" logo depois.
 * Quem chamasse esta função direto — a leitura natural de um helper chamado
 * "opções do cookie de sessão" — criava um cookie que o navegador manda em
 * requisição de qualquer site, sem proteção contra CSRF, e nada avisaria.
 *
 * Agora o padrão é o valor seguro. "none" só faz sentido para cookie que
 * precisa atravessar site de terceiro, o que não é o caso de nenhuma tela
 * daqui; se um dia for, que seja escrito no lugar que precisa e não herdado
 * por engano em todos os outros.
 */
export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}
