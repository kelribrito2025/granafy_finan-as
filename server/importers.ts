import { createHash } from "node:crypto";

export type ParsedImportRow = {
  sourceIndex: number;
  transactionDate: string;
  description: string;
  contact: string;
  amount: number;
  type: "entrada" | "saida";
  externalId: string | null;
  occurrence: number;
  fingerprint: string;
};

export type ImportClassification = "auto" | "entrada" | "saida";

type DraftRow = Omit<ParsedImportRow, "occurrence" | "fingerprint">;

const DATE_ALIASES = ["data", "date", "transactiondate", "dtposted", "dtuser", "datadolancamento"];
const DESCRIPTION_ALIASES = ["descricao", "description", "historico", "memo", "name", "payee", "lancamento"];
const AMOUNT_ALIASES = ["valor", "amount", "trnamt", "montante"];
const CREDIT_ALIASES = ["credito", "credit", "entrada", "receita"];
const DEBIT_ALIASES = ["debito", "debit", "saida", "despesa"];
const TYPE_ALIASES = ["tipo", "type", "trntype", "natureza"];
const CONTACT_ALIASES = ["contato", "contact", "fornecedor", "cliente", "beneficiario", "favorecido"];
const ID_ALIASES = ["id", "fitid", "transactionid", "identificador", "documento"];

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function firstIndex(headers: string[], aliases: string[]) {
  return aliases.map(alias => headers.indexOf(alias)).find(index => index >= 0) ?? -1;
}

function countDelimiter(line: string, delimiter: string) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') quoted = !quoted;
    else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

export function detectCsvDelimiter(content: string) {
  const firstLine = content.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const options = [";", ",", "\t"];
  return options.sort((a, b) => countDelimiter(firstLine, b) - countDelimiter(firstLine, a))[0];
}

export function parseCsvMatrix(content: string, delimiter = detectCsvDelimiter(content)) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = content.replace(/^\uFEFF/, "");

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some(value => value.length > 0)) rows.push(row);
  return rows;
}

export function parseImportDate(value: string) {
  const cleaned = value.trim();
  let year: number;
  let month: number;
  let day: number;
  let match: RegExpMatchArray | null;

  if ((match = cleaned.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/))) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else if ((match = cleaned.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) {
    day = Number(match[1]);
    month = Number(match[2]);
    year = Number(match[3]);
  } else {
    throw new Error(`Data inválida: ${value}`);
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    throw new Error(`Data inválida: ${value}`);
  }
  return date.toISOString().slice(0, 10);
}

export function parseImportAmount(value: string) {
  let cleaned = value.trim().replace(/R\$/gi, "").replace(/\s/g, "");
  const negative = cleaned.startsWith("-") || (cleaned.startsWith("(") && cleaned.endsWith(")"));
  cleaned = cleaned.replace(/[()\-+]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    cleaned = lastComma > lastDot ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }

  const amount = Number(cleaned);
  if (!Number.isFinite(amount) || amount === 0) throw new Error(`Valor inválido: ${value}`);
  return negative ? -Math.abs(amount) : amount;
}

function getTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function cleanDescription(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return (cleaned || "Lançamento importado").slice(0, 180);
}

