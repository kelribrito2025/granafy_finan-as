import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

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
 * Onde a API não existe (Firefox e Safari antigos, Chrome muito antigo) entra a
 * cortina de reserva, abaixo. Quando o sistema pede menos movimento, nem uma
 * nem outra: o `setTheme` normal acontece e a tela troca de uma vez.
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

/** O fundo de página de cada tema — a cor da cortina. */
const FUNDO: Record<Theme, string> = { light: "#E9EEEB", dark: "#0D1812" };
const CORTINA_MS = 620;

/*
 * A cortina de reserva, para navegador sem View Transitions.
 *
 * Sem a API não há foto da tela nova para revelar. O que dá para fazer é
 * cobrir a tela com a COR do tema escuro, no mesmo retângulo e no mesmo
 * tempo, e trocar o tema embaixo enquanto ninguém vê:
 *
 *   escurecendo — a cortina escura nasce no cartão, cresce até passar das
 *   beiradas, o tema troca por baixo, e a cortina some num fade curto
 *   (o fundo dela é o fundo do tema novo, então o fade só revela conteúdo);
 *
 *   clareando — a cortina escura cobre a tela inteira (indistinguível do
 *   fundo escuro que já estava lá), o tema troca por baixo, e ela encolhe
 *   de volta ao cartão, levando o escuro embora.
 *
 * É o mesmo movimento do efeito com a API, só sem o conteúdo dentro do
 * retângulo durante o trajeto.
 */
function cortinaDeReserva(escurecendo: boolean, trocar: () => void) {
  const { card, full } = themeClipBounds();
  const cortina = document.createElement("div");
  cortina.className = "tema-cortina";
  cortina.setAttribute("aria-hidden", "true");
  cortina.style.background = FUNDO.dark;
  cortina.style.clipPath = escurecendo ? card : full;
  document.body.appendChild(cortina);

  const encerrar = () => cortina.remove();
  const proximoQuadro = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));

  if (escurecendo) {
    proximoQuadro(() => {
      cortina.style.clipPath = full;
      window.setTimeout(() => {
        trocar();
        proximoQuadro(() => {
          cortina.style.transition = "opacity 220ms ease-out";
          cortina.style.opacity = "0";
          window.setTimeout(encerrar, 260);
        });
      }, CORTINA_MS + 20);
    });
    return;
  }

  proximoQuadro(() => {
    trocar();
    proximoQuadro(() => {
      cortina.style.clipPath = card;
      window.setTimeout(encerrar, CORTINA_MS + 40);
    });
  });
}

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

  /*
   * O tema em vigor, legível de dentro do callback.
   *
   * `setPreference` é memorizado sem dependências para não recriar a cada
   * render; sem esta referência ele leria o tema do primeiro render e
   * compararia contra um valor velho.
   */
  const themeRef = useRef(theme);
  themeRef.current = theme;

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
    const resolvido = resolveTheme(next, systemPrefersDark());
    const doc = document as ViewTransitionDocument;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quieto || resolvido === themeRef.current) {
      // Trocar de "escuro" para "auto" num sistema escuro não muda pixel
      // nenhum: animar a revelação de uma tela idêntica só pisca à toa.
      setPreferenceState(next);
      return;
    }
    if (!doc.startViewTransition) {
      cortinaDeReserva(resolvido === "dark", () => flushSync(() => setPreferenceState(next)));
      return;
    }

    const { card, full } = themeClipBounds();
    const root = document.documentElement;
    const escurecendo = resolvido === "dark";

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
      flushSync(() => setPreferenceState(next));
    });

    transition.finished
      .catch(() => {})
      .then(() => {
        root.classList.remove("tema-escurecendo", "tema-clareando");
        root.style.removeProperty("--tema-de");
        root.style.removeProperty("--tema-para");
      });
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
