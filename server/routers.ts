import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isPasswordValid, PASSWORD_REQUIREMENT_MESSAGE } from "@shared/password";
import {
  clearLocalSession,
  createOpaquePasswordResetRequestId,
  createPasswordResetToken,
  generatePasswordResetCode,
  hashPassword,
  hashPasswordResetCode,
  normalizeEmail,
  setLocalSession,
  verifyPassword,
  verifyPasswordResetCode,
  verifyPasswordResetToken,
} from "./auth";
import { lerConfiguracaoDoSistema } from "./configuracaoDoSistema";
import * as db from "./db";
import {
  isPasswordResetEmailConfigured,
  sendPasswordResetCode,
  sendWelcomeEmail,
} from "./email";
import {
  LOGIN_FAILURE_WINDOW_MS,
  loginLockedUntil,
  loginLockMessage,
} from "./loginThrottle";
import { isGoogleLoginEnabled } from "./_core/env";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { adminRouter } from "./routers/admin";
import { balanceSheetRouter } from "./routers/balanceSheet";
import { cashflowRouter, payablesRouter } from "./routers/cashflow";
import { companiesRouter } from "./routers/companies";
import { dreRouter } from "./routers/dre";
import { importsRouter } from "./routers/imports";
import { onboardingRouter } from "./routers/onboarding";
import { organizationRouter } from "./routers/organization";
import { reconciliationRouter } from "./routers/reconciliation";
import { settledRouter } from "./routers/settled";
import { settingsRouter } from "./routers/settings";
import { transactionsRouter } from "./routers/transactions";

const credentialsSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(320),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres")
    .max(128, "A senha é muito longa"),
});

/*
 * A política nova vale para senha que está sendo criada — cadastro e
 * redefinição. O login continua com a regra antiga de propósito: quem já tem
 * conta com uma senha mais fraca precisa conseguir entrar para poder trocá-la.
 */
const strongPasswordSchema = credentialsSchema.shape.password.refine(
  isPasswordValid,
  PASSWORD_REQUIREMENT_MESSAGE
);

