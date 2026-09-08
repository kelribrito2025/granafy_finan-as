import { describe, expect, it } from "vitest";
import {
  attachmentPrefix,
  isAttachmentKey,
  isPublicAssetKey,
  ownsAttachment,
} from "./attachments";

describe("propriedade do anexo", () => {
  it("reconhece o anexo do próprio dono", () => {
    expect(ownsAttachment(42, "lancamentos/42/1757000000000_nota.pdf_1a2b3c4d.pdf")).toBe(true);
    expect(ownsAttachment(42, "bens/42/1757000000000_nf.pdf_1a2b3c4d.pdf")).toBe(true);
  });

  it("recusa o anexo de outra conta, que é o buraco que a rota tinha", () => {
    expect(ownsAttachment(42, "lancamentos/7/1757000000000_nota.pdf_1a2b3c4d.pdf")).toBe(false);
  });

  it("não deixa um id ser prefixo de outro", () => {
    // "lancamentos/4" não pode abrir "lancamentos/42".
    expect(ownsAttachment(4, "lancamentos/42/nota.pdf")).toBe(false);
    expect(attachmentPrefix(4, "lancamentos")).toBe("lancamentos/4/");
  });

  it("recusa quem tenta escapar do prefixo", () => {
    expect(ownsAttachment(42, "../lancamentos/7/nota.pdf")).toBe(false);
    expect(ownsAttachment(42, "outra-pasta/42/nota.pdf")).toBe(false);
  });

  it("sabe o que é área de anexo e o que não é", () => {
    expect(isAttachmentKey("lancamentos/7/nota.pdf")).toBe(true);
    expect(isAttachmentKey("bens/7/nf.pdf")).toBe(true);
    expect(isAttachmentKey("efi-bank-logo_221c9925.png")).toBe(false);
  });

  it("libera só a arte listada, e nada além dela", () => {
    expect(isPublicAssetKey("efi-bank-logo_221c9925.png")).toBe(true);
    expect(isPublicAssetKey("qualquer-outro-arquivo.png")).toBe(false);
    expect(isPublicAssetKey("lancamentos/7/nota.pdf")).toBe(false);
  });
});
