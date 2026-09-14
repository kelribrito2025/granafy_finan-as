/*
 * A configuração do sistema inteiro — a que vale para todo mundo, não por
 * login e não por empresa.
 *
 * Existe um lugar só porque três leitores precisam concordar: o servidor,
 * quando a linha não está no banco; a tela do admin, que tem o interruptor; e
 * o app do cliente, que decide se desenha Planos e Assinatura. Enquanto o
 * padrão morava no `localStorage` do navegador do admin, os dois últimos nem
 * se falavam — o interruptor escondia o menu DO ADMIN e o cliente continuava
 * vendo tudo, porque `localStorage` é de um navegador só e não atravessa para
 * ninguém.
 *
 * O valor vai para o banco como texto, e não como booleano, porque a tabela é
 * chave/valor: a próxima configuração entra sem migração. O preço é esta
 * conversão, e ela fica aqui, testada, em vez de repetida em cada leitor.
 */

export type ConfiguracaoDoSistema = {
  /** Se Planos e Assinatura aparecem — no app do cliente e no menu do admin. */
  mostrarAssinaturas: boolean;
};

/**
 * O que vale antes de alguém mexer no interruptor.
 *
 * Ligado, e não desligado. Uma instalação nova mostra o produto inteiro; quem
 * quiser esconder desliga, e a decisão fica gravada. O contrário faria a
 * primeira subida do sistema esconder telas que ninguém pediu para esconder.
 */
export const CONFIGURACAO_PADRAO: ConfiguracaoDoSistema = {
  mostrarAssinaturas: true,
};

/** A chave da linha em `systemSettings`. */
export const CHAVE_MOSTRAR_ASSINATURAS = "mostrarAssinaturas";

/**
 * O texto do banco virando booleano.
 *
 * Só o "0" desliga — a mesma regra que o `localStorage` usava antes, mantida
 * de propósito. Linha ausente, valor vazio ou lixo que alguém escreveu na mão
 * caem no padrão: para esconder uma tela é preciso ter DITO que esconde, e
 * nenhuma dessas três coisas é alguém dizendo isso.
 */
export function booleanoDoTexto(valor: string | null | undefined, padrao: boolean): boolean {
  if (valor === "0") return false;
  if (valor === "1") return true;
  return padrao;
}

/** O par do de cima: o booleano virando o texto que vai para o banco. */
export function textoDoBooleano(valor: boolean): string {
  return valor ? "1" : "0";
}

/*
 * As abas de Configurações que o interruptor governa.
 *
 * A lista mora aqui, e não dentro da tela, porque duas decisões precisam dela e
 * elas ficam longe uma da outra: qual aba desenhar e para onde mandar quem
 * chegou por link direto. Escritas separadamente, as duas divergem — e o
 * sintoma seria a aba sumir do menu mas continuar abrindo pelo endereço, que é
 * esconder pela metade.
 */
export const ABAS_DE_ASSINATURA = ["plans", "subscription"] as const;

export function ehAbaDeAssinatura(aba: string): boolean {
  return (ABAS_DE_ASSINATURA as readonly string[]).includes(aba);
}
