import { BuildingIcon, CloseIcon, UsersIcon } from "@/components/IconlyIcons";
import { GranafyLoader } from "@/components/GranafyLoader";
import { toast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";
import { FormEvent, useEffect, useState } from "react";

/*
 * Configurações → Acessos — Fase C do acesso do contador.
 *
 * Três cartões: convidar, os convites em aberto, quem já tem acesso. O dono
 * escolhe QUAIS das suas empresas libera — um convite pode cobrir várias — e
 * revoga por empresa. O texto do topo diz o que o contador pode e não pode,
 * porque é a pergunta que todo dono faz antes de clicar em Convidar.
 */

const fieldClass = "h-[46px] w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[14px] outline-none focus:border-[#12B85C]";
const labelClass = "mb-[7px] block text-[12.5px] font-semibold text-[#4C6355]";

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

function diasAte(data: Date) {
  const dias = Math.ceil((data.getTime() - Date.now()) / 86_400_000);
  if (dias <= 0) return "vence hoje";
  return dias === 1 ? "vence amanhã" : `vence em ${dias} dias`;
}

export function AcessosPanel() {
  const utils = trpc.useUtils();
  const visao = trpc.acessos.visaoGeral.useQuery();
  const recarregar = () => utils.acessos.visaoGeral.invalidate();

  const convidar = trpc.acessos.convidar.useMutation({ onSuccess: recarregar });
  const cancelar = trpc.acessos.cancelarConvite.useMutation({ onSuccess: recarregar });
  const revogar = trpc.acessos.revogar.useMutation({ onSuccess: recarregar });

  const [email, setEmail] = useState("");
  const [escolhidas, setEscolhidas] = useState<number[]>([]);
  /** O link do último convite, para copiar quando o e-mail não sai (ou além dele). */
  const [ultimoLink, setUltimoLink] = useState<{ email: string; link: string; enviado: boolean } | null>(null);

  // A empresa aberta já vem marcada: é a que a pessoa quase sempre quer liberar.
  useEffect(() => {
    if (!visao.data || escolhidas.length > 0) return;
    const atual = visao.data.empresas.find(e => e.atual) ?? visao.data.empresas[0];
    if (atual) setEscolhidas([atual.id]);
  }, [visao.data, escolhidas.length]);

  if (visao.isLoading || !visao.data) {
    return <div className="flex min-h-[300px] flex-1 items-center justify-center rounded-[20px] bg-white ring-1 ring-[#E1E8E3]"><GranafyLoader label="Carregando acessos..." /></div>;
  }

  const { empresas, convites, acessos, emailConfigurado } = visao.data;

  const alternar = (id: number) =>
    setEscolhidas(atual => (atual.includes(id) ? atual.filter(x => x !== id) : [...atual, id]));

  const enviar = async (event: FormEvent) => {
    event.preventDefault();
    if (escolhidas.length === 0) return toast.info("Escolha pelo menos uma empresa.");
    try {
      const resposta = await convidar.mutateAsync({ email, companyIds: escolhidas });
      setUltimoLink({ email: email.trim().toLowerCase(), link: resposta.link, enviado: resposta.enviado });
      toast.success(resposta.enviado ? `Convite enviado para ${email.trim()}` : "Convite criado. Copie o link e envie.");
      setEmail("");
    } catch (erro) {
      toast.error(erro instanceof Error ? erro.message : "Não foi possível convidar");
    }
  };

  const copiar = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado");
    } catch {
      toast.info("Não deu para copiar automaticamente. Selecione o link e copie.");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#E5F7ED] text-[#0A7A42]"><UsersIcon size={19} /></span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold">Convidar contador</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A968D]">
              O contador vê a empresa inteira em modo leitura: lançamentos, conciliação, DRE, balanço e anexos. Não lança, não concilia, não altera cadastro e não vê Configurações. O convite vale por 7 dias e só funciona com o e-mail convidado.
            </p>
          </div>
        </div>

        <form onSubmit={enviar} className="mt-5 grid gap-4">
          <label>
            <span className={labelClass}>E-mail do contador</span>
            <input type="email" required maxLength={320} value={email} onChange={e => setEmail(e.target.value)} placeholder="contador@escritorio.com.br" className={fieldClass} />
          </label>

          <fieldset>
            <legend className={labelClass}>Empresas liberadas</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {empresas.map(empresa => {
                const marcada = escolhidas.includes(empresa.id);
                return (
                  <label key={empresa.id} className={`flex cursor-pointer items-center gap-3 rounded-[12px] border px-3.5 py-3 text-[13.5px] transition ${marcada ? "border-[#12B85C] bg-[#F1FBF6]" : "border-[#E3EAE5] bg-white hover:bg-[#F8FAF9]"}`}>
                    <input type="checkbox" checked={marcada} onChange={() => alternar(empresa.id)} className="h-4 w-4 accent-[#12B85C]" />
                    <BuildingIcon size={16} className={marcada ? "text-[#0A7A42]" : "text-[#8A968D]"} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{empresa.nome}</span>
                    {empresa.atual && <span className="text-[11px] text-[#0A7A42]">atual</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {!emailConfigurado && (
              <p className="text-[11.5px] text-[#8A968D]">O envio de e-mail não está configurado neste ambiente: o link do convite aparece aqui para você mandar.</p>
            )}
            <button type="submit" disabled={convidar.isPending} className="ml-auto h-11 rounded-xl bg-[#12B85C] px-5 text-[13.5px] font-bold text-white hover:bg-[#0F9E4E] disabled:opacity-60">
              {convidar.isPending ? "Enviando..." : "Enviar convite"}
            </button>
          </div>
        </form>

        {ultimoLink && (
          <div className="mt-4 rounded-[14px] bg-[#F1FBF6] p-3.5 text-[12.5px] text-[#28382E]">
            <p className="font-semibold text-[#0A7A42]">{ultimoLink.enviado ? `E-mail enviado para ${ultimoLink.email}.` : `Convite criado para ${ultimoLink.email}.`}</p>
            <p className="mt-1 text-[#4C6355]">Se preferir, mande o link diretamente. Ele só funciona para quem entrar com esse e-mail.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-1.5 text-[11.5px] ring-1 ring-[#DFE6E1]">{ultimoLink.link}</code>
              <button type="button" onClick={() => copiar(ultimoLink.link)} className="h-8 rounded-lg bg-white px-3 text-[12px] font-bold text-[#0A7A42] ring-1 ring-[#DFE6E1] hover:bg-[#DFF6EA]">Copiar link</button>
            </div>
          </div>
        )}
      </article>

      {convites.length > 0 && (
        <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:p-6">
          <h2 className="text-[15px] font-bold">Convites em aberto</h2>
          <ul className="mt-3 divide-y divide-[#F1F4F2]">
            {convites.map(convite => (
              <li key={convite.lote} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-[13.5px]">{convite.email}</strong>
                  <span className="block text-[12px] text-[#8A968D]">
                    {convite.empresas.map(e => e.nome).join(", ")} · enviado em {dataCurta.format(new Date(convite.criadoEm))} · {diasAte(new Date(convite.expiraEm))}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={cancelar.isPending}
                  onClick={async () => {
                    try {
                      await cancelar.mutateAsync({ lote: convite.lote });
                      toast.success("Convite cancelado");
                    } catch (erro) {
                      toast.error(erro instanceof Error ? erro.message : "Não foi possível cancelar");
                    }
                  }}
                  className="h-9 rounded-lg px-3 text-[12.5px] font-bold text-[#B42318] hover:bg-[#FEF3F2] disabled:opacity-60"
                >
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        </article>
      )}

      <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:p-6">
        <h2 className="text-[15px] font-bold">Quem tem acesso</h2>
        {acessos.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-[#8A968D]">Ninguém além de você. Quando um convite for aceito, a pessoa aparece aqui com as empresas que pode ver.</p>
        ) : (
          <ul className="mt-3 divide-y divide-[#F1F4F2]">
            {acessos.map(pessoa => (
              <li key={pessoa.contadorId} className="py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#DFF6EA] text-[#0A7A42]"><UsersIcon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-[13.5px]">{pessoa.nome || pessoa.email}</strong>
                    <span className="block truncate text-[12px] text-[#8A968D]">{pessoa.email} · contador · somente leitura</span>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-2 pl-12">
                  {pessoa.empresas.map(empresa => (
                    <span key={empresa.id} className="inline-flex items-center gap-1.5 rounded-full bg-[#F1FBF6] pl-3 pr-1.5 text-[12px] font-semibold text-[#0A7A42] ring-1 ring-[#DFF6EA]">
                      {empresa.nome}
                      <button
                        type="button"
                        aria-label={`Remover acesso de ${pessoa.nome || pessoa.email} a ${empresa.nome}`}
                        title="Remover acesso a esta empresa"
                        disabled={revogar.isPending}
                        onClick={async () => {
                          if (!window.confirm(`Remover o acesso de ${pessoa.nome || pessoa.email} a ${empresa.nome}?`)) return;
                          try {
                            await revogar.mutateAsync({ contadorId: pessoa.contadorId, companyId: empresa.id });
                            toast.success("Acesso removido");
                          } catch (erro) {
                            toast.error(erro instanceof Error ? erro.message : "Não foi possível remover");
                          }
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[#0A7A42] hover:bg-[#DFF6EA] hover:text-[#B42318] disabled:opacity-60"
                      >
                        <CloseIcon size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}
