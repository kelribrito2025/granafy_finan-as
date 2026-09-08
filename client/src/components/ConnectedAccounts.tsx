import { formatMoney as money } from "@/lib/appFormat";
import { trpc } from "@/lib/trpc";



/**
 * Rodapé da sidebar: as contas do usuário com o saldo de cada uma. Substitui o
 * antigo selo do banco de dados, que dizia respeito à infraestrutura e não ao
 * dinheiro de quem usa.
 */
export function ConnectedAccounts({ className = "" }: { className?: string }) {
  const accountsQuery = trpc.organization.accountBalances.useQuery();
  const accounts = accountsQuery.data ?? [];

  return (
    <div className={`rounded-2xl bg-[#F1FBF6] p-3.5 ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-[.1em] text-[#0A7A42]">
        Contas conectadas
      </span>
      {accountsQuery.isLoading ? (
        <span className="mt-2 block text-[11.5px] text-[#4C6355]">Carregando saldos...</span>
      ) : accounts.length === 0 ? (
        <span className="mt-2 block text-[11.5px] leading-relaxed text-[#4C6355]">
          Nenhuma conta cadastrada ainda.
        </span>
      ) : (
        <div className="mt-2.5 flex flex-col gap-1.5">
          {accounts.map(account => (
            <div key={account.id} className="flex items-baseline gap-2 text-[12px]" title={`${account.name}: ${money(account.balance)}`}>
              <span className="min-w-0 flex-1 truncate text-[#4C6355]">{account.name}</span>
              <span className={`shrink-0 font-bold ${account.balance >= 0 ? "text-[#0B1F14]" : "text-[#B3261E]"}`}>
                {money(account.balance)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
