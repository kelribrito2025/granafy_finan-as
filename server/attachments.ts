/*
 * Onde mora um anexo, e de quem ele é.
 *
 * A regra vive num arquivo só porque dois caminhos precisam dela: o
 * procedimento tRPC que assina a URL e a rota HTTP que redireciona para o
 * arquivo. Enquanto a rota não conhecia esta regra, ela entregava o
 * comprovante de qualquer empresa a quem soubesse a chave — o `ownsAttachment`
 * existia ao lado, guardando só metade dos caminhos.
 */

/** Pastas de anexo. O nome entra na chave, então a lista é fechada. */
export const ATTACHMENT_FOLDERS = ["lancamentos", "bens"] as const;
export type AttachmentFolder = (typeof ATTACHMENT_FOLDERS)[number];

/**
 * Todo anexo mora sob o prefixo do dono. Ler exige que a chave comece com um
 * prefixo do usuário da requisição, então uma chave vazada não serve para
 * alcançar o anexo de outra conta.
 */
export function attachmentPrefix(userId: number, folder: AttachmentFolder) {
  return `${folder}/${userId}/`;
}

export function ownsAttachment(userId: number, key: string) {
  return ATTACHMENT_FOLDERS.some(folder => key.startsWith(attachmentPrefix(userId, folder)));
}

/** A chave aponta para a área de anexos de alguém. */
export function isAttachmentKey(key: string) {
  return ATTACHMENT_FOLDERS.some(folder => key.startsWith(`${folder}/`));
}

/*
 * Arte do próprio produto, guardada no mesmo storage: não é de ninguém e não
 * carrega dado de empresa. A lista é fechada de propósito — abrir por padrão o
 * que não casa com um prefixo de anexo devolveria o buraco pela porta dos
 * fundos, e um arquivo novo aqui é uma linha de código, não um acidente.
 */
const PUBLIC_ASSET_KEYS = new Set<string>([
  "efi-bank-logo_221c9925.png",
]);

export function isPublicAssetKey(key: string) {
  return PUBLIC_ASSET_KEYS.has(key);
}
