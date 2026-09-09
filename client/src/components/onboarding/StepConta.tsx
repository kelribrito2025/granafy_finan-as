import { currencyInputToNumber, formatCurrencyInput } from "@/lib/currency";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

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

  const utils = trpc.useUtils();
  const criar = trpc.organization.createAccount.useMutation();

  const continuar = async () => {
    const apelido = name.trim() || institution.trim();
    if (apelido.length < 2) return toast.info("Informe o banco ou um apelido para a conta.");
    if (!data) return toast.info("Informe a data a que o saldo inicial se refere.");
    try {
      const conta = await criar.mutateAsync({
        name: apelido,
        institution: institution.trim(),
        accountType,
        color: "#12B85C",
        initialBalance: currencyInputToNumber(saldo),
        initialBalanceDate: data,
      });
      await utils.organization.invalidate();
      onDone(conta!.id, currencyInputToNumber(saldo), data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a conta");
    }
  };

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={rotulo}>Banco</span>
          <input
            list="onboarding-bancos"
            value={institution}
            onChange={e => setInstitution(e.target.value)}
            maxLength={100}
            placeholder="Digite para buscar"
            className={campo}
          />
          <datalist id="onboarding-bancos">
            {BANCOS.map(banco => <option key={banco} value={banco} />)}
          </datalist>
        </label>
        <label className="block">
          <span className={rotulo}>Apelido da conta</span>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={80} placeholder="Como aparece nas telas" className={campo} />
        </label>
      </div>

      <label className="block">
        <span className={rotulo}>Tipo</span>
        <select value={accountType} onChange={e => setAccountType(e.target.value as typeof accountType)} className={campo}>
          {TIPOS.map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
        </select>
      </label>

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

      {/*
        A caixinha do modelo. O texto mudou num ponto: o modelo prometia que o
        saldo de abertura do OFX venceria o digitado, e OFX não traz saldo de
        abertura — traz o do fim do período. O que dá para fazer, e é o que a
        tela promete agora, é conferir por subtração no passo seguinte.
      */}
      <div className="rounded-[14px] bg-[#F1FBF6] p-4 text-[12.5px] leading-relaxed text-[#0A7A42]">
        Informe o saldo do <strong className="font-semibold">dia anterior à primeira movimentação</strong> do
        extrato que você vai importar. O GranaFy soma o extrato a partir daí — o saldo de hoje é
        calculado, nunca digitado.
        <br />
        No próximo passo eu confiro esse número contra o próprio arquivo e aviso se houver diferença.
      </div>

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
