import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  clearLocalSession,
  hashPassword,
  normalizeEmail,
  setLocalSession,
  verifyPassword,
} from "./auth";
import * as db from "./db";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

const credentialsSchema = z.object({
  email: z.string().trim().email("Informe um e-mail válido").max(320),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres")
    .max(128, "A senha é muito longa"),
});

export const appRouter = router({
  system: systemRouter,
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

    logout: publicProcedure.mutation(({ ctx }) => {
      clearLocalSession(ctx.req, ctx.res);
      return { success: true } as const;
    }),
  }),
});

export type AppRouter = typeof appRouter;
