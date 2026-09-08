import { describe, expect, it } from "vitest";
import {
  daysApart,
  normalizeText,
  ruleFor,
  scoreCandidate,
  similarity,
  suggestAll,
  suggestFor,
  suggestionLabel,
  summarizeBatch,
  type LedgerSide,
  type MovementSide,
  type SuggestionRule,
} from "./reconciliation";

function movimento(values: Partial<MovementSide> = {}): MovementSide {
  return {
    id: 1,
    accountId: 10,
    movementDate: "2026-09-05",
    description: "TWILIO INC USD 604.12",
    contact: "",
    amount: -3180,
    ...values,
  };
}

function lancamento(values: Partial<LedgerSide> = {}): LedgerSide {
  return {
    id: 100,
    accountId: 10,
    transactionDate: "2026-09-05",
    description: "Twilio · fatura agosto",
    contact: "Twilio Inc.",
    amount: -3180,
    category: "Custos de plataforma",
    ...values,
  };
}

describe("normalizeText", () => {
  it("tira acento, caixa e pontuação", () => {
    expect(normalizeText("Depreciação & Amortização!")).toBe("depreciacao amortizacao");
  });
});

describe("similarity", () => {
  it("reconhece o mesmo fornecedor com descrições de tamanhos diferentes", () => {
    expect(similarity("TWILIO INC USD 604.12", "Twilio · fatura agosto")).toBeGreaterThanOrEqual(0.6);
  });

  it("não acha semelhança onde não há", () => {
    expect(similarity("GOOGLE ADS BR", "Aluguel do escritório")).toBe(0);
  });

  it("ignora conectivos e ruído de meio de pagamento", () => {
    expect(similarity("PIX RECEBIDO DE Maria Souza", "Maria Souza")).toBe(1);
  });

  it("texto vazio não parece com nada", () => {
    expect(similarity("", "Twilio")).toBe(0);
  });
});

describe("daysApart", () => {
  it("conta os dias entre duas datas, em qualquer ordem", () => {
    expect(daysApart("2026-09-05", "2026-09-08")).toBe(3);
    expect(daysApart("2026-09-08", "2026-09-05")).toBe(3);
    expect(daysApart("2026-09-05", "2026-09-05")).toBe(0);
  });
});

describe("scoreCandidate", () => {
  it("valor diferente nunca vira sugestão, por mais que o resto case", () => {
    expect(scoreCandidate(movimento(), lancamento({ amount: -3180.01 }))).toBeNull();
  });

  it("conta diferente nunca vira sugestão", () => {
    expect(scoreCandidate(movimento(), lancamento({ accountId: 99 }))).toBeNull();
  });

  it("data longe demais sai da disputa", () => {
    expect(scoreCandidate(movimento(), lancamento({ transactionDate: "2026-09-09" }))).toBeNull();
    expect(scoreCandidate(movimento(), lancamento({ transactionDate: "2026-09-08" }))).not.toBeNull();
  });

  it("mesmo valor, mesma data e descrição parecida dá a confiança máxima", () => {
    expect(scoreCandidate(movimento(), lancamento())).toEqual({ confidence: 98, reason: "mesmo valor e data" });
  });

  it("sem descrição parecida, mesma data ainda vale 90", () => {
    const score = scoreCandidate(movimento(), lancamento({ description: "Assinatura mensal", contact: "" }));
    expect(score).toEqual({ confidence: 90, reason: "mesmo valor e data" });
  });

  it("descrição parecida em data próxima vale 88", () => {
    const score = scoreCandidate(movimento(), lancamento({ transactionDate: "2026-09-07" }));
    expect(score).toEqual({ confidence: 88, reason: "descrição semelhante" });
  });

  it("só o valor batendo em data próxima é o piso, e diz de quantos dias", () => {
    const score = scoreCandidate(
      movimento(),
      lancamento({ transactionDate: "2026-09-06", description: "Aluguel", contact: "" })
    );
    expect(score).toEqual({ confidence: 70, reason: "mesmo valor · 1 dia de diferença" });
  });

  it("a regra do usuário explica a sugestão quando a categoria dela bate", () => {
    const regra: SuggestionRule = { id: 5, matchValue: "TWILIO", category: "Custos de plataforma", categoryId: 3 };
    const score = scoreCandidate(
      movimento({ movementDate: "2026-09-06" }),
      lancamento({ description: "Fatura mensal", contact: "" }),
      regra
    );
    expect(score).toEqual({ confidence: 95, reason: "regra “TWILIO”" });
  });

  it("regra com categoria diferente da do lançamento não explica nada", () => {
    const regra: SuggestionRule = { id: 5, matchValue: "TWILIO", category: "Outra coisa", categoryId: 9 };
    const score = scoreCandidate(
      movimento({ movementDate: "2026-09-06" }),
      lancamento({ description: "Fatura mensal", contact: "" }),
      regra
    );
    expect(score?.confidence).toBe(70);
  });

  it("compara centavos, não ponto flutuante", () => {
    expect(scoreCandidate(movimento({ amount: 0.1 + 0.2 }), lancamento({ amount: 0.3 }))).not.toBeNull();
  });
});

