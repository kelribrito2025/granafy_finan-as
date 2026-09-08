import type { ReactNode } from "react";
import {
  CURRENCY_LABELS,
  DEFAULT_PREFERENCES,
  formatDateWith,
  formatMoneyWith,
  todayIn,
  type Preferences,
} from "@shared/preferences";

/**
 * As preferências em vigor, num módulo só.
 *
 * As funções de formatação são chamadas de dezenas de componentes soltos, fora
 * de qualquer hook — passar as preferências por prop até cada um deles seria
 * uma refatoração enorme para o mesmo efeito. O PreferencesProvider atualiza
 * este valor e força o re-render, então a tela sempre desenha com o que está
 * salvo.
 */
let active: Preferences = DEFAULT_PREFERENCES;

export function setActivePreferences(preferences: Preferences) {
  active = preferences;
}

export function activePreferences() {
  return active;
}

/*
 * Modo discreto: o olhinho do topo esconde todo valor da tela.
 *
 * A troca acontece aqui, no único lugar por onde o dinheiro passa antes de
 * virar texto. Esconder na tela, componente por componente, deixaria sempre um
 * canto exibindo o saldo — que é justamente o que quem liga isso não quer.
 */
let hidden = false;

export function setValuesHidden(value: boolean) {
  hidden = value;
}

export function valuesHidden() {
  return hidden;
}

/**
 * Os dígitos que aparecem borrados no lugar dos de verdade.
 *
 * O borrão é visual: o texto continua no HTML. Trocar os algarismos antes de
 * desenhar faz com que nem quem abrir o inspetor leia o saldo, e como só os
 * dígitos mudam, a largura e o desenho do número continuam os mesmos — o
 * layout não pula quando o olhinho liga e desliga.
 */
const DECOY_DIGITS = "4718293605";

function decoy(text: string) {
  let index = 0;
  return text.replace(/\d/g, () => DECOY_DIGITS[index++ % DECOY_DIGITS.length]);
}

/**
 * Um texto de dinheiro já formatado, borrado se o modo discreto estiver ligado.
 *
 * Devolve um nó do React, não uma string: o borrão é CSS e precisa de um
 * elemento para morar. Onde o valor vira atributo (`title`, `aria-label`) ou
 * entra num toast, use `formatMoneyText`.
 */
export function maskMoneyText(text: string): ReactNode {
  if (!hidden) return text;
  return (
    <span className="valor-borrado" aria-label="valor oculto">
      {decoy(text)}
    </span>
  );
}

/** A máscara em texto puro mantém o símbolo da moeda: some o número, não o significado. */
export function maskedMoney() {
  return `${CURRENCY_LABELS[active.currency].symbol} ••••••`;
}

export function formatMoney(value: number): ReactNode {
  return maskMoneyText(formatMoneyWith(active, value));
}

/** A mesma formatação, só que em string — para atributos, toasts e títulos. */
export function formatMoneyText(value: number) {
  return hidden ? maskedMoney() : formatMoneyWith(active, value);
}

export function formatDate(isoDate: string) {
  return formatDateWith(active, isoDate);
}

/** Hoje no fuso escolhido pelo usuário. */
export function today() {
  return todayIn(active);
}
