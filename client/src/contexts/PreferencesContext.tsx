import { trpc } from "@/lib/trpc";
import { setActivePreferences } from "@/lib/appFormat";
import { DEFAULT_PREFERENCES, type Preferences } from "@shared/preferences";
import { createContext, useContext, type ReactNode } from "react";

const PreferencesContext = createContext<Preferences>(DEFAULT_PREFERENCES);

/**
 * Carrega as preferências salvas e as publica no módulo de formatação antes de
 * desenhar os filhos — a atualização acontece no corpo do render, e não num
 * efeito, para a primeira pintura já sair no formato certo.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const query = trpc.settings.preferences.useQuery(undefined, { staleTime: 60_000 });
  const preferences = query.data ?? DEFAULT_PREFERENCES;
  setActivePreferences(preferences);
  return <PreferencesContext.Provider value={preferences}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  return useContext(PreferencesContext);
}
