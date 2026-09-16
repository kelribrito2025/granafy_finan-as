import type {
  BalanceSheetSnapshotRecord,
  CompanyProfileRecord,
  FinancialAccountRecord,
  PatrimonialItemRecord,
  TransactionRecord,
  User,
} from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import { papelDaEmpresa } from "./escopo";

/*
 * As fábricas de objeto para teste.
 *
 * Existem porque onze testes quebraram de uma vez quando o schema ganhou
 * `companyId`: cada arquivo montava o seu objeto na mão, com todos os campos
 * escritos literalmente, e uma coluna nova invalidava todos ao mesmo tempo. Pior:
 * ninguém percebia, porque os arquivos de teste estavam fora da checagem de
 * tipos — só apareceu ao fechar aquele buraco.
 *
 * Com uma fábrica por entidade, a próxima coluna se acrescenta em um lugar. O
 * teste continua dizendo só o que importa para ele:
 *
 *   umLancamento({ amount: "-120.50", status: "Pago" })
 *
 * O que não é dito assume um padrão coerente — e o `Partial` deixa o TypeScript
 * conferir os campos que o teste realmente escolhe.
 */

const AGORA = new Date("2026-09-09T12:00:00.000Z");

export function umUsuario(over: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "usuario-de-teste",
    name: "Usuário de Teste",
    email: "teste@example.com",
    loginMethod: "password",
    role: "user",
    createdAt: AGORA,
    updatedAt: AGORA,
    lastSignedIn: AGORA,
    onboardingCompletedAt: null,
    ...over,
  };
}

export function umaEmpresa(over: Partial<CompanyProfileRecord> = {}): CompanyProfileRecord {
  return {
    id: 1,
    userId: 1,
    legalName: "Empresa de Teste",
    tradeName: "",
    taxId: "",
    stateRegistration: "",
    taxRegime: "simples",
    financeEmail: "",
    logoKey: null,
    logoName: null,
    zipCode: "",
    street: "",
    streetNumber: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    country: "Brasil",
    isActive: true,
    sortOrder: 0,
    onboardingCompletedAt: null,
    categoryDefaultsVersion: 0,
    createdAt: AGORA,
    updatedAt: AGORA,
    ...over,
  };
}

/**
 * O contexto do tRPC de um request autenticado, sem tocar em banco.
 *
 * Desde a Fase A o contexto carrega quem está logado (`ator`) separado de quem
 * é dono do que se vê (o `userId` da empresa em `companies`). A fábrica mantém
 * os dois coerentes: a empresa ativa padrão pertence ao usuário padrão, e
 * `ator`/`papel` saem de `user` e `companies` — quem sobrescreve um, ganha o
 * outro ajustado, a não ser que sobrescreva também.
 */
export function umContexto(over: Partial<TrpcContext> = {}): TrpcContext {
  const user = over.user === undefined ? umUsuario() : over.user;
  const activeCompanyId = over.activeCompanyId === undefined ? 1 : over.activeCompanyId;
  const companies = over.companies ?? (user ? [umaEmpresa({ id: activeCompanyId ?? 1, userId: user.id })] : []);
  const ativa = activeCompanyId === null ? undefined : companies.find(empresa => empresa.id === activeCompanyId);
  return {
    user,
    companies,
    activeCompanyId,
    ator: user?.id ?? null,
    papel: user && ativa ? papelDaEmpresa(user.id, ativa) : null,
    companyRequestHonored: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    ...over,
  };
}

export function umLancamento(over: Partial<TransactionRecord> = {}): TransactionRecord {
  return {
    id: 1,
    userId: 1,
    companyId: 1,
    type: "entrada",
    transactionDate: "2026-09-07",
    settledAt: null,
    description: "Teste",
    contact: "",
    category: "Validação",
    categoryId: null,
    costCenter: "",
    costCenterId: null,
    amount: "100.00",
    account: "Teste",
    accountId: null,
    status: "Pendente",
    recurring: false,
    recurringMonths: null,
    recurrenceGroupId: null,
    recurrenceIndex: null,
    transferGroupId: null,
    importBatchId: null,
    externalId: null,
    fingerprint: null,
    attachmentKey: null,
    attachmentName: null,
    createdAt: AGORA,
    updatedAt: AGORA,
    ...over,
  };
}

export function umaConta(over: Partial<FinancialAccountRecord> = {}): FinancialAccountRecord {
  return {
    id: 1,
    userId: 1,
    companyId: 1,
    name: "Efi Bank",
    institution: "Efi Bank",
    accountType: "corrente",
    color: "#12B85C",
    initialBalance: "0",
    initialBalanceDate: null,
    isActive: true,
    createdAt: AGORA,
    updatedAt: AGORA,
    ...over,
  };
}

export function umBem(over: Partial<PatrimonialItemRecord> = {}): PatrimonialItemRecord {
  return {
    id: 1,
    userId: 1,
    companyId: 1,
    name: "Bem de teste",
    itemType: "bem",
    balanceGroup: "ativo_nao_circulante",
    acquisitionDate: "2026-01-01",
    acquisitionValue: "1000.00",
    currentValue: "1000.00",
    valuationMethod: "manual",
    assetCategory: null,
    usefulLifeMonths: null,
    residualValue: "0.00",
    costCenter: "",
    costCenterId: null,
    sourceAccount: "",
    sourceAccountId: null,
    notes: "",
    attachmentKey: null,
    attachmentName: null,
    isActive: true,
    createdAt: AGORA,
    updatedAt: AGORA,
    ...over,
  };
}

export function umFechamento(over: Partial<BalanceSheetSnapshotRecord> = {}): BalanceSheetSnapshotRecord {
  return {
    id: 1,
    userId: 1,
    companyId: 1,
    referenceDate: "2026-09-30",
    cashAndEquivalents: "0",
    currentAssets: "0",
    nonCurrentAssets: "0",
    currentLiabilities: "0",
    nonCurrentLiabilities: "0",
    declaredEquity: "0",
    totalAssets: "0",
    totalLiabilities: "0",
    netWorth: "0",
    itemCount: 0,
    createdAt: AGORA,
    updatedAt: AGORA,
    ...over,
  };
}
