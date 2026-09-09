import { createConnection, type RowDataPacket } from "mysql2/promise";
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
      const [rows] = await connection.query<(RowDataPacket & { ok: number })[]>("SELECT 1 AS ok");
      expect(rows[0]?.ok).toBe(1);
      const [tables] = await connection.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users', 'passwordResetRequests', 'transactions', 'financialAccounts', 'transactionCategories', 'transactionImportBatches', 'patrimonialItems', 'balanceSheetSnapshots')"
      );
      expect(Number(tables[0]?.count)).toBe(8);
      const [columns] = await connection.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME IN ('accountId', 'categoryId', 'importBatchId', 'externalId', 'fingerprint')"
      );
      expect(Number(columns[0]?.count)).toBe(5);
      const [userColumns] = await connection.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'categoryDefaultsVersion'"
      );
      expect(Number(userColumns[0]?.count)).toBe(1);
      const [patrimonialColumns] = await connection.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'patrimonialItems' AND COLUMN_NAME IN ('balanceGroup', 'itemType', 'acquisitionValue', 'currentValue', 'valuationMethod', 'usefulLifeMonths', 'residualValue')"
      );
      expect(Number(patrimonialColumns[0]?.count)).toBe(7);
      const [snapshotColumns] = await connection.query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'balanceSheetSnapshots' AND COLUMN_NAME IN ('referenceDate', 'totalAssets', 'totalLiabilities', 'netWorth')"
      );
      expect(Number(snapshotColumns[0]?.count)).toBe(4);
    } finally {
      await connection.end();
    }
  }, 15_000);
});
