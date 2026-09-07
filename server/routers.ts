import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
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
import * as db from "./db";
import {
  isPasswordResetEmailConfigured,
  sendPasswordResetCode,
} from "./email";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { transactionsRouter } from "./routers/transactions";

const credentialsSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(320),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres")
    .max(128, "A senha é muito longa"),
});

export const appRouter = router({
  system: systemRouter,
  transactions: transactionsRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),

    signup: publicProcedure
      .input(
        credentialsSchema.extend({
          name: z.string().trim().min(2, "Informe seu nome").max(80),
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
      .input(credentialsSchema)
      .mutation(async ({ ctx, input }) => {
        const email = normalizeEmail(input.email);
        const record = await db.getUserRecordByEmail(email);

        if (!record?.passwordHash) {
          await hashPassword(input.password);
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "E-mail ou senha inválidos",
          });
        }

        const validPassword = await verifyPassword(input.password, record.passwordHash);
        if (!validPassword) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "E-mail ou senha inválidos",
          });
        }

        await db.updateLastSignedIn(record.id);
        await setLocalSession(ctx.req, ctx.res, record.id);
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
          await sendPasswordResetCode({ to: email, code });
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
          password: credentialsSchema.shape.password,
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
