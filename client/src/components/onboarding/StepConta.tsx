import { CheckIcon, SearchIcon } from "@/components/IconlyIcons";
import { CartaoDeApoio, OnboardingLateral } from "@/components/onboarding/OnboardingStepper";
import { currencyInputToNumber, formatCurrencyInput } from "@/lib/currency";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";

const TIPOS = [
  ["corrente", "Conta corrente"],
  ["poupanca", "Poupança"],
  ["carteira", "Carteira"],
  ["cartao", "Cartão"],
  ["gateway", "Gateway de pagamento"],
  ["outro", "Outro"],
] as const;

/** Os bancos que a busca sugere. Digitar outro nome também vale. */
const BANCOS = [
  "Banco do Brasil", "Bradesco", "BTG Pactual", "C6 Bank", "Caixa Econômica Federal",
  "CloudWalk", "Efi Bank", "Inter", "Itaú", "Mercado Pago", "Nubank",
  "PagBank", "Picpay Empresas", "Safra", "Santander", "Sicoob", "Sicredi", "Stone",
];

/*
 * O que não é banco.
 *
 * Dinheiro em espécie e carteira digital são contas como qualquer outra para o
 * saldo — e quem tem caixa físico não encontra "caixa" numa busca de bancos.
 */
const SEM_BANCO = [
  { nome: "Caixa físico", tipo: "carteira" as const, sigla: "R$" },
  { nome: "Carteira digital", tipo: "carteira" as const, sigla: "CD" },
  { nome: "Outro", tipo: "outro" as const, sigla: "+" },
];

/** As duas primeiras letras, para o quadradinho ao lado do nome. */
function sigla(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return (partes.length > 1 ? partes[0][0] + partes[1][0] : nome.slice(0, 2)).toUpperCase();
}

const campo = "h-[46px] w-full rounded-[12px] border border-[#E3EBE6] bg-white px-3.5 text-[14px] text-[#0B1F14] outline-none transition focus:border-[#12B85C] placeholder:text-[#8A968D]";
const rotulo = "mb-1.5 block text-[12px] font-semibold text-[#4C6355]";

