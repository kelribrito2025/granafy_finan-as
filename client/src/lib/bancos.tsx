/*
 * Os bancos que o cadastro de conta sugere, com a marca de cada um.
 *
 * A marca aparece no cadastro, na lista de contas e no cartão de contas da
 * barra lateral — por isso mora aqui, e não dentro de uma página. Logos que a
 * empresa nos passou ficam em client/public/bancos, servidas como arquivo
 * estático do próprio app (não dependem do storage de anexos).
 */

export type BankPreset = { id: string; name: string; initials: string; color: string; logo?: string };

export const BANK_PRESETS: readonly BankPreset[] = [
  { id: "efi", name: "Efi Bank", initials: "EF", color: "#F28C28", logo: "/manus-storage/efi-bank-logo_221c9925.png" },
  { id: "conta-simples", name: "Conta Simples", initials: "CS", color: "#00A86B" },
  { id: "cloudwalk", name: "CloudWalk", initials: "CW", color: "#1A1A0F", logo: "/bancos/cloudwalk.png" },
  { id: "picpay", name: "PicPay", initials: "PP", color: "#11C76F", logo: "/bancos/picpay.png" },
  { id: "nubank", name: "Nubank", initials: "NU", color: "#820AD1" },
  { id: "itau", name: "Itaú", initials: "IT", color: "#EC7000" },
  { id: "bradesco", name: "Bradesco", initials: "BR", color: "#CC092F" },
] as const;

export type BankPresetId = (typeof BANK_PRESETS)[number]["id"] | "outro";

/**
 * O banco sugerido que casa com o texto: igual ao nome, ou começando por ele
 * ("Picpay Empresas" é PicPay). Sem diferenciar maiúsculas.
 */
export function presetDoBanco(texto: string | null | undefined) {
  const alvo = (texto ?? "").trim().toLowerCase();
  if (!alvo) return undefined;
  return BANK_PRESETS.find(item => item.name.toLowerCase() === alvo)
    ?? BANK_PRESETS.find(item => alvo.startsWith(`${item.name.toLowerCase()} `) || alvo.startsWith(item.name.toLowerCase()));
}

const TAMANHO = {
  compact: "h-7 min-w-7 rounded-lg text-[9px]",
  normal: "h-10 min-w-10 rounded-xl text-[12px]",
  sidebar: "h-9 w-9 rounded-[11px] text-[12px]",
} as const;

/**
 * A marca do banco: a logo quando temos, senão as iniciais sobre a cor do
 * banco (ou a cor da conta, para banco fora da lista). `fallback` troca as
 * iniciais do banco pelas da própria conta — útil quando a instituição não
 * foi informada e só o nome da conta identifica.
 */
export function BankMark({ institution, color, size = "normal", fallback }: {
  institution: string;
  color: string;
  size?: keyof typeof TAMANHO;
  fallback?: string;
}) {
  const preset = presetDoBanco(institution);
  const classe = TAMANHO[size];
  if (preset?.logo) {
    return (
      <span className={`flex ${classe} shrink-0 items-center justify-center overflow-hidden bg-white p-1 ring-1 ring-[#E1E8E3]`}>
        <img src={preset.logo} alt={`Logo ${preset.name}`} className="h-full w-full object-contain" />
      </span>
    );
  }
  const iniciais = preset?.initials ?? fallback ?? institution.slice(0, 2).toUpperCase();
  return (
    <span className={`flex ${classe} shrink-0 items-center justify-center px-1.5 font-extrabold text-white`} style={{ backgroundColor: preset?.color ?? color }}>
      {iniciais}
    </span>
  );
}
