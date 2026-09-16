import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from "react";

/** O que está pintado na tela. */
export type Theme = "light" | "dark";

/*
 * O que a pessoa escolheu — que não é a mesma coisa.
 *
 * "auto" segue o sistema operacional e muda sozinho quando ele muda, sem
 * ninguém tocar em nada. Guardar só o resultado ("está escuro") perderia a
 * intenção: no dia seguinte o sistema clareia e o GranaFy ficaria escuro à
 * toa, porque foi assim que ele ficou salvo.
 */
export type ThemePreference = Theme | "auto";

const THEME_STORAGE_KEY = "granafy-theme";

function isPreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "auto";
}

/**
 * O tema que vale, dada a escolha e o que o sistema está pedindo.
 *
 * Uma linha, mas é a linha que define o modo automático — e errar nela deixa
 * a pessoa presa no tema errado sem entender por quê. Fica separada para ter
 * teste.
 */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  if (preference === "auto") return systemDark ? "dark" : "light";
  return preference;
}

function systemPrefersDark() {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

interface ThemeContextType {
  /** O tema em vigor, já resolvido. */
  theme: Theme;
  /** A escolha da pessoa, que pode ser "auto". */
  preference: ThemePreference;
  setTheme?: (theme: Theme) => void;
  setPreference?: (preference: ThemePreference) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemePreference;
  switchable?: boolean;
}

/*
 * A troca de tema é seca, e isso é decisão de produto.
 *
 * Aqui morava um efeito: a View Transitions API fotografava a tela antes e
 * depois e revelava a nova a partir do retângulo de um cartão escuro, com uma
 * cortina de reserva para navegador sem a API. Eram 620 ms bonitos e 115
 * linhas — mais o CSS de `::view-transition-*` e o gancho `data-theme-origin`
 * espalhado por três componentes.
 *
 * Saiu porque trocar de tema é uma ação repetida, e o que agrada na primeira
 * vez incomoda na vigésima: quem alterna claro/escuro para comparar uma tela
 * esperava mais de meio segundo a cada clique.
 *
 * O que sobrou é o que sempre fez o trabalho de verdade: a classe na raiz. O
 * tema inteiro é CSS, então trocá-la repinta tudo no mesmo quadro — que é
 * exatamente o "muda tudo na mesma hora" que se quer aqui.
 */


export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (switchable) {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) ?? localStorage.getItem("theme");
      return isPreference(stored) ? stored : defaultTheme;
    }
    return defaultTheme;
  });

  /*
   * O que o sistema está pedindo agora.
   *
   * Fica em estado próprio e escuta a mudança: quem escolheu "auto" e deixa a
   * janela aberta ao anoitecer vê a tela acompanhar, sem recarregar.
   */
  const [sistemaEscuro, setSistemaEscuro] = useState(systemPrefersDark);

  useEffect(() => {
    const consulta = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = (evento: MediaQueryListEvent) => setSistemaEscuro(evento.matches);
    consulta.addEventListener("change", aoMudar);
    return () => consulta.removeEventListener("change", aoMudar);
  }, []);

  const theme: Theme = resolveTheme(preference, sistemaEscuro);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#0D1812" : "#E9EEEB",
    );

    if (switchable) {
      // Guarda a escolha, não o resultado.
      localStorage.setItem(THEME_STORAGE_KEY, preference);
    }
  }, [theme, preference, switchable]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
  }, []);

  /** O olhinho do topo continua alternando entre claro e escuro explícitos. */
  const setTheme = useCallback((next: Theme) => setPreference(next), [setPreference]);

  const toggleTheme = useCallback(() => {
    setPreference(theme === "light" ? "dark" : "light");
  }, [setPreference, theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        preference,
        setTheme: switchable ? setTheme : undefined,
        setPreference: switchable ? setPreference : undefined,
        toggleTheme: switchable ? toggleTheme : undefined,
        switchable,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
