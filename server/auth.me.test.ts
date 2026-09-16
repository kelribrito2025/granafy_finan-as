import type { TrpcContext } from "./_core/context";
import { describe, expect, it } from "vitest";
import { umContexto, umUsuario } from "./fixtures";
import { appRouter } from "./routers";

const createContext = (user: TrpcContext["user"]) => umContexto({ user });

const user = umUsuario({ openId: "auth-test-user", name: "Giovani", email: "giovani@example.com", loginMethod: "manus" });

describe("auth.me", () => {
  it("returns null for an anonymous visitor", async () => {
    const caller = appRouter.createCaller(createContext(null));

    await expect(caller.auth.me()).resolves.toBeNull();
  });

  it("returns the current authenticated user", async () => {
    const caller = appRouter.createCaller(createContext(user));

    // `papel` vai junto desde a Fase D: é o que a tela usa para esconder a escrita do contador.
    await expect(caller.auth.me()).resolves.toEqual({ ...user, activeCompanyId: 1, papel: "dono" });
  });
});
