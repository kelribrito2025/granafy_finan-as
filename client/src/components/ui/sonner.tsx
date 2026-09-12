import { Toaster as Sonner, type ToasterProps } from "sonner";

/*
 * O motor das notificações. O desenho de cada toast mora em `lib/toast.tsx`;
 * aqui só a posição (canto superior direito), a pilha de três com a mais
 * recente na frente, e `unstyled`, para o sonner não pintar nada por cima.
 * O toast é escuro nos dois temas, de propósito: é o mesmo cartão em qualquer
 * fundo.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      position="top-right"
      expand={false}
      visibleToasts={3}
      gap={10}
      offset={16}
      mobileOffset={12}
      toastOptions={{ unstyled: true, classNames: { toast: "toast-granafy" } }}
      className="toaster group"
      style={{ "--width": "420px" } as React.CSSProperties}
      {...props}
    />
  );
};

export { Toaster };
