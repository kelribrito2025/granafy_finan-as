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
 * A troca de tema, saindo do cartão escuro.
 *
 * O tema inteiro é CSS na raiz: trocar a classe repinta tudo no mesmo quadro,
 * e o corte seco de branco para preto é desagradável. A View Transitions API
 * fotografa a tela antes e depois; o recorte abaixo revela a foto nova a
 * partir do retângulo do cartão que já estava escuro — mesmas bordas
 * arredondadas — até passar das beiradas da tela.
 *
 * O recorte é declarado em CSS, com as duas pontas em variáveis, e não pela
 * API de animação do JavaScript. Chamando `element.animate()` depois de
 * `transition.ready` o navegador chega a pintar um quadro com a foto nova
 * inteira antes de a animação começar — é o "pisca" que aparecia antes de
 * o retângulo crescer.
 *
 * Onde a API não existe (Firefox e Safari antigos), ou quando o sistema pede
 * menos movimento, o `setTheme` normal acontece e a tela troca de uma vez.
 */

/** Quanto o retângulo passa de cada beirada, para os cantos saírem da tela. */
const OVERSHOOT = 48;

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/**
 * As duas pontas do recorte: o retângulo do cartão escuro e a tela inteira.
 *
 * Sem cartão na página — nem toda tela tem um — sobra um retângulo do tamanho
 * de um cartão no meio, que dá o mesmo movimento sem depender do conteúdo.
 */
function themeClipBounds() {
  const card = document.querySelector<HTMLElement>("[data-theme-origin]");
  const rect = card?.getBoundingClientRect();
  const view = { w: window.innerWidth, h: window.innerHeight };

  let box = rect && rect.width > 0 && rect.height > 0
    ? { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom }
    : null;
  if (!box) {
    const w = Math.min(392, view.w * 0.6);
    const h = Math.min(326, view.h * 0.4);
    const left = (view.w - w) / 2;
    const top = (view.h - h) / 2;
    box = { top, left, right: left + w, bottom: top + h };
  }

  const radius = card ? Number.parseFloat(getComputedStyle(card).borderTopLeftRadius) || 20 : 20;
  const round = `round ${radius}px`;
  return {
    card: `inset(${box.top}px ${view.w - box.right}px ${view.h - box.bottom}px ${box.left}px ${round})`,
    full: `inset(${-OVERSHOOT}px ${round})`,
  };
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

    const { card, full } = themeClipBounds();
    const root = document.documentElement;
    const escurecendo = next === "dark";

    /*
     * Escurecendo, o retângulo cresce e revela a foto nova. Clareando, ele
     * encolhe de volta para o cartão levando a foto antiga embora — e para
     * isso ela precisa ficar por cima, que é o contrário do padrão.
     */
    root.style.setProperty("--tema-de", escurecendo ? card : full);
    root.style.setProperty("--tema-para", escurecendo ? full : card);
    root.classList.add(escurecendo ? "tema-escurecendo" : "tema-clareando");

    // O flushSync é o ponto do truque: sem ele o React pinta o tema novo
    // depois que a API já tirou as duas fotos, e as duas saem iguais.
    const transition = doc.startViewTransition(() => {
      flushSync(() => setThemeState(next));
    });

    transition.finished
      .catch(() => {})
      .then(() => {
        root.classList.remove("tema-escurecendo", "tema-clareando");
        root.style.removeProperty("--tema-de");
        root.style.removeProperty("--tema-para");
      });
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
