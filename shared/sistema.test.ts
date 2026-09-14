import { describe, expect, it } from "vitest";
import {
  ABAS_DE_ASSINATURA,
  CHAVE_MOSTRAR_ASSINATURAS,
  CONFIGURACAO_PADRAO,
  booleanoDoTexto,
  ehAbaDeAssinatura,
  textoDoBooleano,
} from "./sistema";

describe("booleanoDoTexto", () => {
  it("lê o que o banco grava", () => {
    expect(booleanoDoTexto("1", true)).toBe(true);
    expect(booleanoDoTexto("0", true)).toBe(false);
    expect(booleanoDoTexto("0", false)).toBe(false);
  });

  /*
   * A linha só existe depois que alguém mexe no interruptor. Antes disso a
   * consulta não devolve nada, e "nada" não pode significar "esconde": uma
   * instalação nova perderia Planos e Assinatura sem ninguém ter pedido.
   */
  it("cai no padrão quando não há linha no banco", () => {
    expect(booleanoDoTexto(undefined, true)).toBe(true);
    expect(booleanoDoTexto(null, true)).toBe(true);
    expect(booleanoDoTexto(undefined, false)).toBe(false);
  });

  /*
   * A coluna é `varchar`, então nada no banco impede um UPDATE na mão escrever
   * "true", "sim" ou espaço. Esconder uma tela por causa disso seria obedecer a
   * um valor que ninguém escolheu — só "0" desliga, e o resto é o padrão.
   */
  it("não deixa lixo escrito na mão desligar nada", () => {
    for (const lixo of ["", " ", "true", "false", "sim", "não", "00", "1 ", "2"]) {
      expect(booleanoDoTexto(lixo, true)).toBe(true);
    }
  });

  it("volta igual depois de ida e volta", () => {
    for (const valor of [true, false]) {
      expect(booleanoDoTexto(textoDoBooleano(valor), !valor)).toBe(valor);
    }
  });
});

describe("a configuração padrão", () => {
  /*
   * Inverter este padrão esconderia Planos e Assinatura de toda instalação que
   * ainda não tem a linha no banco — inclusive das que já rodam hoje, porque a
   * migração cria a tabela vazia. É uma linha para trocar e um estrago grande,
   * então fica escrito.
   */
  it("mostra tudo enquanto ninguém mexeu no interruptor", () => {
    expect(CONFIGURACAO_PADRAO.mostrarAssinaturas).toBe(true);
  });

  it("a chave do banco não muda de nome sem alguém notar", () => {
    expect(CHAVE_MOSTRAR_ASSINATURAS).toBe("mostrarAssinaturas");
  });
});

describe("ehAbaDeAssinatura", () => {
  it("reconhece as duas abas que o interruptor governa", () => {
    expect(ehAbaDeAssinatura("plans")).toBe(true);
    expect(ehAbaDeAssinatura("subscription")).toBe(true);
    expect(ABAS_DE_ASSINATURA).toHaveLength(2);
  });

  /*
   * As outras três abas não podem sumir junto: desligar Assinaturas não pode
   * levar embora os dados da empresa, as preferências e o tour.
   */
  it("não governa as abas que sempre existem", () => {
    for (const aba of ["company", "preferences", "onboarding"]) {
      expect(ehAbaDeAssinatura(aba)).toBe(false);
    }
  });

  it("não reconhece o que não é aba", () => {
    expect(ehAbaDeAssinatura("")).toBe(false);
    expect(ehAbaDeAssinatura("plan")).toBe(false);
    expect(ehAbaDeAssinatura("plans ")).toBe(false);
  });
});
