import type { TrpcContext } from "./_core/context";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const user: AuthenticatedUser = {
  id: 1,
  openId: "auth-test-user",
  name: "Giovani",
  email: "giovani@example.com",
  loginMethod: "manus",
  role: "user",
  createdAt: new Date("2026-09-06T12:00:00.000Z"),
  updatedAt: new Date("2026-09-06T12:00:00.000Z"),
  lastSignedIn: new Date("2026-09-06T12:00:00.000Z"),
};

describe("auth.me", () => {
  it("returns null for an anonymous visitor", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(caller.auth.me()).resolves.toBeNull();
  });

  it("returns the current authenticated user", async () => {
    const caller = appRouter.createCaller(createContext(user));

    await expect(caller.auth.me()).resolves.toEqual(user);
  });
});
