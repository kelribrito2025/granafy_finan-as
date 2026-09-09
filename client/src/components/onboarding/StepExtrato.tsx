import { UploadIcon } from "@/components/IconlyIcons";
import { formatMoney } from "@/lib/appFormat";
import { defaultCategoryId, PREFERRED_INCOME_ROOT } from "@/lib/defaultCategory";
import { trpc } from "@/lib/trpc";
import {
  compareOpeningBalance,
  derivedOpeningBalance,
  openingMismatchReason,
  type OpeningComparison,
} from "@shared/openingBalance";
import { useMemo, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

const MAX_BYTES = 25_000_000;

/** "2026-08-31" → "31/08/2026", sem passar por `new Date`. */
function dataCurta(iso: string) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function decodeFile(buffer: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
}

type LinhaDaPrevia = Awaited<ReturnType<ReturnType<typeof trpc.imports.preview.useMutation>["mutateAsync"]>>["rows"][number];

type Prévia = {
  rows: LinhaDaPrevia[];
  statementBalance: { balance: number; asOf: string } | null;
  format: "ofx" | "csv";
  nome: string;
};

/**
 * O aviso de que o saldo digitado e o do arquivo não batem.
 *
 * Mostra os dois números, explica o que cada um é, e deixa a escolha — exceto
 * no caso em que dá para afirmar o que houve: quando o digitado é exatamente o
 * saldo com que o arquivo termina, a pessoa informou o saldo de hoje, e usá-lo
 * como ponto de partida conta o mesmo dinheiro duas vezes.
 */
function AvisoDeDivergencia({ comparacao, motivo, dataInformada, fechamento, onUsarDoArquivo, onManter, pending }: {
  comparacao: OpeningComparison;
  motivo: "saldo_de_hoje" | "digitado_maior" | "digitado_menor";
  dataInformada: string;
  fechamento: number;
  onUsarDoArquivo: () => void;
  onManter: () => void;
  pending: boolean;
}) {
  const botaoArquivo = "h-[46px] rounded-[12px] bg-[#12B85C] px-5 text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-50";
  const botaoManter = "h-[46px] rounded-[12px] border border-[#E3EBE6] px-5 text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#F8FAF9] disabled:opacity-50";

  if (motivo === "saldo_de_hoje") {
    return (
      <div className="rounded-[14px] bg-[#FFF3E6] p-5">
        <strong className="text-[15px] font-bold text-[#8A4B00]">
          Esse parece ser o saldo de hoje, não o de antes do extrato
        </strong>
        <p className="mt-2 text-[13px] leading-relaxed text-[#8A4B00]">
          Você informou <strong className="font-bold">{formatMoney(comparacao.informed)}</strong>, que é exatamente
          o saldo com que este arquivo termina — o que o banco mostra hoje.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[#8A4B00]">
          O GranaFy soma o extrato a partir do saldo inicial. Se eu partir de {formatMoney(fechamento)} e
          somar as movimentações de novo, o mesmo dinheiro entra duas vezes e o painel abre com o dobro
          do que você tem.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-[#8A4B00]">
          Pelas contas do arquivo, o saldo antes da primeira movimentação era{" "}
          <strong className="font-bold">{formatMoney(comparacao.derived)}</strong>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <button type="button" disabled={pending} onClick={onUsarDoArquivo} className={botaoArquivo}>
            Usar {formatMoney(comparacao.derived)} (recomendado)
          </button>
          <button type="button" disabled={pending} onClick={onManter} className={botaoManter}>
            Manter {formatMoney(comparacao.informed)}
          </button>
        </div>
      </div>
    );
  }

  const aMais = comparacao.difference > 0;
  return (
    <div className="rounded-[14px] bg-[#FFF3E6] p-5">
      <strong className="text-[15px] font-bold text-[#8A4B00]">Os dois números não batem</strong>

      <dl className="mt-3 flex flex-col gap-1.5 text-[13px] text-[#8A4B00]">
        <div className="flex flex-wrap justify-between gap-3">
          <dt>Você informou</dt>
          <dd className="font-bold">{formatMoney(comparacao.informed)} em {dataCurta(dataInformada)}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-3">
          <dt>Pelas contas deste arquivo</dt>
          <dd className="font-bold">{formatMoney(comparacao.derived)}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t border-[#E8D3B8] pt-1.5">
          <dt>Diferença</dt>
          {/* Com direção, não só valor: "a mais" e "a menos" dizem para onde. */}
          <dd className="font-bold">
            {formatMoney(Math.abs(comparacao.difference))} {aMais ? "a mais" : "a menos"} no seu número
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-[13px] leading-relaxed text-[#8A4B00]">
        O número do arquivo sai de uma conta simples: o saldo com que ele termina, menos tudo que
        entrou e saiu dentro dele.
      </p>
      <p className="mt-2 text-[13px] leading-relaxed text-[#8A4B00]">
        Os dois podem estar certos. Se esta conta teve movimentações <strong className="font-semibold">antes</strong> do
        que este arquivo cobre, o seu número é o correto — o arquivo não sabe delas. Se este extrato é
        o começo de tudo, o número do arquivo é o correto.
      </p>
      {!aMais && (
        <p className="mt-2 text-[13px] leading-relaxed text-[#8A4B00]">
          Vale conferir a data: se o extrato começa <strong className="font-semibold">antes</strong> de{" "}
          {dataCurta(dataInformada)}, parte do que está no arquivo já estava embutido no saldo que você digitou.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2.5">
        <button type="button" disabled={pending} onClick={onUsarDoArquivo} className={botaoArquivo}>
          Usar {formatMoney(comparacao.derived)}, do arquivo
        </button>
        <button type="button" disabled={pending} onClick={onManter} className={botaoManter}>
          Manter os meus {formatMoney(comparacao.informed)}
        </button>
      </div>
    </div>
  );
}

export function StepExtrato({ contaId, saldoInformado, dataInformada, onDone, onSkip, renderFooter }: {
  /** Nulo quando a pessoa pulou o passo da conta — sem conta não há o que importar. */
  contaId: number | null;
  saldoInformado: number | null;
  dataInformada: string | null;
  onDone: (resultado: { importados: number; divergenciaMantida: OpeningComparison | null }) => void;
  onSkip: () => void;
  renderFooter: (props: { onContinue: () => void; pending: boolean; label: string; extra?: React.ReactNode; disabled?: boolean }) => React.ReactNode;
}) {
  const [previa, setPrevia] = useState<Prévia | null>(null);
  const [decidido, setDecidido] = useState(false);
  const [mantida, setMantida] = useState<OpeningComparison | null>(null);

  const utils = trpc.useUtils();
  const options = trpc.organization.options.useQuery();
  const preview = trpc.imports.preview.useMutation();
  const confirm = trpc.imports.confirm.useMutation();
  const atualizarConta = trpc.organization.updateAccount.useMutation();
  const conta = options.data?.accounts.find(item => item.id === contaId);

  const categorias = options.data?.categories ?? [];
  const receita = useMemo(
    () => defaultCategoryId(categorias.filter(c => c.type === "entrada" || c.type === "ambos"), PREFERRED_INCOME_ROOT),
    [categorias]
  );
  const despesa = useMemo(
    () => defaultCategoryId(categorias.filter(c => c.type === "saida" || c.type === "ambos")),
    [categorias]
  );

  const comparacao = useMemo(() => {
    if (!previa?.statementBalance || saldoInformado === null) return null;
    const derivado = derivedOpeningBalance(previa.statementBalance.balance, previa.rows.map(r => r.amount));
    return compareOpeningBalance(saldoInformado, derivado);
  }, [previa, saldoInformado]);

  const motivo = comparacao && previa?.statementBalance
    ? openingMismatchReason(comparacao, previa.statementBalance.balance)
    : null;

  const escolherArquivo = async (event: ChangeEvent<HTMLInputElement>) => {
    const arquivo = event.target.files?.[0];
    if (!arquivo || !contaId) return;
    const extensao = arquivo.name.split(".").pop()?.toLowerCase();
    if (extensao !== "ofx" && extensao !== "csv") {
      event.target.value = "";
      return toast.error("Selecione um arquivo .OFX ou .CSV");
    }
    if (arquivo.size > MAX_BYTES) {
      event.target.value = "";
      return toast.error("O arquivo deve ter no máximo 25 MB");
    }
    try {
      const content = decodeFile(await arquivo.arrayBuffer());
      const resposta = await preview.mutateAsync({
        fileName: arquivo.name, format: extensao, content,
        accountId: contaId, incomeCategoryId: Number(receita), expenseCategoryId: Number(despesa),
      });
      setPrevia({ rows: resposta.rows, statementBalance: resposta.statementBalance, format: extensao, nome: arquivo.name });
      setDecidido(false);
      setMantida(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ler o arquivo");
    }
  };

  const importar = async () => {
    if (!previa || !contaId) return;
    try {
      /*
       * A confirmação recebe as linhas já lidas, não o arquivo de novo — é o
       * mesmo caminho do modal de importação. Duplicata fica de fora: no
       * primeiro acesso a conta está vazia e não deveria haver nenhuma, mas se
       * o arquivo repetir uma linha dentro dele mesmo, o filtro pega.
       */
      const novas = previa.rows.filter(linha => !linha.duplicate);
      const resultado = await confirm.mutateAsync({
        fileName: previa.nome,
        format: previa.format,
        accountId: contaId,
        duplicateCount: previa.rows.length - novas.length,
        statementBalance: previa.statementBalance,
        rows: novas.map(({ categoryName: _c, duplicate: _d, ...linha }) => linha),
      });
      await utils.invalidate();
      onDone({ importados: resultado.importedCount, divergenciaMantida: mantida });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar");
    }
  };

  const usarDoArquivo = async () => {
    if (!comparacao || !conta) return;
    try {
      await atualizarConta.mutateAsync({
        id: conta.id, name: conta.name, institution: conta.institution,
        accountType: (conta as { accountType?: "corrente" }).accountType ?? "corrente",
        color: conta.color, initialBalance: comparacao.derived,
        initialBalanceDate: dataInformada,
      });
      await utils.organization.invalidate();
      setMantida(null);
      setDecidido(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível ajustar o saldo");
    }
  };

  const pending = preview.isPending || confirm.isPending || atualizarConta.isPending;
  const precisaDecidir = Boolean(comparacao && !comparacao.agree && !decidido);

  if (!contaId) {
    return (
      <>
        <p className="rounded-[14px] bg-[#FFF3E6] p-4 text-[13px] leading-relaxed text-[#8A4B00]">
          Você pulou o cadastro da conta, e o extrato precisa de uma conta para entrar. Dá para
          seguir sem importar nada agora — as movimentações podem ser trazidas depois, em
          Lançamentos.
        </p>
        {renderFooter({ onContinue: onSkip, pending: false, label: "Continuar" })}
      </>
    );
  }

  return (
    <>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[14px] border-[1.5px] border-dashed border-[#B9C7BE] p-8 text-center transition hover:border-[#12B85C] hover:bg-[#F1FBF6]">
        <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#DFF6EA] text-[#0A7A42]">
          <UploadIcon size={18} />
        </span>
        <strong className="text-[14px]">{previa ? previa.nome : "Escolher o arquivo do extrato"}</strong>
        {/* Sem PDF: não existe importador de PDF, e oferecer o que não funciona
            é pior do que não oferecer. */}
        <span className="text-[12.5px] text-[#8A968D]">OFX ou CSV do internet banking · até 25 MB</span>
        <input type="file" accept=".ofx,.csv" onChange={escolherArquivo} className="hidden" />
      </label>

      {previa && (
        <div className="flex flex-col gap-1.5 rounded-[14px] bg-[#F8FAF9] p-4 text-[13px] text-[#4C6355]">
          <div className="flex justify-between gap-3">
            <span>Movimentações no arquivo</span>
            <strong className="text-[#0B1F14]">{previa.rows.length.toLocaleString("pt-BR")}</strong>
          </div>
          {previa.statementBalance ? (
            <div className="flex justify-between gap-3">
              <span>Saldo com que o extrato termina</span>
              <strong className="text-[#0B1F14]">
                {formatMoney(previa.statementBalance.balance)} em {dataCurta(previa.statementBalance.asOf)}
              </strong>
            </div>
          ) : (
            /* CSV nunca declara saldo, e nem todo OFX traz. Sem ele não há o que
               conferir — dizer isso é melhor que ficar em silêncio. */
            <span className="text-[12.5px] text-[#8A968D]">
              Este arquivo não declara o saldo do extrato, então não dá para conferir o saldo inicial
              agora. A conciliação do fim do mês continua valendo.
            </span>
          )}
          {comparacao?.agree && (
            <span className="text-[12.5px] font-semibold text-[#0A7A42]">
              O saldo inicial que você informou bate com o do arquivo.
            </span>
          )}
        </div>
      )}

      {precisaDecidir && comparacao && motivo && previa?.statementBalance && dataInformada && (
        <AvisoDeDivergencia
          comparacao={comparacao}
          motivo={motivo}
          dataInformada={dataInformada}
          fechamento={previa.statementBalance.balance}
          pending={pending}
          onUsarDoArquivo={usarDoArquivo}
          onManter={() => { setMantida(comparacao); setDecidido(true); }}
        />
      )}

      {renderFooter({
        onContinue: previa ? importar : onSkip,
        pending,
        // Enquanto a divergência não for resolvida o botão fica travado, mas
        // sem dizer "Salvando…": não está salvando, está esperando a escolha.
        disabled: precisaDecidir,
        label: previa ? `Importar ${previa.rows.length.toLocaleString("pt-BR")} movimentações` : "Continuar",
        extra: !previa ? (
          <button
            type="button"
            onClick={onSkip}
            className="h-[46px] rounded-[12px] border border-[#E3EBE6] px-5 text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#F8FAF9]"
          >
            Começar sem extrato
          </button>
        ) : undefined,
      })}
    </>
  );
}
