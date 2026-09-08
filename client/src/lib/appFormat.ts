import {
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

export function formatMoney(value: number) {
  return formatMoneyWith(active, value);
}

export function formatDate(isoDate: string) {
  return formatDateWith(active, isoDate);
}

/** Hoje no fuso escolhido pelo usuário. */
export function today() {
  return todayIn(active);
}
