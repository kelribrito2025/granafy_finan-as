import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { companyDisplayName } from "@shared/companies";
import { isPasswordValid, PASSWORD_REQUIREMENT_MESSAGE } from "@shared/password";
import { ENV } from "../_core/env";
import { escritaProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { hashPassword, normalizeEmail, setLocalSession } from "../auth";
import {
  caminhoDoConvite,
  conviteValido,
  gerarLoteDeConvite,
  gerarTokenDeConvite,
  hashDoConvite,
  motivoDaRecusa,
  VALIDADE_DO_CONVITE_MS,
} from "../convites";
import * as db from "../db";
import { sendCompanyInvite } from "../email";

/*
 * Acessos — Fase C do acesso do contador.
 *
 * O dono convida por e-mail, escolhe quais das SUAS empresas libera, vê quem
 * já tem acesso e revoga. O convidado aceita em `/convite/<token>`: com a
 * conta que já tem, ou criando a senha ali.
 *
 * Tudo aqui é por DONO, não por empresa ativa: um convite cobre várias
 * empresas, e a tela lista os acessos de todas. Por isso as funções de banco
 * recebem `ctx.ator` e conferem a posse de cada empresa uma a uma — e por isso
 * `convidar` e `revogar` são `escritaProcedure` mesmo sem tocar na empresa
 * aberta: são escritas, e quem está como contador em alguma empresa não
 * convida ninguém para lugar nenhum.
 */

const emailSchema = z.string().trim().email("Informe um e-mail válido").max(320);
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Convite inválido");

function nomeDaEmpresa(empresa: { legalName: string; tradeName: string }, nomeDoDono: string | null) {
  return companyDisplayName(empresa, nomeDoDono ?? "");
}

/** A base do link do convite: a URL pública, ou a do próprio request em desenvolvimento. */
function baseDoLink(req: { protocol: string; get(nome: string): string | undefined }) {
  const publica = ENV.publicUrl.replace(/\/$/, "");
  if (publica) return publica;
  const host = req.get("host");
  return host ? `${req.protocol}://${host}` : "";
}

export const acessosRouter = router({
  /**
   * Tudo o que a aba mostra, numa chamada: as empresas do dono (para marcar no
   * convite), os convites em aberto e quem já tem acesso, agrupado por pessoa.
   */
  visaoGeral: protectedProcedure.query(async ({ ctx }) => {
    const [empresas, convites, acessos] = await Promise.all([
      db.listCompanies(ctx.user.id),
      db.listarConvitesPendentes(ctx.ator),
      db.listarAcessos(ctx.ator),
    ]);

    const nome = ctx.user.name ?? "";

    const porLote = new Map<string, { lote: string; email: string; empresas: { id: number; nome: string }[]; expiraEm: Date; criadoEm: Date }>();
    for (const linha of convites) {
      const grupo = porLote.get(linha.lote) ?? { lote: linha.lote, email: linha.email, empresas: [], expiraEm: linha.expiresAt, criadoEm: linha.createdAt };
      grupo.empresas.push({ id: linha.companyId, nome: nomeDaEmpresa(linha, nome) });
      porLote.set(linha.lote, grupo);
    }

    const porPessoa = new Map<number, { contadorId: number; nome: string; email: string; empresas: { id: number; nome: string; desde: Date }[] }>();
    for (const linha of acessos) {
      const grupo = porPessoa.get(linha.contadorId) ?? { contadorId: linha.contadorId, nome: linha.nome ?? "", email: linha.email ?? "", empresas: [] };
      grupo.empresas.push({ id: linha.companyId, nome: nomeDaEmpresa(linha, nome), desde: linha.desde });
      porPessoa.set(linha.contadorId, grupo);
    }

    return {
      empresas: empresas.filter(e => e.isActive).map(e => ({ id: e.id, nome: nomeDaEmpresa(e, nome), atual: e.id === ctx.activeCompanyId })),
      convites: [...porLote.values()],
      acessos: [...porPessoa.values()],
      emailConfigurado: Boolean(process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM_EMAIL),
    };
  }),

  /**
   * Convida. Devolve o link SEMPRE, além de tentar o e-mail: sem Resend
   * configurado (o ambiente local, por exemplo) o dono manda o link por outro
   * caminho, e o aceite continua preso ao e-mail convidado do mesmo jeito.
   */
  convidar: escritaProcedure
    .input(z.object({
      email: emailSchema,
      companyIds: z.array(z.number().int().positive()).min(1, "Escolha pelo menos uma empresa").max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const email = normalizeEmail(input.email);
      if (ctx.user.email && normalizeEmail(ctx.user.email) === email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esse é o seu próprio e-mail — você já é o dono." });
      }

      const proprias = await db.listCompanies(ctx.user.id);
      const escolhidas = proprias.filter(e => input.companyIds.includes(e.id));
      if (escolhidas.length !== new Set(input.companyIds).size) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Uma das empresas não é sua." });
      }

      const token = gerarTokenDeConvite();
      const lote = gerarLoteDeConvite();
      try {
        await db.criarConvite(ctx.ator, {
          email,
          companyIds: escolhidas.map(e => e.id),
          lote,
          tokenHash: hashDoConvite(token),
          expiresAt: new Date(Date.now() + VALIDADE_DO_CONVITE_MS),
        });
      } catch (erro) {
        if (erro instanceof db.EmpresaNaoEDoAtor) throw new TRPCError({ code: "FORBIDDEN", message: erro.message });
        throw erro;
      }

      const nomeDoDono = ctx.user.name?.trim() || ctx.user.email || "O dono da empresa";
      let enviado = false;
      try {
        enviado = await sendCompanyInvite({
          to: email,
          nomeDoDono,
          empresas: escolhidas.map(e => nomeDaEmpresa(e, ctx.user.name ?? "")),
          token,
        });
      } catch (erro) {
        // O convite já existe; a falha do Resend fica no log e o link vai na resposta.
        console.error("[resend] convite não enviado:", erro instanceof Error ? erro.message : erro);
      }

      return { lote, enviado, link: `${baseDoLink(ctx.req)}${caminhoDoConvite(token)}` };
    }),

  /** Cancela um convite em aberto. Um clique antigo no e-mail passa a dizer "não vale mais". */
  cancelarConvite: escritaProcedure
    .input(z.object({ lote: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await db.revogarConvite(ctx.ator, input.lote);
      return { success: true } as const;
    }),

  /** Tira o acesso de uma pessoa a uma empresa. Vale no request seguinte dela. */
  revogar: escritaProcedure
    .input(z.object({ contadorId: z.number().int().positive(), companyId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db.revogarAcesso(ctx.ator, input);
      } catch (erro) {
        if (erro instanceof db.EmpresaNaoEDoAtor) throw new TRPCError({ code: "FORBIDDEN", message: erro.message });
        throw erro;
      }
      return { success: true } as const;
    }),

  /**
   * O que a página do aceite mostra, ANTES de qualquer login.
   *
   * Pública porque quem chega pelo e-mail ainda não entrou. O que ela revela
   * está preso ao token — 256 bits que só o convidado recebeu — e é o que a
   * pessoa precisa para decidir: quem convidou, para quais empresas, com qual
   * e-mail entrar, e se esse e-mail já tem conta.
   */
  convite: publicProcedure
    .input(z.object({ token: tokenSchema }))
    .query(async ({ ctx, input }) => {
      const linhas = await db.convitePorToken(hashDoConvite(input.token));
      const agora = new Date();
      if (!conviteValido(linhas, agora)) {
        return { status: "invalido" as const, motivo: motivoDaRecusa(linhas, agora) ?? "inexistente" };
      }
      const primeira = linhas[0]!;
      const conta = await db.getUserRecordByEmail(primeira.email);
      return {
        status: "valido" as const,
        email: primeira.email,
        convidadoPor: primeira.nomeDoDono?.trim() || "O dono da empresa",
        empresas: linhas.map(l => nomeDaEmpresa(l, primeira.nomeDoDono)),
        jaTemConta: Boolean(conta),
        /** Se quem está logado agora é o convidado. Null sem sessão. */
        sessaoConfere: ctx.user ? normalizeEmail(ctx.user.email ?? "") === primeira.email : null,
      };
    }),

  /** Aceita com a sessão de quem já está logado. O e-mail tem que bater. */
  aceitar: protectedProcedure
    .input(z.object({ token: tokenSchema }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await db.aceitarConvite(ctx.ator, {
          tokenHash: hashDoConvite(input.token),
          email: normalizeEmail(ctx.user.email ?? ""),
        });
      } catch (erro) {
        if (erro instanceof db.ConviteDeOutroEmail) throw new TRPCError({ code: "FORBIDDEN", message: erro.message });
        if (erro instanceof db.ConviteInvalido) throw new TRPCError({ code: "BAD_REQUEST", message: erro.message });
        throw erro;
      }
    }),

  /**
   * Aceita CRIANDO a conta, para quem ainda não tem login.
   *
   * O e-mail da conta nova é o do convite, não um digitado: é a única forma de
   * o aceite provar que o link chegou a quem devia. Nasce com a empresa padrão
   * como qualquer cadastro — é o que faz `protectedProcedure` funcionar para
   * essa pessoa no request seguinte, antes mesmo de ela abrir a do cliente.
   */
  aceitarCriandoConta: publicProcedure
    .input(z.object({
      token: tokenSchema,
      name: z.string().trim().min(2, "Informe seu nome").max(80),
      password: z.string().min(8).max(128).refine(isPasswordValid, PASSWORD_REQUIREMENT_MESSAGE),
      acceptedTerms: z.literal(true, { message: "É preciso aceitar os termos de uso e a política de privacidade" }),
    }))
    .mutation(async ({ ctx, input }) => {
      const tokenHash = hashDoConvite(input.token);
      const linhas = await db.convitePorToken(tokenHash);
      if (!conviteValido(linhas, new Date())) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Este convite não vale mais. Peça um novo a quem convidou." });
      }
      const email = linhas[0]!.email;
      if (await db.getUserRecordByEmail(email)) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe uma conta com este e-mail. Entre com a sua senha para aceitar." });
      }

      const user = await db.createLocalUser({ email, name: input.name, passwordHash: await hashPassword(input.password) });
      const aceite = await db.aceitarConvite(user.id, { tokenHash, email });
      await setLocalSession(ctx.req, ctx.res, user.id);
      return aceite;
    }),
});