export function StepConta({ onDone, onSkip, renderFooter }: {
  onDone: (contaId: number, saldo: number, data: string) => void;
  onSkip: () => void;
  renderFooter: (props: { onContinue: () => void; pending: boolean; label: string; extra?: React.ReactNode }) => React.ReactNode;
}) {
  const [institution, setInstitution] = useState("");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<(typeof TIPOS)[number][0]>("corrente");
  const [saldo, setSaldo] = useState("");
  const [data, setData] = useState("");
  const [busca, setBusca] = useState("");

  /* Sem busca, os seis mais comuns; com busca, o que casa com o que se digitou. */
  const sugeridos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return BANCOS.slice(0, 6);
    return BANCOS.filter(banco => banco.toLowerCase().includes(termo)).slice(0, 6);
  }, [busca]);

  const utils = trpc.useUtils();
  const criar = trpc.organization.createAccount.useMutation();

  const continuar = async () => {
    const apelido = name.trim() || institution.trim();
    if (apelido.length < 2) return toast.info("Informe o banco ou um apelido para a conta.");
    if (!data) return toast.info("Informe a data a que o saldo inicial se refere.");
    /*
     * Campo vazio é zero. O campo mostra "0,00" de sugestão e quem não digita
     * nada quer exatamente isso — e `currencyInputToNumber("")` devolve NaN,
     * que o servidor recusava com um erro cru de validação.
     */
    const saldoInicial = saldo.trim() ? currencyInputToNumber(saldo) : 0;
    if (!Number.isFinite(saldoInicial)) return toast.info("Informe um saldo inicial válido.");
    try {
      const conta = await criar.mutateAsync({
        name: apelido,
        institution: institution.trim(),
        accountType,
        color: "#12B85C",
        initialBalance: saldoInicial,
        initialBalanceDate: data,
      });
      await utils.organization.invalidate();
      onDone(conta!.id, saldoInicial, data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a conta");
    }
  };

  return (
    <>
      <label className="block">
        <span className={rotulo}>Banco</span>
        <span className="relative block">
          <SearchIcon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A968D]" />
          <input
            value={busca}
            onChange={e => { setBusca(e.target.value); setInstitution(e.target.value); }}
            maxLength={100}
            placeholder="Buscar banco, instituição ou carteira digital…"
            className={`${campo} pl-10`}
          />
        </span>
      </label>

      {sugeridos.length > 0 && (
        <div>
          <span className="mb-2 block text-[10.5px] font-semibold uppercase tracking-[.1em] text-[#4C6355]">
            {busca.trim() ? "Resultados" : "Mais usados"}
          </span>
          <div className="grid gap-3 sm:grid-cols-2">
            {sugeridos.map(banco => {
              const escolhido = institution === banco;
              return (
                <button
                  key={banco}
                  type="button"
                  onClick={() => { setInstitution(banco); setBusca(banco); if (!name.trim()) setName(banco); }}
                  aria-pressed={escolhido}
                  className={`flex items-center gap-3 rounded-[14px] border-[1.5px] p-3.5 text-left transition ${
                    escolhido ? "border-[#12B85C] bg-[#F1FBF6]" : "border-[#E3EBE6] hover:border-[#B9C7BE] hover:bg-[#F8FAF9]"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F4F2] text-[10.5px] font-bold text-[#4C6355]">
                    {sigla(banco)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{banco}</span>
                  {escolhido && <CheckIcon size={15} className="shrink-0 text-[#0A7A42]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <span className="mb-2 block text-[10.5px] font-semibold uppercase tracking-[.1em] text-[#4C6355]">Sem banco</span>
        <div className="grid gap-3 sm:grid-cols-3">
          {SEM_BANCO.map(opcao => {
            const escolhido = institution === opcao.nome;
            return (
              <button
                key={opcao.nome}
                type="button"
                onClick={() => {
                  setInstitution(opcao.nome);
                  setBusca(opcao.nome);
                  setAccountType(opcao.tipo);
                  if (!name.trim()) setName(opcao.nome);
                }}
                aria-pressed={escolhido}
                className={`flex items-center gap-3 rounded-[14px] border-[1.5px] p-3.5 text-left transition ${
                  escolhido ? "border-[#12B85C] bg-[#F1FBF6]" : "border-[#E3EBE6] hover:border-[#B9C7BE] hover:bg-[#F8FAF9]"
                }`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F4F2] text-[10.5px] font-bold text-[#4C6355]">
                  {opcao.sigla}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{opcao.nome}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={rotulo}>Apelido da conta</span>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Como aparece nas telas" className={campo} />
        </label>
        <label className="block">
          <span className={rotulo}>Tipo</span>
          <select value={accountType} onChange={e => setAccountType(e.target.value as typeof accountType)} className={campo}>
            {TIPOS.map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
          </select>
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={rotulo}>Saldo inicial</span>
          <input
            value={saldo}
            onChange={e => setSaldo(formatCurrencyInput(e.target.value))}
            inputMode="numeric"
            placeholder="0,00"
            className={`${campo} h-[56px] text-[18px] font-bold`}
          />
        </label>
        <label className="block">
          <span className={rotulo}>Nessa data</span>
          <input
            type="date"
            value={data}
            onChange={e => setData(e.target.value)}
            className={`${campo} h-[56px]`}
          />
        </label>
      </div>

      <OnboardingLateral>
        <CartaoDeApoio titulo="Por que o saldo inicial">
          {/*
            O texto mudou num ponto em relação ao modelo: ele prometia que o
            saldo de abertura do OFX venceria o digitado, e OFX não traz saldo
            de abertura — traz o do fim do período. O que dá para fazer, e é o
            que a tela promete agora, é conferir por subtração no passo seguinte.
          */}
          {[
            <>Informe o saldo do <strong className="font-semibold">dia anterior à primeira movimentação</strong> do extrato que você vai importar.</>,
            <>O extrato é somado a esse ponto de partida — assim o saldo de hoje é calculado, não digitado duas vezes.</>,
            <>No próximo passo eu confiro esse número contra o próprio arquivo e aviso se houver diferença.</>,
          ].map((linha, indice) => (
            <span key={indice} className="flex items-start gap-2 text-[12.5px] leading-relaxed text-[#4C6355]">
              <CheckIcon size={14} className="mt-0.5 shrink-0 text-[#0A7A42]" />
              <span>{linha}</span>
            </span>
          ))}
        </CartaoDeApoio>
      </OnboardingLateral>

      {renderFooter({
        onContinue: continuar,
        pending: criar.isPending,
        label: "Continuar",
        extra: (
          <button
            type="button"
            onClick={onSkip}
            className="h-[46px] rounded-[12px] border border-[#E3EBE6] px-5 text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#F8FAF9]"
          >
            Pular por agora
          </button>
        ),
      })}
    </>
  );
}
