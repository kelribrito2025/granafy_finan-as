import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    /*
     * Os arreios de isolamento falam com um TiDB em us-east-1, e cada consulta
     * paga o ping. Os 5 s de padrão do Vitest são para teste puro; aqui eles
     * transformam latência de rede em falso vermelho.
     */
    testTimeout: 30_000,
    hookTimeout: 120_000,
    /*
     * Um arquivo de banco por vez.
     *
     * Dois arquivos montando o schema de teste ao mesmo tempo disputam as
     * mesmas tabelas, e as suítes ainda limpam tabelas entre si — em paralelo,
     * uma apaga a semeadura da outra no meio da asserção. Sequencial é a única
     * forma de o resultado significar alguma coisa.
     */
    fileParallelism: false,
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/src/**/*.test.ts",
      "shared/**/*.test.ts",
    ],
  },
});
