import { describe, expect, it } from "vitest";
import { isDuplicateDatabaseError } from "./routers/organization";

describe("organization persistence errors", () => {
  it("recognizes a duplicate entry nested in the Drizzle query error cause", () => {
    const error = new Error("Failed query: insert into financialAccounts");
    Object.assign(error, {
      cause: {
        code: "ER_DUP_ENTRY",
        errno: 1062,
        sqlState: "23000",
        sqlMessage: "Duplicate entry for key financial_accounts_user_name_uidx",
      },
    });

    expect(isDuplicateDatabaseError(error)).toBe(true);
  });

  it("does not classify unrelated database failures as name conflicts", () => {
    expect(isDuplicateDatabaseError({
      code: "ETIMEDOUT",
      message: "Connection timed out",
    })).toBe(false);
  });
});
