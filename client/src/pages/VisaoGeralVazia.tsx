import { AuroraSurface } from "@/components/AuroraSurface";
import { HideValuesButton } from "@/components/HideValuesButton";
import { ArrowDownIcon, ArrowUpIcon, CardIcon, ChartIcon, ChevronRightIcon, MenuIcon, PlusIcon, UploadIcon } from "@/components/IconlyIcons";

/*
 * A visão geral de quem ainda não tem nada.
 *
 * Nenhuma conta, nenhum lançamento: o painel de números seria uma parede de
 * zeros dizendo que a empresa está parada, quando ela só ainda não começou.
 * O desenho da tela fica no lugar — as mesmas caixas, nas mesmas posições —,
 * mas cada uma diz o que vai aparecer nela e por onde isso entra.
 *
 * O portão do primeiro acesso (OnboardingGate) vem antes desta tela: quem
 * chega aqui já viu o assistente e o pulou, ou o terminou sem cadastrar nada.
 * Por isso os "Primeiros passos" não repetem o assistente: apontam para onde
 * cada passo mora de verdade.
 */
export function VisaoGeralVazia({ empresa, categorias, contas, lancamentos, onCadastrarConta, onNovoLancamento, onImportar }: {
  /** Razão social, quando já carregou. */
  empresa: string | null;
  /** Quantas categorias a empresa já tem — o catálogo padrão nasce com ela. */
  categorias: number | null;
  contas: number;
  lancamentos: number;
  onCadastrarConta: () => void;
  onNovoLancamento: () => void;
  onImportar: () => void;
}) {
  const feitos = 1 + (contas > 0 ? 1 : 0) + (lancamentos > 0 ? 1 : 0);
  const apagado = "text-[#B9C7BE]";
  const check = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
  );

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[392px_minmax(0,1fr)]">
        <AuroraSurface className="min-h-[326px] rounded-[20px] p-5 sm:p-6">
          <div className="flex flex-1 flex-col gap-[18px]">
            <div className="relative z-10 flex items-center gap-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8FB39E]">Caixa disponível</span>
              <HideValuesButton tone="onDark" className="ml-auto" />
              <span className="rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-[#C5DACE]">0 contas</span>
            </div>
            <div className="relative z-10 flex flex-col gap-1.5">
              <strong className="text-[36px] leading-none tracking-[-0.03em] text-[#8FB39E] sm:text-[42px]">R$ 0,00</strong>
              <span className="text-[13px] text-[#8FB39E]">O saldo aparece assim que uma conta for cadastrada</span>
            </div>
            <div className="relative z-10 flex min-h-[120px] flex-1 flex-col items-center justify-center gap-3.5 rounded-[14px] border border-dashed border-[#1F3D2B] p-5 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#1F3D2B] text-[#7EE2A8]"><CardIcon size={18} /></span>
              <span className="max-w-[240px] text-[13px] leading-relaxed text-[#C5DACE]">Informe o saldo inicial da conta para acompanhar o caixa daqui em diante.</span>
              <button type="button" onClick={onCadastrarConta} className="flex h-[42px] items-center gap-2 rounded-[11px] bg-[#12B85C] px-[18px] text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E]">
                <PlusIcon size={15} />
                Cadastrar conta bancária
              </button>
            </div>
            <div className="relative z-10 mt-auto grid grid-cols-2 gap-5 border-t border-[#1F3D2B] pt-4">
              <div><span className="block text-[11px] text-[#8FB39E]">Entradas no período</span><strong className="mt-0.5 block text-[17px] text-[#8FB39E]">—</strong></div>
              <div><span className="block text-[11px] text-[#8FB39E]">Saídas no período</span><strong className="mt-0.5 block text-[17px] text-[#8FB39E]">—</strong></div>
            </div>
          </div>
        </AuroraSurface>

        <div className="flex min-w-0 flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-3">
            <article className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
              <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#DFF6EA]"><ArrowUpIcon size={20} className="text-[#0A7A42]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">A receber</span></div>
              <strong className={`text-[26px] tracking-[-0.02em] ${apagado}`}>—</strong>
              <span className="text-xs text-[#8A968D]">Nenhum título cadastrado</span>
            </article>
            <article className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
              <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#FDECEA]"><ArrowDownIcon size={20} className="text-[#B3261E]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">A pagar</span></div>
              <strong className={`text-[26px] tracking-[-0.02em] ${apagado}`}>—</strong>
              <span className="text-xs text-[#8A968D]">Nenhuma conta a pagar</span>
            </article>
            <article className="flex flex-col gap-3 rounded-[20px] bg-white p-5">
              <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#F1F4F2]"><ChartIcon size={20} className="text-[#28382E]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">Margem líquida</span></div>
              <strong className={`text-[26px] tracking-[-0.02em] ${apagado}`}>—</strong>
              <span className="text-xs text-[#8A968D]">Calculada após as primeiras entradas e saídas</span>
            </article>
          </div>

          <section className="flex flex-1 flex-col gap-4 rounded-[20px] bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="text-[15px] font-bold">Primeiros passos</h2>
                <span className="text-[12.5px] text-[#8A968D]">Em três passos o painel começa a trabalhar por você</span>
              </div>
              <div className="ml-auto flex items-center gap-2.5">
                <span className="text-[12px] font-semibold text-[#4C6355]">{feitos} de 3</span>
                <span className="block h-2 w-[120px] overflow-hidden rounded-[4px] bg-[#EDF2EE]"><span className="block h-full bg-[#12B85C]" style={{ width: `${(feitos / 3) * 100}%` }} /></span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3.5 rounded-[14px] bg-[#F1FBF6] px-4 py-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#12B85C] text-white">{check}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-bold text-[#0A7A42]">Empresa criada</span>
                  <span className="truncate text-[12.5px] text-[#4C6355]">
                    {empresa ?? "Sua empresa"}
                    {categorias !== null && ` · ${categorias} categorias padrão já configuradas`}
                  </span>
                </div>
                <span className="text-[12px] font-semibold text-[#0A7A42]">Concluído</span>
              </div>
              <div className="flex flex-wrap items-center gap-3.5 rounded-[14px] bg-[#F8FAF9] px-4 py-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#C9D4CD] text-[12.5px] font-bold text-[#4C6355]">2</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-bold">Cadastre uma conta bancária</span>
                  <span className="text-[12.5px] text-[#4C6355]">Banco, tipo de conta e saldo inicial</span>
                </div>
                <button type="button" onClick={onCadastrarConta} className="h-[38px] shrink-0 rounded-[10px] bg-[#12B85C] px-4 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E]">Cadastrar</button>
              </div>
              <div className="flex flex-wrap items-center gap-3.5 rounded-[14px] bg-[#F8FAF9] px-4 py-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[#C9D4CD] text-[12.5px] font-bold text-[#4C6355]">3</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-bold">Registre o primeiro lançamento</span>
                  <span className="text-[12.5px] text-[#4C6355]">Manual, ou importe o extrato em OFX ou CSV</span>
                </div>
                <button type="button" onClick={onImportar} className="h-[38px] shrink-0 rounded-[10px] border border-[#E3EBE6] px-4 text-[13px] font-semibold text-[#28382E] transition hover:bg-[#F1F4F2]">Importar extrato</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_392px]">
        <section className="flex min-w-0 flex-col gap-3.5 rounded-[20px] bg-white p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <h2 className="text-[15px] font-bold">Últimos lançamentos</h2>
            <span className="ml-auto flex items-center gap-1 text-[12.5px] font-semibold text-[#B9C7BE]">Ver extrato <ChevronRightIcon size={14} /></span>
          </div>
          <div className="flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3.5 rounded-[16px] bg-[#F8FAF9] p-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-[#E3EBE6] bg-white text-[#4C6355]"><MenuIcon size={20} /></span>
            <div className="flex flex-col gap-1">
              <strong className="text-[15px] font-bold">Nenhum lançamento ainda</strong>
              <span className="max-w-[360px] text-[13px] leading-relaxed text-[#4C6355]">Entradas e saídas aparecem aqui conforme forem registradas ou importadas do banco.</span>
            </div>
            <div className="flex flex-wrap justify-center gap-2.5">
              <button type="button" onClick={onNovoLancamento} className="flex h-[42px] items-center gap-2 rounded-[11px] bg-[#12B85C] px-[18px] text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E]">
                <PlusIcon size={15} />
                Novo lançamento
              </button>
              <button type="button" onClick={onImportar} className="flex h-[42px] items-center gap-2 rounded-[11px] border border-[#E3EBE6] bg-white px-[18px] text-[13.5px] font-semibold text-[#28382E] transition hover:bg-[#F8FAF9]">
                <UploadIcon size={15} />
                Importar extrato
              </button>
            </div>
          </div>
        </section>

        <aside className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
          <section className="flex flex-col gap-3.5 rounded-[20px] bg-white p-5">
            <h2 className="text-[15px] font-bold">Receita por canal</h2>
            <div aria-hidden="true" className="flex flex-col gap-3 opacity-45">
              {[38, 52, 30].map(largura => (
                <div key={largura} className="flex flex-col gap-1.5">
                  <span className="h-2.5 rounded-[5px] bg-[#E3EBE6]" style={{ width: `${largura}%` }} />
                  <span className="block h-2 rounded-[4px] bg-[#EDF2EE]" />
                </div>
              ))}
            </div>
            <span className="text-[12.5px] leading-relaxed text-[#8A968D]">As categorias de receita aparecem aqui depois das primeiras entradas do mês.</span>
          </section>

          <section className="flex flex-1 flex-col gap-3 rounded-[20px] bg-white p-5">
            <h2 className="text-[15px] font-bold">Precisa de você</h2>
            <div className="flex items-center gap-3 rounded-[14px] bg-[#F1FBF6] p-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#12B85C] text-white">{check}</span>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-bold text-[#0A7A42]">Nada pendente</span>
                <span className="text-[12px] text-[#4C6355]">Atrasos, conciliações e recebimentos do dia aparecem aqui.</span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
