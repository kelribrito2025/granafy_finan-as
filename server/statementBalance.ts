/**
 * Qual saldo declarado vale, entre o que veio no arquivo e o que foi digitado.
 *
 * A escolha mora fora do `db.ts` para poder ser testada sem banco: a consulta
 * é trivial, a regra é que tem casos.
 */
export type StatementBalanceOrigin = "arquivo" | "manual";

export type DeclaredBalance = {
  balance: number;
  asOf: string;
  origin: StatementBalanceOrigin;
};

/**
 * O mais recente ganha. Empate de data vai para o informado: quem digitou
 * depois de importar estava corrigindo o que o arquivo trouxe.
 */
export function pickDeclaredBalance(
  fromFile: DeclaredBalance | null,
  fromUser: DeclaredBalance | null
): DeclaredBalance | null {
  if (!fromFile) return fromUser;
  if (!fromUser) return fromFile;
  return fromUser.asOf >= fromFile.asOf ? fromUser : fromFile;
}
