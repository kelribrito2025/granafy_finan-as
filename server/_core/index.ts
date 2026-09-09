import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { registerGoogleAuthRoutes } from "../googleAuth";
import { sessionUserIdFrom } from "../auth";
import path from "node:path";

/** O HTML da landing, no lugar em que cada ambiente o deixa. */
function landingIndex() {
  const raiz = process.env.NODE_ENV === "development"
    ? path.resolve(import.meta.dirname, "../..", "client", "public")
    : path.resolve(import.meta.dirname, "public");
  return path.join(raiz, "site", "index.html");
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerGoogleAuthRoutes(app);

  /*
   * A raiz atende dois públicos com a mesma URL.
   *
   * granafy.com é o endereço da landing: quem chega sem sessão vê a
   * explicação do produto. Quem chega com sessão válida vê o painel, no mesmo
   * endereço — o assinante não devia ter que passar pela página de vendas para
   * abrir o próprio caixa.
   *
   * A decisão sai do cookie, sem consultar o banco: é uma verificação de
   * assinatura, e visita anônima não paga a latência do TiDB por isso.
   */
  app.get("/", async (req, res, next) => {
    // A resposta depende do cookie; cache compartilhado não pode guardá-la.
    res.set("Vary", "Cookie");
    if ((await sessionUserIdFrom(req)) !== null) return next();
    res.sendFile(landingIndex(), { headers: { "Cache-Control": "no-store" } });
  });

  /*
   * "/site" foi o endereço da landing até aqui. Continua respondendo, com 301
   * para a raiz: link antigo em e-mail ou índice de busca não pode virar 404,
   * e o permanente é o que faz o buscador trocar de endereço em vez de manter
   * as duas páginas iguais concorrendo entre si.
   */
  app.get(["/site", "/site/", "/site/index.html"], (_req, res) => {
    res.redirect(301, "/");
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
