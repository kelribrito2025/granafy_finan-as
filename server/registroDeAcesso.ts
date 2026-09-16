import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { COMPANY_COOKIE_NAME } from "@shared/const";
import { pickActiveCompany } from "@shared/activeCompany";
import { valorDoCookie } from "./_core/context";
import * as db from "./db";

/*
 * O que entra no registro de acesso — Fase E.
 *
 * Três eventos, e todos com a mesma regra: registrar NUNCA falha a operação
 * que registra. Um INSERT que der errado vai para o log do servidor e a
 * pessoa entra, troca ou exporta do mesmo jeito. Auditoria que derruba o
 * login é auditoria que alguém desliga.
 */

function silencioso(promessa: Promise<unknown>, evento: string) {
  return promessa.catch(erro => {
    console.error(`[registro-de-acesso] ${evento} não gravado:`, erro instanceof Error ? erro.message : erro);
  });
}

/**
 * A entrada. A empresa registrada é a que o PRÓXIMO request vai abrir —
 * resolvida aqui com a mesma regra do contexto (visíveis mais cookie), para
 * o registro dizer a empresa certa e não "a primeira da lista".
 */
export async function registrarEntrada(req: CreateExpressContextOptions["req"], atorId: number) {
  await silencioso((async () => {
    const empresas = await db.empresasVisiveisPara(atorId);
    const cru = valorDoCookie(req, COMPANY_COOKIE_NAME);
    const pedida = cru !== null && /^\d+$/.test(cru) ? Number(cru) : null;
    const escolha = pickActiveCompany({ empresas, pedida });
    if (escolha.status !== "ok") return;
    await db.registrarAcesso(atorId, { companyId: escolha.companyId, event: "entrada" });
  })(), "entrada");
}

export async function registrarTroca(atorId: number, companyId: number) {
  await silencioso(db.registrarAcesso(atorId, { companyId, event: "troca" }), "troca");
}

/** Declarado pela tela: o servidor não participa do CSV, só anota o que ela disse. */
export async function registrarExportacao(atorId: number, companyId: number, relatorio: string) {
  await silencioso(db.registrarAcesso(atorId, { companyId, event: "exportacao", detail: relatorio }), "exportacao");
}
