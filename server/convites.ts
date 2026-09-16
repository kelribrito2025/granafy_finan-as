import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { ENV } from "./_core/env";

/*
 * O convite de acesso, sem banco — Fase C do acesso do contador.
 *
 * O que está aqui é o que dá para provar em memória: como o token nasce, como
 * vira hash, e quais linhas de convite ainda valem. O que fala com banco mora
 * em `db.ts`; o que decide quem pode chamar mora no router. Separar assim é o
 * que deixa a regra de validade ter teste puro em vez de um arreio para cada
 * combinação de vencido/aceito/revogado.
 */

/** Sete dias. É o que o plano fixou e o que o e-mail promete. */
export const VALIDADE_DO_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O token que viaja no link. 32 bytes aleatórios em base64url — sem `+`, `/`
 * nem `=`, para caber num caminho de URL sem escape.
 */
export function gerarTokenDeConvite() {
  return randomBytes(32).toString("base64url");
}

/** O agrupador das linhas de um convite. */
export function gerarLoteDeConvite() {
  return randomUUID();
}

/**
 * HMAC do token com a chave da sessão, como o código de redefinição.
 *
 * Hash simples bastaria contra leitura do banco — o token tem 256 bits de
 * entropia e não se adivinha. O HMAC entra pelo mesmo motivo que no reset: um
 * dump da tabela sem a chave não permite nem CONFERIR um token que vazou por
 * outro caminho.
 */
export function hashDoConvite(token: string) {
  if (!ENV.cookieSecret) throw new Error("JWT_SECRET is required to hash invites");
  return createHmac("sha256", ENV.cookieSecret).update(`convite:${token}`).digest("hex");
}

/** O caminho do aceite, o mesmo que a rota do cliente atende. */
export function caminhoDoConvite(token: string) {
  return `/convite/${token}`;
}

export type LinhaDeConvite = {
  email: string;
  companyId: number;
  invitedBy: number;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

/**
 * Um lote de convite vale quando TODAS as suas linhas valem.
 *
 * Aceitar é atômico: o convite libera "A e C", e não existe aceitar só A. Se
 * uma linha foi revogada (o dono tirou C antes do aceite), o lote inteiro
 * deixa de valer e o dono reenvia — é mais simples de explicar do que um
 * convite que aceita "em parte".
 */
export function conviteValido(linhas: readonly LinhaDeConvite[], agora: Date) {
  return linhas.length > 0 && linhas.every(linha =>
    linha.acceptedAt === null
    && linha.revokedAt === null
    && linha.expiresAt.getTime() > agora.getTime(),
  );
}

/**
 * Por que um convite não vale, para a tela dizer a coisa certa.
 *
 * "Inválido" cobre o token errado, mas também o que já foi aceito — e para
 * quem clica de novo no e-mail de ontem a resposta útil é "você já tem
 * acesso", não "convite inválido".
 */
export function motivoDaRecusa(linhas: readonly LinhaDeConvite[], agora: Date): "aceito" | "revogado" | "vencido" | "inexistente" | null {
  if (linhas.length === 0) return "inexistente";
  if (linhas.every(l => l.acceptedAt !== null)) return "aceito";
  if (linhas.some(l => l.revokedAt !== null)) return "revogado";
  if (linhas.some(l => l.expiresAt.getTime() <= agora.getTime())) return "vencido";
  if (linhas.some(l => l.acceptedAt !== null)) return "revogado";
  return null;
}
