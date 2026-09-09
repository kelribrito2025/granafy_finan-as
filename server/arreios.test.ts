import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * A invariante dos arreios de isolamento: a faixa da suíte vale para as TRÊS
 * chaves de `users`, não só para o id.
 *
 * O acidente: um `kill` no meio de `activeCompany.isolation.test.ts` (faixa
 * 7.100.00x) deixou dois usuários para trás, e a suíte seguinte quebrou —
 * `cadastros` (6.100.00x) e `backfillCompanies` (8.100.00x), onze e sete testes
 * vermelhos, com "Duplicate entry 'a' for key users.users_openId_unique". As
 * faixas numéricas não se encostavam; o que colidia era o literal `'a'`, que
 * três arreios semeavam igual.
 *
 * O que faz isso ser defeito e não azar: enquanto toda suíte roda até o fim, o
 * `afterAll` apaga o literal e ninguém vê nada. O isolamento estava valendo por
 * escalonamento, não por desenho — e "por desenho, não por configuração" é o
 * contrato da tríade.
 *
 * A regra abaixo é a que impede a volta: quem semeia `users` semeia com
 * `usuarioDeTeste`, que deriva `openId` e `email` do id da faixa.
 *
 * Não fala com banco nenhum e custa milissegundos.
 */

const PASTA = import.meta.dirname;

const arreios = readdirSync(PASTA)
  .filter(nome => nome.endsWith(".isolation.test.ts"))
  .map(nome => ({ nome, fonte: readFileSync(path.join(PASTA, nome), "utf8") }));

describe("invariante dos arreios de isolamento", () => {
  it("encontra os arreios (a extração não pode falhar em silêncio)", () => {
    expect(arreios.length).toBeGreaterThanOrEqual(5);
  });

  it("quem semeia users deriva openId e email do id, via usuarioDeTeste", () => {
    const fora = arreios
      .filter(a => a.fonte.includes("INSERT INTO users"))
      .filter(a => !a.fonte.includes("usuarioDeTeste("))
      .map(a => a.nome);

    expect(fora).toEqual([]);
  });

  it("todo INSERT em users é a forma canônica, só com marcadores", () => {
    /*
     * A rede anterior só cobre quem usa o helper em ALGUM lugar do arquivo, e um
     * `INSERT` novo com literais ao lado de um antigo passaria. Esta compara o
     * texto do comando: qualquer forma diferente da canônica é vermelho, o que
     * inclui a que causou o acidente.
     */
    const CANONICO = "INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)";

    const fora = arreios.flatMap(a =>
      [...a.fonte.matchAll(/INSERT INTO users[\s\S]*?(?=[`"])/g)]
        .map(achado => achado[0].replace(/\s+/g, " ").trim())
        .filter(comando => comando !== CANONICO)
        .map(comando => `${a.nome}: ${comando.slice(0, 90)}`));

    expect(fora).toEqual([]);
  });
});
