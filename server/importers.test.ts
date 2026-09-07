import { describe, expect, it } from "vitest";
import { applyImportClassification, detectCsvDelimiter, fingerprintRows, parseCsv, parseImportAmount, parseImportDate, parseOfx } from "./importers";

describe("financial file importers", () => {
  it("parses Brazilian amounts and dates", () => {
    expect(parseImportAmount("R$ 1.234,56")).toBe(1234.56);
    expect(parseImportAmount("-1,234.56")).toBe(-1234.56);
    expect(parseImportAmount("(45,90)")).toBe(-45.9);
    expect(parseImportDate("07/09/2026")).toBe("2026-09-07");
    expect(parseImportDate("20260907120000[-3:BRT]")).toBe("2026-09-07");
  });

  it("parses semicolon CSV with quoted values and explicit debit type", () => {
    const content = 'Data;Descrição;Valor;Tipo;Contato\n07/09/2026;"Fornecedor; Cloud";1.234,56;Débito;Cloud Ltda\n08/09/2026;Venda;250,00;Crédito;Cliente A';
    expect(detectCsvDelimiter(content)).toBe(";");
    expect(parseCsv(content)).toEqual([
      expect.objectContaining({ transactionDate: "2026-09-07", description: "Fornecedor; Cloud", amount: -1234.56, type: "saida", contact: "Cloud Ltda" }),
      expect.objectContaining({ transactionDate: "2026-09-08", description: "Venda", amount: 250, type: "entrada", contact: "Cliente A" }),
    ]);
  });

  it("parses OFX SGML transactions with FITID", () => {
    const content = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260907120000[-3:BRT]<TRNAMT>-89.90<FITID>abc-1<NAME>Provedor<MEMO>Hospedagem
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260908<TRNAMT>500.00<FITID>abc-2<NAME>Cliente
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    expect(parseOfx(content)).toEqual([
      expect.objectContaining({ transactionDate: "2026-09-07", amount: -89.9, type: "saida", externalId: "abc-1", description: "Provedor · Hospedagem" }),
      expect.objectContaining({ transactionDate: "2026-09-08", amount: 500, type: "entrada", externalId: "abc-2" }),
    ]);
  });

  it("keeps identical CSV rows distinct while making re-import fingerprints stable", () => {
    const rows = parseCsv("Data;Descrição;Valor\n07/09/2026;Tarifa;10,00\n07/09/2026;Tarifa;10,00");
    const first = fingerprintRows(7, 9, rows);
    const second = fingerprintRows(7, 9, rows);
    expect(first[0].fingerprint).toBe(second[0].fingerprint);
    expect(first[0].fingerprint).not.toBe(first[1].fingerprint);
  });

  it("uses the same fingerprint for a repeated OFX FITID", () => {
    const rows = parseOfx("<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260907<TRNAMT>-10<FITID>same-id<NAME>Tarifa<STMTTRN><DTPOSTED>20260907<TRNAMT>-10<FITID>same-id<NAME>Tarifa</BANKTRANLIST></OFX>");
    const fingerprinted = fingerprintRows(3, 4, rows);
    expect(fingerprinted).toHaveLength(2);
    expect(fingerprinted[0].fingerprint).toBe(fingerprinted[1].fingerprint);
  });

  it("can classify every imported row as revenue or expense while preserving identity", () => {
    const rows = fingerprintRows(3, 4, parseOfx("<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260907<TRNAMT>-10<FITID>same-id<NAME>Ajuste</BANKTRANLIST></OFX>"));
    const revenue = applyImportClassification(rows, "entrada");
    const expense = applyImportClassification(rows, "saida");
    expect(revenue[0]).toMatchObject({ type: "entrada", amount: 10, fingerprint: rows[0].fingerprint });
    expect(expense[0]).toMatchObject({ type: "saida", amount: -10, fingerprint: rows[0].fingerprint });
    expect(applyImportClassification(rows, "auto")).toBe(rows);
  });

  it("rejects CSV without required financial columns", () => {
    expect(() => parseCsv("Nome;Cidade\nAna;São Paulo")).toThrow(/CSV incompatível/);
  });
});
