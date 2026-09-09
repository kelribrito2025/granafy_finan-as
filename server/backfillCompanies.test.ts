import { describe, expect, it } from "vitest";
import {
  backfillSql,
  donoCruzadoSql,
  EMPRESA_PADRAO_SQL,
  nulosSql,
  TABELAS_COM_EMPRESA,
  totalSql,
} from "./backfillCompanies";

describe("os comandos do backfill", () => {
  it("cobre exatamente as treze tabelas que ganham companyId", () => {
    expect(TABELAS_COM_EMPRESA).toHaveLength(13);
    // Sem repetida: uma tabela listada duas vezes rodaria o UPDATE duas vezes
    // e faria a contagem final mentir.
    expect(new Set(TABELAS_COM_EMPRESA).size).toBe(13);
  });

  it("recusa qualquer nome fora da lista", () => {
    /*
     * O nome vira SQL cru — tabela não pode ser parâmetro. A lista fixa é o que
     * impede um nome vindo de fora de virar comando.
     */
    for (const construtor of [backfillSql, nulosSql, donoCruzadoSql, totalSql]) {
      expect(() => construtor("users")).toThrow(/fora da lista/);
      expect(() => construtor("transactions; DROP TABLE users")).toThrow(/fora da lista/);
      expect(() => construtor("")).toThrow(/fora da lista/);
    }
  });

  it("o UPDATE é repetível — sempre com o filtro de nulos", () => {
    /*
     * Sem esta cláusula o comando deixa de ser repetível: rodar de novo
     * reescreveria linhas já adotadas. Com ela, uma parada no meio se resolve
     * rodando outra vez.
     */
    for (const tabela of TABELAS_COM_EMPRESA) {
      expect(backfillSql(tabela)).toContain("WHERE x.companyId IS NULL");
    }
  });

  it("o UPDATE junta pelo dono e escreve o id da empresa", () => {
    const sql = backfillSql("transactions");
    expect(sql).toContain("JOIN companyProfiles c ON c.userId = x.userId");
    expect(sql).toContain("SET x.companyId = c.id");
  });

  it("a invariante procura linha com empresa de outro dono", () => {
    const sql = donoCruzadoSql("transactions");
    expect(sql).toContain("JOIN companyProfiles c ON c.id = x.companyId");
    expect(sql).toContain("c.userId <> x.userId");
  });

  it("a empresa padrão nasce vazia e só para quem não tem nenhuma", () => {
    // Razão social inventada não entra no banco: o rótulo é da tela.
    expect(EMPRESA_PADRAO_SQL).toContain("SELECT u.id, '', '', ''");
    expect(EMPRESA_PADRAO_SQL).toContain("WHERE NOT EXISTS");
  });
});