export function parseCsv(content: string): DraftRow[] {
  const matrix = parseCsvMatrix(content);
  if (matrix.length < 2) throw new Error("O CSV não possui linhas de dados");
  const headers = matrix[0].map(normalizeHeader);
  const dateIndex = firstIndex(headers, DATE_ALIASES);
  const descriptionIndex = firstIndex(headers, DESCRIPTION_ALIASES);
  const amountIndex = firstIndex(headers, AMOUNT_ALIASES);
  const creditIndex = firstIndex(headers, CREDIT_ALIASES);
  const debitIndex = firstIndex(headers, DEBIT_ALIASES);
  const typeIndex = firstIndex(headers, TYPE_ALIASES);
  const contactIndex = firstIndex(headers, CONTACT_ALIASES);
  const idIndex = firstIndex(headers, ID_ALIASES);

  if (dateIndex < 0 || descriptionIndex < 0 || (amountIndex < 0 && creditIndex < 0 && debitIndex < 0)) {
    throw new Error("CSV incompatível. Inclua colunas de data, descrição e valor (ou crédito/débito).");
  }

  return matrix.slice(1).map((values, rowIndex) => {
    try {
      let rawAmount = amountIndex >= 0 ? values[amountIndex] : "";
      if (!rawAmount && creditIndex >= 0 && values[creditIndex]) rawAmount = values[creditIndex];
      if (!rawAmount && debitIndex >= 0 && values[debitIndex]) rawAmount = `-${values[debitIndex]}`;
      let amount = parseImportAmount(rawAmount);
      const explicitType = typeIndex >= 0 ? normalizeHeader(values[typeIndex] ?? "") : "";
      if (["saida", "debito", "despesa", "debit"].includes(explicitType)) amount = -Math.abs(amount);
      if (["entrada", "credito", "receita", "credit"].includes(explicitType)) amount = Math.abs(amount);

      return {
        sourceIndex: rowIndex + 2,
        transactionDate: parseImportDate(values[dateIndex] ?? ""),
        description: cleanDescription(values[descriptionIndex] ?? ""),
        contact: contactIndex >= 0 ? (values[contactIndex] ?? "").slice(0, 120) : "",
        amount,
        type: amount < 0 ? "saida" as const : "entrada" as const,
        externalId: idIndex >= 0 ? (values[idIndex] || null) : null,
      };
    } catch (error) {
      throw new Error(`Linha ${rowIndex + 2}: ${error instanceof Error ? error.message : "dados inválidos"}`);
    }
  });
}

export function parseOfx(content: string): DraftRow[] {
  const blocks = content.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTTRN>|$)/gi) ?? [];
  if (!blocks.length) throw new Error("Nenhuma transação foi encontrada no arquivo OFX");

  return blocks.map((block, rowIndex) => {
    const amount = parseImportAmount(getTag(block, "TRNAMT"));
    const name = getTag(block, "NAME");
    const memo = getTag(block, "MEMO");
    const description = cleanDescription(name && memo && normalizeHeader(name) !== normalizeHeader(memo) ? `${name} · ${memo}` : name || memo);
    return {
      sourceIndex: rowIndex + 1,
      transactionDate: parseImportDate(getTag(block, "DTPOSTED") || getTag(block, "DTUSER")),
      description,
      contact: name.slice(0, 120),
      amount,
      type: amount < 0 ? "saida" : "entrada",
      externalId: getTag(block, "FITID") || null,
    };
  });
}

export function fingerprintRows(userId: number, accountId: number, rows: DraftRow[]): ParsedImportRow[] {
  const occurrences = new Map<string, number>();
  return rows.map(row => {
    const identity = row.externalId
      ? `external:${row.externalId}`
      : `row:${row.transactionDate}|${row.amount.toFixed(2)}|${normalizeHeader(row.description)}`;
    const occurrence = row.externalId ? 1 : (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, occurrence);
    const fingerprint = createHash("sha256").update(`${userId}|${accountId}|${identity}|${occurrence}`).digest("hex");
    return { ...row, occurrence, fingerprint };
  });
}

export function applyImportClassification(rows: ParsedImportRow[], classification: ImportClassification) {
  if (classification === "auto") return rows;
  return rows.map(row => ({
    ...row,
    type: classification,
    amount: classification === "entrada" ? Math.abs(row.amount) : -Math.abs(row.amount),
  }));
}

export function findCompatibleImportCategory<T extends { id: number; type: "entrada" | "saida" | "ambos" }>(
  categories: T[],
  type: "entrada" | "saida",
  preferredId?: number | null,
) {
  const preferred = preferredId ? categories.find(category => category.id === preferredId) : undefined;
  if (preferred && (preferred.type === type || preferred.type === "ambos")) return preferred;
  return categories.find(category => category.type === type)
    ?? categories.find(category => category.type === "ambos");
}

export function parseImportFile(input: { userId: number; accountId: number; format: "csv" | "ofx"; content: string }) {
  const rows = input.format === "csv" ? parseCsv(input.content) : parseOfx(input.content);
  if (rows.length > 1_000) throw new Error("O arquivo possui mais de 1.000 lançamentos. Divida-o em partes menores.");
  return fingerprintRows(input.userId, input.accountId, rows);
}
