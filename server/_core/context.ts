import { COMPANY_COOKIE_NAME } from "@shared/const";
import { pickActiveCompany } from "@shared/activeCompany";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { CompanyProfileRecord, User } from "../../drizzle/schema";
import { sessionUserIdFrom } from "../auth";
import * as db from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** As empresas do login, na ordem da lista. Vazia para visita. */
  companies: CompanyProfileRecord[];
  /** A empresa deste request. Null para visita — e para a conta sem empresa. */
  activeCompanyId: number | null;
  /** `false` quando veio um pedido de empresa e ele foi ignorado. */
  companyRequestHonored: boolean;
};

/** O que o cookie da empresa escolhida diz, se disser algo válido. */
function empresaPedida(req: CreateExpressContextOptions["req"]) {
  const cabecalho = req.headers.cookie ?? "";
  const par = cabecalho
    .split(";")
    .map(valor => valor.trim())
    .find(valor => valor.startsWith(`${COMPANY_COOKIE_NAME}=`));
  if (!par) return null;

  /*
   * Vem do cliente, então vem sujo até prova em contrário. Aqui só se decide
   * se é um número; se ele pertence ou não a quem pediu é decisão do
   * `pickActiveCompany`, contra a lista do banco. Um `Number("")` daria 0 e um
   * id 0 nunca existe, mas prefiro recusar explicitamente a depender disso.
   */
  /*
   * Sem `.trim()` no VALOR, de propósito. O trim do PAR acima é necessário —
   * o separador de cookies é "; " — mas aparar o valor faria " 12" virar um
   * pedido pela empresa 12. Não é furo, porque a posse ainda é conferida contra
   * a lista do dono, mas aceitar o que não devia ser aceito é como um furo
   * começa. Um valor legítimo nunca tem espaço.
   */
  const cru = par.slice(COMPANY_COOKIE_NAME.length + 1);
  if (!/^\d+$/.test(cru)) return null;
  const numero = Number(cru);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const vazio = {
    req: opts.req,
    res: opts.res,
    user: null,
    companies: [],
    activeCompanyId: null,
    companyRequestHonored: true,
  } satisfies TrpcContext;

  /*
   * O dono sai do token, sem ir ao banco — e é isso que deixa as duas consultas
   * saírem em paralelo em vez de uma esperar a outra. Medido contra a produção:
   * o usuário sozinho custa 173 ms, as duas em série 352 ms, as duas em
   * paralelo 181 ms. A empresa ativa custa 8 ms, não 179.
   */
  let userId: number | null = null;
  try {
    userId = await sessionUserIdFrom(opts.req);
  } catch {
    // Autenticação é opcional para as procedures públicas.
    return vazio;
  }
  if (userId === null) return vazio;

  let registro: Awaited<ReturnType<typeof db.getUserRecordById>> | undefined;
  let companies: CompanyProfileRecord[] = [];
  try {
    [registro, companies] = await Promise.all([
      db.getUserRecordById(userId),
      db.listCompanies(userId),
    ]);
  } catch {
    return vazio;
  }
  if (!registro) return vazio;

  const escolha = pickActiveCompany({ empresas: companies, pedida: empresaPedida(opts.req) });

  return {
    req: opts.req,
    res: opts.res,
    user: db.toPublicUser(registro),
    companies,
    activeCompanyId: escolha.status === "ok" ? escolha.companyId : null,
    companyRequestHonored: escolha.status === "ok" ? escolha.pedidoAtendido : true,
  };
}
