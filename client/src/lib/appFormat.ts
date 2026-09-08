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

/** A máscara mantém o símbolo da moeda: some o número, não o significado. */
export function maskedMoney() {
  return `${CURRENCY_LABELS[active.currency].symbol} ••••••`;
}

export function formatMoney(value: number) {
  return hidden ? maskedMoney() : formatMoneyWith(active, value);
}

export function formatDate(isoDate: string) {
  return formatDateWith(active, isoDate);
}

/** Hoje no fuso escolhido pelo usuário. */
export function today() {
  return todayIn(active);
}
