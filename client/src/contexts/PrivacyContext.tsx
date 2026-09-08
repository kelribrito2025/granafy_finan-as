import { setValuesHidden } from "@/lib/appFormat";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "granafy-valores-ocultos";

type PrivacyValue = { hidden: boolean; toggle: () => void };

const PrivacyContext = createContext<PrivacyValue>({ hidden: false, toggle: () => {} });

/**
 * O modo discreto vive no navegador, não na conta.
 *
 * É uma decisão do momento — alguém ao lado, uma reunião com a tela
 * compartilhada — e não uma preferência da empresa. Guardar no servidor faria
 * o notebook de casa herdar o cuidado que só o do escritório precisava.
 */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  // Publica antes de desenhar, para a primeira pintura já sair mascarada.
  setValuesHidden(hidden);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
    } catch {
      // Navegador sem storage: vale só para esta sessão.
    }
  }, [hidden]);

  return (
    <PrivacyContext.Provider value={{ hidden, toggle: () => setHidden(value => !value) }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacy() {
  return useContext(PrivacyContext);
}
