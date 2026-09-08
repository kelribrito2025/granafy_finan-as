/**
 * Entrar com Google.
 *
 * Fluxo de authorization code, sem biblioteca: são duas chamadas HTTP e um
 * cookie de estado. O `state` é um nonce guardado num cookie de uso único —
 * um atacante consegue forjar a query string, mas não consegue plantar esse
 * cookie no navegador da vítima, que é o que impede o CSRF de login.
 *
 * As rotas só existem quando as três variáveis estão configuradas. Sem elas o
 * botão nem aparece na tela: botão que leva a erro é pior do que botão nenhum.
 */
import { randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { normalizeEmail, setLocalSession } from "./auth";
import * as db from "./db";
import { ENV, isGoogleLoginEnabled } from "./_core/env";

const STATE_COOKIE = "granafy_google_state";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function redirectUri() {
  return `${ENV.publicUrl.replace(/\/$/, "")}/api/auth/google/callback`;
}

function stateCookieOptions() {
  return {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 10 * 60_000,
  };
}

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export function registerGoogleAuthRoutes(app: Express) {
  if (!isGoogleLoginEnabled()) return;

  app.get("/api/auth/google/start", (req: Request, res: Response) => {
    const state = randomBytes(16).toString("hex");
    res.cookie(STATE_COOKIE, state, stateCookieOptions());

    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", ENV.googleClientId);
    url.searchParams.set("redirect_uri", redirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    // Sem refresh token: a sessão é nossa, o Google só diz quem é a pessoa.
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
    res.redirect(url.toString());
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const falha = (motivo: string) => res.redirect(`/login?erro=${encodeURIComponent(motivo)}`);

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const esperado = parseCookieHeader(req.headers.cookie ?? "")[STATE_COOKIE];
    res.clearCookie(STATE_COOKIE, { path: "/" });

    if (!code || !state || state !== esperado) {
      return falha("Não foi possível validar o retorno do Google. Tente de novo.");
    }

    try {
      const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: redirectUri(),
          grant_type: "authorization_code",
        }),
      });
      if (!tokenResponse.ok) return falha("O Google recusou a autenticação.");
      const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
      if (!accessToken) return falha("O Google não devolveu o token de acesso.");

      const profileResponse = await fetch(USERINFO_URL, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
      if (!profileResponse.ok) return falha("Não foi possível ler seu perfil no Google.");
      const profile = (await profileResponse.json()) as GoogleProfile;

      /*
       * E-mail não verificado não entra: é justamente por ele que a conta é
       * encontrada, e aceitar um não verificado deixaria alguém entrar numa
       * conta alheia só declarando o endereço.
       */
      if (!profile.email || profile.email_verified === false) {
        return falha("Sua conta do Google precisa ter o e-mail verificado.");
      }

      const email = normalizeEmail(profile.email);
      const existente = await db.getUserRecordByEmail(email);
      const user = existente ?? await db.createLocalUser({
        email,
        name: profile.name?.trim() || email.split("@")[0],
        passwordHash: null,
        loginMethod: "google",
      });

      await Promise.all([
        db.updateLastSignedIn(user.id),
        db.ensureDefaultTransactionCategories(user.id),
      ]);
      await setLocalSession(req, res, user.id);
      return res.redirect("/");
    } catch (error) {
      console.error("[GoogleAuth] Falhou", { message: error instanceof Error ? error.message : "desconhecido" });
      return falha("Não foi possível concluir a entrada com o Google.");
    }
  });
}
