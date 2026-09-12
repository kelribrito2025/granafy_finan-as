import { trpc } from "@/lib/trpc";
import { toast } from "@/lib/toast";
import { useState } from "react";

/*
 * A porta de saída de um dado, e a única do produto.
 *
 * O desenho é de propósito o oposto do resto do admin: sem verde, sem botão
 * grande e simpático, e com a lista do que some antes da pergunta. A pessoa
 * digita o nome inteiro porque um "tem certeza?" se clica no automático — e
 * aqui não há desfazer nem backup de ontem que valha (a retenção do TiDB é
 * de um dia).
 *
 * As mesmas travas existem no servidor: a confirmação é conferida lá, admin
 * não apaga admin e ninguém apaga a si mesmo. Esta tela é a cortesia; o
 * portão é o `admin/exclusoes.ts`.
 */
export function ModalDeExclusao({ alvo, id, aoFechar, aoApagar }: {
  alvo: "conta" | "usuario";
  id: number;
  aoFechar: () => void;
  /** Chamado depois que o servidor confirmou. */
  aoApagar: () => void;
}) {
  const [digitado, setDigitado] = useState("");
  const utils = trpc.useUtils();

  const previaConta = trpc.admin.contas.previaDaExclusao.useQuery({ id }, { enabled: alvo === "conta", staleTime: 0 });
  const previaUsuario = trpc.admin.usuarios.previaDaExclusao.useQuery({ id }, { enabled: alvo === "usuario", staleTime: 0 });
  const previa = alvo === "conta" ? previaConta : previaUsuario;
  const dados = previa.data;

  const invalidar = async () => {
    await Promise.all([
      utils.admin.contas.listar.invalidate(),
      utils.admin.usuarios.listar.invalidate(),
      utils.admin.barra.invalidate(),
      utils.admin.resumo.invalidate(),
    ]);
  };

  const apagarConta = trpc.admin.contas.excluir.useMutation({
    onSuccess: async resultado => {
      toast.success("Empresa apagada", { description: `${resultado.empresa} · ${resultado.total.toLocaleString("pt-BR")} linhas` });
      await invalidar();
      aoApagar();
    },
    onError: erro => toast.error("Não deu para apagar", { description: erro.message }),
  });
  const apagarUsuario = trpc.admin.usuarios.excluir.useMutation({
    onSuccess: async resultado => {
      toast.success("Usuário apagado", { description: `${resultado.pessoa} · ${resultado.total.toLocaleString("pt-BR")} linhas` });
      await invalidar();
      aoApagar();
    },
    onError: erro => toast.error("Não deu para apagar", { description: erro.message }),
  });
  const apagando = apagarConta.isPending || apagarUsuario.isPending;

  const nome = dados && "empresa" in dados ? dados.empresa.legalName : dados && "pessoa" in dados ? (dados.pessoa.name ?? dados.pessoa.email ?? `#${id}`) : "";
  const frase = dados?.confirmacao ?? "";
  const bate = frase.length > 0 && digitado.trim() === frase.trim();
  const ehAdmin = Boolean(dados && "admin" in dados && dados.admin);
  const comLinhas = (dados?.linhas ?? []).filter(l => l.linhas > 0);

  const apagar = () => {
    if (!bate || apagando) return;
    if (alvo === "conta") apagarConta.mutate({ id, confirmacao: digitado.trim() });
    else apagarUsuario.mutate({ id, confirmacao: digitado.trim() });
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07150d]/55 p-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-labelledby="titulo-exclusao">
      <div className="flex max-h-[88vh] w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_24px_60px_rgba(11,31,20,.3)]">
        <header className="flex items-start gap-3 border-b border-[#F1F4F2] bg-[#FDECEA] px-5 py-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#B3261E] text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="titulo-exclusao" className="text-[16px] font-bold text-[#8E1F16]">
              {alvo === "conta" ? "Apagar esta empresa" : "Apagar este login"}
            </h2>
            <p className="text-[12.5px] text-[#8A4A45]">Não há desfazer. O dado sai do banco na hora.</p>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          {previa.isPending && <p className="py-6 text-center text-[13px] text-[#8A968D]">Contando o que seria apagado…</p>}
          {previa.error && <p className="rounded-[12px] bg-[#FDECEA] p-3.5 text-[13px] text-[#8E1F16]">{previa.error.message}</p>}

          {dados && (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">{alvo === "conta" ? "Empresa" : "Pessoa"}</span>
                <strong className="text-[15px]">{nome}</strong>
                {"titular" in dados && dados.titular && (
                  <span className="text-[12.5px] text-[#4C6355]">
                    titular {dados.titular.name ?? dados.titular.email} · o login continua existindo
                    {dados.empresasRestantes === 0 ? ", sem nenhuma empresa" : `, com mais ${dados.empresasRestantes} ${dados.empresasRestantes === 1 ? "empresa" : "empresas"}`}
                  </span>
                )}
                {"empresas" in dados && (
                  <span className="text-[12.5px] text-[#4C6355]">
                    {dados.empresas.length === 0
                      ? "nenhuma empresa vinculada"
                      : `apaga junto ${dados.empresas.length === 1 ? "a empresa" : "as empresas"} ${dados.empresas.map(e => e.legalName).join(", ")}`}
                  </span>
                )}
              </div>

              {ehAdmin && (
                <p className="rounded-[12px] border border-[#E0C48A] bg-[#FFF9EB] p-3.5 text-[12.5px] font-semibold leading-relaxed text-[#8A4B00]">
                  Este login é admin do sistema. O servidor recusa a exclusão enquanto ele for — tire o papel de admin antes.
                </p>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">O que some</span>
                {dados.total === 0 ? (
                  <p className="rounded-[12px] bg-[#F8FAF9] p-3.5 text-[13px] text-[#4C6355]">Nenhum dado registrado além do cadastro.</p>
                ) : (
                  <div className="flex flex-col rounded-[12px] bg-[#F8FAF9] p-1">
                    {comLinhas.map(linha => (
                      <div key={linha.rotulo} className="flex items-center gap-3 px-3 py-[7px] text-[13px]">
                        <span className="min-w-0 flex-1 truncate text-[#28382E]">{linha.rotulo}</span>
                        <strong className="tabular-nums text-[#8E1F16]">{linha.linhas.toLocaleString("pt-BR")}</strong>
                      </div>
                    ))}
                    <div className="mt-1 flex items-center gap-3 border-t border-[#E3EBE6] px-3 py-2 text-[13px]">
                      <span className="min-w-0 flex-1 font-semibold">Total</span>
                      <strong className="tabular-nums">{dados.total.toLocaleString("pt-BR")}</strong>
                    </div>
                  </div>
                )}
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-[12.5px] text-[#28382E]">
                  Para confirmar, digite <strong className="font-bold">{frase}</strong>
                </span>
                <input
                  value={digitado}
                  onChange={e => setDigitado(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") apagar(); }}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={frase}
                  className="h-11 rounded-[12px] bg-white px-3.5 text-[13.5px] outline-none ring-1 ring-[#DFE6E1] focus:ring-2 focus:ring-[#B3261E]"
                />
              </label>
            </>
          )}
        </div>

        <footer className="flex items-center gap-2.5 border-t border-[#F1F4F2] px-5 py-4">
          <button type="button" onClick={aoFechar} className="h-11 flex-1 rounded-[12px] border border-[#E3EBE6] text-[13.5px] font-semibold text-[#28382E] transition hover:bg-[#F8FAF9]">
            Cancelar
          </button>
          <button
            type="button"
            onClick={apagar}
            disabled={!bate || apagando || ehAdmin}
            className="h-11 flex-1 rounded-[12px] bg-[#B3261E] text-[13.5px] font-bold text-white transition hover:bg-[#8E1F16] disabled:pointer-events-none disabled:opacity-40"
          >
            {apagando ? "Apagando…" : "Apagar para sempre"}
          </button>
        </footer>
      </div>
    </div>
  );
}
