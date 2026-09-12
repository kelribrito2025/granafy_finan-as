import { useSyncExternalStore } from "react";

/*
 * O que o admin decidiu esconder, guardado no navegador.
 *
 * Não é preferência de conta: não há tabela onde gravar isso, e criar uma
 * custa migração com ritual. `localStorage` é o que existe hoje, e a tela diz
 * isso em voz alta — a escolha vale neste navegador e não some para os outros
 * admins.
 *
 * `useSyncExternalStore` em vez de contexto porque quem lê são duas peças
 * distantes: a barra lateral, que decide se desenha o item, e a tela de
 * Configurações, que tem o interruptor. Um provedor para dois leitores seria
 * mais encanamento do que valor.
 */
const CHAVE = "granafy.admin.mostrarAssinaturas";
const EVENTO = "granafy:preferencias-do-admin";

/*
 * Ligado por padrão, e só o "0" desliga.
 *
 * `localStorage` pode simplesmente lançar — aba anônima, site com dados
 * bloqueados —, e nesse caso o menu aparece. Esconder um item por causa de
 * uma exceção de leitura seria o pior resultado: o admin procuraria um menu
 * que ele nunca desligou.
 */
function ler() {
  try {
    return localStorage.getItem(CHAVE) !== "0";
  } catch {
    return true;
  }
}

function assinar(aoMudar: () => void) {
  window.addEventListener(EVENTO, aoMudar);
  /* Outra aba do mesmo admin muda a escolha: `storage` avisa só as outras. */
  window.addEventListener("storage", aoMudar);
  return () => {
    window.removeEventListener(EVENTO, aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

/** Se a área de Assinaturas e o cartão de Planos aparecem. */
export function useMostrarAssinaturas() {
  return useSyncExternalStore(assinar, ler, () => true);
}

export function definirMostrarAssinaturas(mostrar: boolean) {
  try {
    localStorage.setItem(CHAVE, mostrar ? "1" : "0");
  } catch {
    /* Sem onde guardar, a escolha vale só enquanto a página estiver aberta. */
  }
  window.dispatchEvent(new Event(EVENTO));
}
