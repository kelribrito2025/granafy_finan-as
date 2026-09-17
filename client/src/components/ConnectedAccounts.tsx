import { ChevronRightIcon } from "@/components/IconlyIcons";
import { formatMoney as money, valuesHidden } from "@/lib/appFormat";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";


/** Total abreviado que cabe na pílula de 40px do menu recolhido: "112k". */
function compact(value: number) {
  // A pílula recolhida também é dinheiro na tela: no modo discreto ela some.
  if (valuesHidden()) return "•••";
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`;
  if (absolute >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(Math.round(value));
}

/** "Total 214,2 mil": o somado, curto, para a linha de baixo do cartão. */
function totalCurto(value: number) {
  if (valuesHidden()) return "•••";
  const absolute = Math.abs(value);
  const sinal = value < 0 ? "-" : "";
  if (absolute >= 1_000_000) return `${sinal}${(absolute / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (absolute >= 1_000) return `${sinal}${(absolute / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return money(value);
}

/** "CloudWalk" → "CW", "Efi Bank" → "EF", "Picpay Empresas" → "PP" — a sigla do quadradinho. */
function sigla(nome: string) {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length >= 2) return `${palavras[0]![0]}${palavras[1]![0]}`.toUpperCase();
  return nome.slice(0, 2).toUpperCase();
}

/**
 * Rodapé da sidebar: as contas do usuário com o saldo de cada uma. Substitui o
 * antigo selo do banco de dados, que dizia respeito à infraestrutura e não ao
 * dinheiro de quem usa.
 */
export function ConnectedAccounts({ className = "", variant = "card" }: {
  className?: string;
  variant?: "card" | "rail";
}) {
  const [, setLocation] = useLocation();
  const accountsQuery = trpc.organization.accountBalances.useQuery();
  const accounts = accountsQuery.data?.contas ?? [];
  const [indice, setIndice] = useState(0);

  if (variant === "rail") {
    const total = accounts.reduce((sum, account) => sum + account.balance, 0);
    return (
      <span
        title={`Saldo somado das contas: ${money(total)}`}
        className={`flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/10 text-[11px] font-bold text-[#7EE2A8] ${className}`}
      >
        {accountsQuery.isLoading ? "—" : compact(total)}
      </span>
    );
  }

  const total = accounts.reduce((sum, account) => sum + account.balance, 0);
  const atual = accounts[Math.min(indice, Math.max(accounts.length - 1, 0))];

  return (
    <div className={`flex flex-col gap-[11px] rounded-2xl bg-[#F1FBF6] px-3.5 py-[13px] ${className}`}>
      {accountsQuery.isLoading ? (
        <span className="block text-[11.5px] text-[#4C6355]">Carregando saldos...</span>
      ) : !atual ? (
        <>
          <span className="block text-[11.5px] leading-relaxed text-[#4C6355]">
            Nenhuma ainda
          </span>
          <button type="button" onClick={() => setLocation("/organizacao?nova=conta")} className="text-left text-[12.5px] font-bold text-[#0A7A42] hover:underline">
            Cadastrar conta →
          </button>
        </>
      ) : (
        <>
          {/* Uma conta por vez: o cartão fica do mesmo tamanho com 2 ou 12 contas. */}
          <div className="flex items-center gap-2.5" title={`${atual.name}: ${money(atual.balance)}`}>
            <span
              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] text-[11px] font-bold text-white"
              style={{ background: atual.balance < 0 ? "#B3261E" : atual.color }}
            >
              {sigla(atual.name)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-[11.5px] text-[#4C6355]">{atual.name}</span>
              <span className={`whitespace-nowrap text-[14.5px] font-bold ${atual.balance >= 0 ? "text-[#0B1F14]" : "text-[#B3261E]"}`}>
                {money(atual.balance)}
              </span>
            </div>
            {accounts.length > 1 && (
              <button
                type="button"
                aria-label="Próxima conta"
                onClick={() => setIndice((indice + 1) % accounts.length)}
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] text-[#0A7A42] transition hover:bg-[#DFF6EA]"
              >
                <ChevronRightIcon size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-[5px]">
            {accounts.length > 1 && (
              <span className="flex items-center gap-[5px]">
                {accounts.map((account, n) => (
                  <button
                    key={account.id}
                    type="button"
                    aria-label={`Ver ${account.name}`}
                    onClick={() => setIndice(n)}
                    className={`h-[5px] rounded-[3px] transition-all ${n === indice ? "w-4 bg-[#0A7A42]" : "w-[5px] bg-[#B9C7BE] hover:bg-[#8FB39E]"}`}
                  />
                ))}
              </span>
            )}
            <span className="ml-auto whitespace-nowrap text-[10.5px] font-semibold text-[#0A7A42]" title={`Saldo somado das contas: ${money(total)}`}>
              Total {totalCurto(total)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
