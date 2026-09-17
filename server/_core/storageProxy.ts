import type { Express } from "express";
import { isAttachmentKey, isPublicAssetKey, ownsAttachment, podeLerAnexo } from "../attachments";
import { authenticateLocalRequest } from "../auth";
import * as db from "../db";
import { ENV } from "./env";

/*
 * A rota que entrega um arquivo do storage.
 *
 * Ela devolve um redirect para uma URL assinada, e por muito tempo fez isso
 * sem olhar quem estava pedindo: bastava a chave para baixar o comprovante de
 * qualquer empresa. A chave tem o `userId` no caminho e um sufixo aleatório de
 * 8 caracteres, o que é obscuridade, não controle de acesso — e qualquer chave
 * que vaze num link, num log ou no histórico do navegador valeria para sempre.
 *
 * Agora exige sessão e confere o dono pela mesma regra que o procedimento
 * tRPC usa. O que não é anexo só passa se estiver na lista de arte do produto.
 */
export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // A landing precisa carregar a marca antes de existir uma sessão. Só as
    // chaves enumeradas na allowlist pública passam por esse caminho; qualquer
    // outra chave continua exigindo autenticação e autorização por empresa.
    const publicAsset = isPublicAssetKey(key);
    const user = publicAsset ? null : await authenticateLocalRequest(req).catch(() => null);
    if (!publicAsset && !user) {
      res.status(401).send("Autenticação necessária");
      return;
    }

    /*
     * A mesma regra do tRPC, porque esta rota entrega o arquivo fora dele: o
     * dono pelo prefixo; o contador pela linha, conferida contra as empresas
     * que ele pode abrir (as mesmas de ctx.companies).
     */
    const permitido = publicAsset || (user && isAttachmentKey(key)
      ? (ownsAttachment(user.id, key) || podeLerAnexo({
          atorId: user.id,
          key,
          empresaDoAnexo: await db.empresaDoAnexo(key),
          empresasVisiveis: (await db.empresasVisiveisPara(user.id)).map(empresa => empresa.id),
        }))
      : false);
    if (!permitido) {
      res.status(403).send("Arquivo não disponível para esta conta");
      return;
    }

    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }

    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/",
      );
      forgeUrl.searchParams.set("path", key);

      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
      });

      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }

      const { url } = (await forgeResp.json()) as { url: string };
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }

      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
