import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  CURRENCIES,
  DATE_FORMATS,
  DEFAULT_PERIODS,
  DEFAULT_PREFERENCES,
} from "@shared/preferences";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

const companyValuesSchema = z.object({
  legalName: z.string().trim().max(180).default(""),
  tradeName: z.string().trim().max(180).default(""),
  taxId: z.string().trim().max(20).default(""),
  stateRegistration: z.string().trim().max(30).default(""),
  taxRegime: z.enum(["simples", "presumido", "real", "mei", "outro"]).default("simples"),
  financeEmail: z.string().trim().max(320).default("").refine(
    value => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Informe um e-mail válido"
  ),
  zipCode: z.string().trim().max(9).default(""),
  street: z.string().trim().max(180).default(""),
  streetNumber: z.string().trim().max(20).default(""),
  complement: z.string().trim().max(120).default(""),
  district: z.string().trim().max(120).default(""),
  city: z.string().trim().max(120).default(""),
  state: z.string().trim().max(2).default(""),
  country: z.string().trim().max(60).default("Brasil"),
});

const preferencesValuesSchema = z.object({
  defaultPeriod: z.enum(DEFAULT_PERIODS),
  currency: z.enum(CURRENCIES),
  timeZone: z.string().trim().min(1).max(60),
  dateFormat: z.enum(DATE_FORMATS),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
});

const EMPTY_COMPANY = companyValuesSchema.parse({});

export const settingsRouter = router({
  company: protectedProcedure.query(async ({ ctx }) => {
    const profile = await db.getCompanyProfile(ctx.user.id);
    if (!profile) return { ...EMPTY_COMPANY, logoKey: null, logoName: null };
    const { id: _id, userId: _userId, createdAt: _createdAt, updatedAt: _updatedAt, ...values } = profile;
    return values;
  }),

  saveCompany: protectedProcedure.input(companyValuesSchema).mutation(async ({ ctx, input }) => {
    await db.saveCompanyProfile(ctx.user.id, { ...input, state: input.state.toUpperCase() });
    return { success: true } as const;
  }),

  preferences: protectedProcedure.query(async ({ ctx }) => {
    const saved = await db.getUserPreferences(ctx.user.id);
    if (!saved) return DEFAULT_PREFERENCES;
    return {
      defaultPeriod: saved.defaultPeriod,
      currency: saved.currency,
      timeZone: saved.timeZone,
      dateFormat: saved.dateFormat,
      fiscalYearStartMonth: saved.fiscalYearStartMonth,
    };
  }),

  savePreferences: protectedProcedure.input(preferencesValuesSchema).mutation(async ({ ctx, input }) => {
    await db.saveUserPreferences(ctx.user.id, input);
    return { success: true } as const;
  }),

  /**
   * Consulta o CEP no ViaCEP. É uma chamada externa e pode falhar sem que isso
   * seja problema do cadastro: o erro só impede o preenchimento automático, e o
   * usuário continua podendo digitar o endereço.
   */
  lookupZipCode: protectedProcedure
    .input(z.object({ zipCode: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido") }))
    .query(async ({ input }) => {
      const digits = input.zipCode.replace(/\D/g, "");
      try {
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
          signal: AbortSignal.timeout(6000),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as {
          erro?: boolean | string;
          logradouro?: string;
          bairro?: string;
          localidade?: string;
          uf?: string;
        };
        if (data.erro) throw new TRPCError({ code: "NOT_FOUND", message: "CEP não encontrado" });
        return {
          street: data.logradouro ?? "",
          district: data.bairro ?? "",
          city: data.localidade ?? "",
          state: data.uf ?? "",
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível consultar o CEP agora. Preencha o endereço manualmente.",
        });
      }
    }),
});
