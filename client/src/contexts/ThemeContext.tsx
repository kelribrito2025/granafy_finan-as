import React, { createContext, useCallback, useContext, useLayoutEffect, useState } from "react";
import { flushSync } from "react-dom";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "granafy-theme";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

interface ThemeContextType {
  theme: Theme;
  setTheme?: (theme: Theme) => void;
  toggleTheme?: () => void;
  switchable: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}

/*
 * A troca de tema em círculo.
 *
 * O tema inteiro é CSS na raiz: trocar a classe repinta tudo no mesmo quadro,
 * e o corte seco de branco para preto é desagradável. A View Transitions API
 * fotografa a tela antes e depois; a animação abaixo só recorta a foto nova
 * num círculo que cresce a partir do cartão escuro — o mesmo cartão que já
 * estava escuro antes da troca, então o modo escuro parece sair de dentro
 * dele.
 *
 * Onde a API não existe (Firefox e Safari antigos), ou quando o sistema pede
 * menos movimento, o `setTheme` normal acontece e a tela troca de uma vez.
 */
const REVEAL_MS = 620;

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/** O centro do cartão escuro da página, ou o centro da tela se não houver um. */
function revealOrigin() {
  const card = document.querySelector<HTMLElement>("[data-theme-origin]");
  const rect = card?.getBoundingClientRect();
  if (!rect || rect.width === 0 || rect.height === 0) {
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Raio que alcança o canto mais distante: menos que isso deixa canto sem pintar. */
function reachRadius(x: number, y: number) {
  return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  switchable = false,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (switchable) {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) ?? localStorage.getItem("theme");
      return isTheme(stored) ? stored : defaultTheme;
    }
    return defaultTheme;
  });

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content",
      theme === "dark" ? "#0D1812" : "#E9EEEB",
    );

    if (switchable) {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme, switchable]);

  const setTheme = useCallback((next: Theme) => {
    const doc = document as ViewTransitionDocument;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!doc.startViewTransition || quieto) {
      setThemeState(next);
      return;
    }

    const { x, y } = revealOrigin();
    const raio = reachRadius(x, y);
    const escurecendo = next === "dark";
    const root = document.documentElement;

    /*
     * Ao voltar para o claro o círculo encolhe de volta para o cartão, e para
     * isso a foto antiga precisa ficar por cima — o padrão é o contrário.
     */
    root.classList.toggle("tema-recolhendo", !escurecendo);

    // O flushSync é o ponto do truque: sem ele o React pinta o tema novo
    // depois que a API já tirou as duas fotos, e as duas saem iguais.
    const transition = doc.startViewTransition(() => {
      flushSync(() => setThemeState(next));
    });

    transition.ready
      .then(() => {
        const circulos = [`circle(0px at ${x}px ${y}px)`, `circle(${raio}px at ${x}px ${y}px)`];
        root.animate(
          { clipPath: escurecendo ? circulos : circulos.slice().reverse() },
          {
            duration: REVEAL_MS,
            easing: "cubic-bezier(.4, 0, .2, 1)",
            pseudoElement: escurecendo ? "::view-transition-new(root)" : "::view-transition-old(root)",
          },
        );
      })
      .catch(() => {});

    transition.finished
      .catch(() => {})
      .then(() => root.classList.remove("tema-recolhendo"));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "light" ? "dark" : "light");
  }, [setTheme, theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme: switchable ? setTheme : undefined,
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
