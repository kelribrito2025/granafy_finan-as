import { createConnection } from "mysql2/promise";
import { describe, expect, it } from "vitest";

function getConnectionConfig() {
  const rawUrl = process.env.TIDB_DATABASE_URL;
  if (!rawUrl) {
    throw new Error("TIDB_DATABASE_URL is required");
  }

  const url = new URL(rawUrl);
  return {
    host: url.hostname,
    port: Number(url.port || "4000"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: {
      minVersion: "TLSv1.2" as const,
      rejectUnauthorized: true,
    },
    connectTimeout: 10_000,
  };
}

describe("TiDB Cloud connection", () => {
  it("connects securely and exposes every migrated application table", async () => {
    const connection = await createConnection(getConnectionConfig());

    try {
      const [rows] = await connection.query<Array<{ ok: number }>>("SELECT 1 AS ok");
      expect(rows[0]?.ok).toBe(1);
      const [tables] = await connection.query<Array<{ count: number }>>(
        "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users', 'passwordResetRequests', 'transactions', 'financialAccounts', 'transactionCategories', 'transactionImportBatches')"
      );
      expect(Number(tables[0]?.count)).toBe(6);
      const [columns] = await connection.query<Array<{ count: number }>>(
        "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME IN ('accountId', 'categoryId', 'importBatchId', 'externalId', 'fingerprint')"
      );
      expect(Number(columns[0]?.count)).toBe(5);
    } finally {
      await connection.end();
    }
  }, 15_000);
});