describe("ruleFor", () => {
  const regras: SuggestionRule[] = [
    { id: 1, matchValue: "TWILIO", category: "Custos de plataforma", categoryId: 3 },
    { id: 2, matchValue: "PIX RECEBIDO LOTE", category: "Receita de vendas", categoryId: 4 },
  ];

  it("acha a regra dentro da descrição, ignorando caixa", () => {
    expect(ruleFor(regras, "twilio inc usd 604.12")?.id).toBe(1);
  });

  it("não casa quando o texto não contém a regra", () => {
    expect(ruleFor(regras, "GOOGLE ADS BR")).toBeUndefined();
  });

  it("regra vazia não casa com tudo", () => {
    expect(ruleFor([{ id: 3, matchValue: "  ", category: "X", categoryId: null }], "qualquer coisa")).toBeUndefined();
  });
});

describe("suggestFor", () => {
  it("escolhe o candidato de maior confiança", () => {
    const escolha = suggestFor(movimento(), [
      lancamento({ id: 200, transactionDate: "2026-09-07" }),
      lancamento({ id: 201 }),
    ]);
    expect(escolha).toEqual({ transactionId: 201, confidence: 98, reason: "mesmo valor e data" });
  });

  it("empate escolhe sempre o mesmo, para a tela não mudar sozinha", () => {
    const candidatos = [lancamento({ id: 300 }), lancamento({ id: 250 })];
    expect(suggestFor(movimento(), candidatos)?.transactionId).toBe(250);
    expect(suggestFor(movimento(), [...candidatos].reverse())?.transactionId).toBe(250);
  });

  it("sem candidato compatível não inventa sugestão", () => {
    expect(suggestFor(movimento(), [lancamento({ amount: -10 })])).toBeNull();
    expect(suggestFor(movimento(), [])).toBeNull();
  });
});

describe("suggestAll", () => {
  it("não oferece o mesmo lançamento para duas movimentações", () => {
    const movimentos = [
      movimento({ id: 1, description: "TWILIO INC", movementDate: "2026-09-07" }),
      movimento({ id: 2, description: "TWILIO INC" }),
    ];
    const candidatos = [lancamento({ id: 100 })];
    const sugestoes = suggestAll(movimentos, candidatos);
    expect(sugestoes.get(2)?.transactionId).toBe(100);
    expect(sugestoes.has(1)).toBe(false);
  });

  it("cada movimentação fica com um lançamento diferente quando há para todas", () => {
    const movimentos = [movimento({ id: 1 }), movimento({ id: 2 })];
    const candidatos = [lancamento({ id: 100 }), lancamento({ id: 101 })];
    const sugestoes = suggestAll(movimentos, candidatos);
    expect(new Set([sugestoes.get(1)?.transactionId, sugestoes.get(2)?.transactionId]).size).toBe(2);
  });

  it("movimentação sem par nenhum fica de fora do mapa", () => {
    const sugestoes = suggestAll([movimento({ id: 7, amount: -1 })], [lancamento()]);
    expect(sugestoes.size).toBe(0);
  });
});

describe("suggestionLabel", () => {
  it("escreve o motivo com a confiança, como na tela", () => {
    expect(suggestionLabel({ transactionId: 1, confidence: 98, reason: "mesmo valor e data" }))
      .toBe("mesmo valor e data · 98%");
  });
});

describe("summarizeBatch", () => {
  it("repete os números da barra escura e do modal", () => {
    expect(summarizeBatch([9480, -3180, -2400, -890, -1000])).toEqual({
      count: 5,
      incomingCount: 1,
      outgoingCount: 4,
      incoming: 9480,
      outgoing: -7470,
      net: 2010,
    });
  });

  it("seleção vazia soma zero em tudo", () => {
    expect(summarizeBatch([])).toEqual({
      count: 0, incomingCount: 0, outgoingCount: 0, incoming: 0, outgoing: 0, net: 0,
    });
  });

  it("arredonda centavos em vez de arrastar erro de ponto flutuante", () => {
    expect(summarizeBatch([0.1, 0.2]).net).toBe(0.3);
  });
});