export const appRouter = router({
  system: systemRouter,

  /**
   * O que o admin decidiu para o sistema inteiro, para quem desenha a tela.
   *
   * Pública, e por dois motivos. O primeiro é que não há o que proteger: a
   * resposta é um booleano sobre a existência de um item de menu, não dado de
   * ninguém — a mesma natureza de `auth.options`, logo abaixo. O segundo é
   * prático: `protectedProcedure` exige empresa ativa, e esta resposta precisa
   * valer também para quem está na escolha de empresa e para o admin, que olha
   * o sistema sem olhar pela janela de uma empresa.
   */
  configuracaoDoSistema: publicProcedure.query(() => lerConfiguracaoDoSistema()),

  admin: adminRouter,
  balanceSheet: balanceSheetRouter,
  cashflow: cashflowRouter,
  companies: companiesRouter,
  dre: dreRouter,
  payables: payablesRouter,
  reconciliation: reconciliationRouter,
  imports: importsRouter,
  onboarding: onboardingRouter,
  organization: organizationRouter,
  settled: settledRouter,
  settings: settingsRouter,
  transactions: transactionsRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user
      ? { ...opts.ctx.user, activeCompanyId: opts.ctx.activeCompanyId }
      : null),

    /** O que a tela de entrada precisa saber antes de alguém estar logado. */
    options: publicProcedure.query(() => ({ google: isGoogleLoginEnabled() })),

    signup: publicProcedure
      .input(
        credentialsSchema.extend({
          name: z.string().trim().min(2, "Informe seu nome").max(80),
          password: strongPasswordSchema,
          /** Sem o aceite não existe cadastro; o servidor não confia na tela. */
          acceptedTerms: z.literal(true, {
            message: "É preciso aceitar os termos de uso e a política de privacidade",
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const existing = await db.getUserRecordByEmail(email);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Já existe uma conta com este e-mail",
          });
        }

        const passwordHash = await hashPassword(input.password);

        try {
          const user = await db.createLocalUser({
            email,
            name: input.name.trim(),
            passwordHash,
          });
          await setLocalSession(ctx.req, ctx.res, user.id);
          // Sem await: a resposta do cadastro não espera o Resend, e a falha
          // do envio fica no log, nunca na tela de quem acabou de entrar.
          void sendWelcomeEmail({ to: email, name: input.name.trim() });
          return user;
        } catch (error) {
          if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Já existe uma conta com este e-mail",
            });
          }
          throw error;
        }
      }),

    login: publicProcedure
      .input(credentialsSchema.extend({
        /** Sem isto o cookie dura só enquanto o navegador estiver aberto. */
        remember: z.boolean().default(true),
      }))
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const agora = new Date();
        const inicioDaJanela = new Date(agora.getTime() - LOGIN_FAILURE_WINDOW_MS);

        /*
         * O teto vem antes de olhar a senha, e vale para e-mail que não existe
         * também: se só a conta cadastrada fosse contada, "muitas tentativas"
         * responderia exatamente a pergunta que quem varre e-mails está
         * fazendo.
         */
        const bloqueadoAte = loginLockedUntil(
          await db.listRecentLoginFailures(email, inicioDaJanela),
          agora
        );
        if (bloqueadoAte) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: loginLockMessage(bloqueadoAte, agora),
          });
        }

        const record = await db.getUserRecordByEmail(email);

        /** Falha registrada antes de responder, para a próxima tentativa já contar esta. */
        const recusar = async () => {
          /*
           * LOG TEMPORÁRIO — sai quando o limite por IP entrar.
           *
           * O express está sem `trust proxy`, então `req.ip` hoje devolve o
           * proxy do Manus, não quem tentou entrar. Estas linhas existem só
           * para ler, uma vez, o que chega em produção e descobrir quantos
           * proxies existem na frente. Com esse número o `trust proxy` entra
           * com o valor certo, o limite por IP passa a valer e este bloco sai
           * daqui. Não grava no banco de propósito, e não escreve o e-mail
           * nem a senha.
           */
          console.warn(
            "[trust-proxy-diagnostico] req.ip=%s x-forwarded-for=%s",
            ctx.req.ip,
            ctx.req.headers["x-forwarded-for"] ?? "(ausente)"
          );
          await db.recordLoginFailure(email, inicioDaJanela);
          return new TRPCError({
            code: "UNAUTHORIZED",
            message: "E-mail ou senha inválidos",
          });
        };

        if (!record?.passwordHash) {
          await hashPassword(input.password);
          throw await recusar();
        }

        const validPassword = await verifyPassword(input.password, record.passwordHash);
        if (!validPassword) {
          throw await recusar();
        }

        /*
         * As quatro saem juntas: em paralelo custam uma ida ao banco, não
         * quatro. A empresa padrão entra aqui para que a conta que por algum
         * motivo ficar sem empresa se conserte no próximo login — é o que faz
         * SEM_EMPRESA_ERR_MSG poder mandar sair e entrar.
         */
        await Promise.all([
          db.clearLoginFailures(email),
          db.updateLastSignedIn(record.id),
          db.ensureDefaultTransactionCategories(record.id),
          db.ensureDefaultCompany(record.id),
        ]);
        await setLocalSession(ctx.req, ctx.res, record.id, input.remember);
        return db.toPublicUser({ ...record, lastSignedIn: new Date() });
      }),

    requestPasswordReset: publicProcedure
      .input(credentialsSchema.pick({ email: true }))
      .mutation(async ({ input }) => {
        const email = normalizeEmail(input.email);
        const record = await db.getUserRecordByEmail(email);
        const deliveryConfigured = isPasswordResetEmailConfigured();

        if (!record?.passwordHash) {
          const requestId = createOpaquePasswordResetRequestId(email);
          hashPasswordResetCode(requestId, generatePasswordResetCode());
          return { requestId, deliveryConfigured };
        }

        const recent = await db.getRecentPasswordResetRequest(
          record.id,
          new Date(Date.now() - 30_000)
        );
        if (recent) {
          return { requestId: recent.id, deliveryConfigured };
        }

        const requestId = randomUUID();
        const code = generatePasswordResetCode();
        await db.createPasswordResetRequest({
          id: requestId,
          userId: record.id,
          codeHash: hashPasswordResetCode(requestId, code),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        });

        try {
          await sendPasswordResetCode({ to: email, code, name: record.name ?? null });
        } catch {
          // Keep the response indistinguishable to prevent account enumeration.
        }

        return { requestId, deliveryConfigured };
      }),

    verifyPasswordResetCode: publicProcedure
      .input(
        z.object({
          requestId: z.string().uuid(),
          code: z.string().regex(/^\d{6}$/, "Informe o código de 6 dígitos"),
        })
      )
      .mutation(async ({ input }) => {
        const request = await db.getPasswordResetRequest(input.requestId);
        const invalid =
          !request ||
          Boolean(request.consumedAt) ||
          request.expiresAt.getTime() <= Date.now() ||
          request.attempts >= 5;

        if (
          invalid ||
          !verifyPasswordResetCode(
            input.requestId,
            input.code,
            request?.codeHash ?? "0".repeat(64)
          )
        ) {
          if (request && !request.consumedAt) {
            await db.incrementPasswordResetAttempts(
              request.id,
              request.attempts + 1
            );
          }
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Código inválido ou expirado",
          });
        }

        return {
          resetToken: await createPasswordResetToken(request.id, request.userId),
        };
      }),

    completePasswordReset: publicProcedure
      .input(
        z.object({
          resetToken: z.string().min(1),
          password: strongPasswordSchema,
        })
      )
      .mutation(async ({ input }) => {
        let token: { requestId: string; userId: number };
        try {
          token = await verifyPasswordResetToken(input.resetToken);
        } catch {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta redefinição expirou. Solicite um novo código.",
          });
        }

        const request = await db.getPasswordResetRequest(token.requestId);
        if (
          !request ||
          request.userId !== token.userId ||
          request.consumedAt ||
          request.expiresAt.getTime() <= Date.now()
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Esta redefinição expirou. Solicite um novo código.",
          });
        }

        await db.completePasswordReset({
          requestId: request.id,
          userId: request.userId,
          passwordHash: await hashPassword(input.password),
        });
        return { success: true } as const;
      }),

    logout: publicProcedure.mutation(({ ctx }) => {
      clearLocalSession(ctx.req, ctx.res);
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
