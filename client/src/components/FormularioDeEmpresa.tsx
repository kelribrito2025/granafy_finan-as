import { useState } from "react";

/*
 * O formulário de uma empresa, usado em dois lugares.
 *
 * Nasceu dentro do menu do perfil, para criar e renomear. A tela de escolha
 * do login precisa exatamente do mesmo formulário para o "Adicionar empresa",
 * e uma segunda cópia dele concordaria com esta só até alguém corrigir uma
 * das duas.
 */
/** O de criar e o de renomear são o mesmo — muda o que ele já traz. */
export function FormularioDeEmpresa({ inicial, salvando, erro, onCancelar, onSalvar }: {
  inicial: { legalName: string; tradeName: string; taxId: string } | null;
  salvando: boolean;
  erro: string | null;
  onCancelar: () => void;
  onSalvar: (valores: { legalName: string; tradeName: string; taxId: string }) => void;
}) {
  const [legalName, setLegalName] = useState(inicial?.legalName ?? "");
  const [tradeName, setTradeName] = useState(inicial?.tradeName ?? "");
  const [taxId, setTaxId] = useState(inicial?.taxId ?? "");
  const vazio = !legalName.trim() && !tradeName.trim();

  const campo = "h-11 w-full rounded-xl border border-[#E3EAE5] bg-white px-3.5 text-[14px] outline-none focus:border-[#12B85C]";
  const rotulo = "mb-1 block text-[12px] font-semibold text-[#4C6355]";

  return (
    <form
      className="mt-5 flex flex-col gap-3"
      onSubmit={event => { event.preventDefault(); if (!vazio) onSalvar({ legalName: legalName.trim(), tradeName: tradeName.trim(), taxId: taxId.trim() }); }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={rotulo} htmlFor="empresa-razao">Razão social</label>
          <input id="empresa-razao" className={campo} value={legalName} onChange={e => setLegalName(e.target.value)} maxLength={180} autoFocus />
        </div>
        <div>
          <label className={rotulo} htmlFor="empresa-fantasia">Nome fantasia</label>
          <input id="empresa-fantasia" className={campo} value={tradeName} onChange={e => setTradeName(e.target.value)} maxLength={180} />
        </div>
      </div>
      <div>
        <label className={rotulo} htmlFor="empresa-cnpj">CNPJ <span className="font-normal text-[#8A968D]">(opcional)</span></label>
        <input id="empresa-cnpj" className={campo} value={taxId} onChange={e => setTaxId(e.target.value)} maxLength={20} />
      </div>

      {/* Um dos dois nomes basta: quem ainda não tem razão social usa o fantasia,
          e a lista sabe resolver o rótulo a partir do que existir. */}
      {vazio && <p className="text-[12px] text-[#8A968D]">Informe a razão social ou o nome fantasia.</p>}
      {erro && <p className="rounded-xl bg-[#FBEBE9] px-3.5 py-2.5 text-[12.5px] text-[#A5231A]">{erro}</p>}

      <div className="mt-1 flex gap-2.5">
        <button type="button" onClick={onCancelar} className="h-12 flex-1 rounded-xl border border-[#E3EAE5] text-[14px] font-semibold text-[#28382E] hover:bg-[#F8FAF9]">Cancelar</button>
        <button type="submit" disabled={vazio || salvando} className="h-12 flex-[1.4] rounded-xl bg-[#12B85C] text-[14px] font-bold text-white hover:bg-[#0F9E4E] disabled:opacity-50">
          {salvando ? "Salvando…" : inicial ? "Salvar" : "Criar empresa"}
        </button>
      </div>
    </form>
  );
}
