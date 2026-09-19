import { AppSidebar } from "@/components/AppSidebar";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartIcon,
  ChevronRightIcon,
  MenuIcon,
  NotificationIcon,
  PlusIcon,
  SidebarMenuIcon,
  UploadIcon,
} from "@/components/IconlyIcons";
import { AuroraSurface } from "@/components/AuroraSurface";
import { VisaoGeralSkeleton } from "@/components/PageSkeleton";
import { BarrasFantasma, CartaoVazio, NadaPendente } from "@/components/CartaoVazio";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ChartDot } from "@/components/ChartDot";
import { HideValuesButton } from "@/components/HideValuesButton";
import { VisaoGeralVazia } from "@/pages/VisaoGeralVazia";
import { formatMoney, type VisaoGeral } from "@/pages/visaogeral/useVisaoGeral";

/**
 * A Visão geral no tema claro: o desenho de sempre do painel.
 *
 * Só o desenho mora aqui; os dados chegam prontos de `useVisaoGeral`.
 */
export function VisaoGeralClara({ vg }: { vg: VisaoGeral }) {
  const {
    setLocation, period, setPeriod, dashboard, dashboardQuery,
    atrasadas, pendentes, recebimentosHoje, nadaPendente,
    accountCount, overviewQuery, companyQuery, lancamentos, primeiroAcesso, carregando,
    greeting, firstName, currentMonthLabel, mobileOpen, setMobileOpen,
    setNovoLancamento, podeEscrever,
    notificationsOpen, setNotificationsOpen, notificationsAnchor,
    months, chartScale, chartTicks, cashCurve,
  } = vg;

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 bg-[#EFF4F1] p-3 sm:p-5">
        <AppSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="relative flex flex-wrap items-center gap-3 xl:gap-4">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setMobileOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F8FAF9] active:scale-95 xl:hidden"
            >
              <SidebarMenuIcon size={18} />
            </button>
            <div className="mr-auto flex min-w-[190px] flex-col gap-0.5">
              <h1 className="text-xl font-bold tracking-[-0.02em] sm:text-2xl">{greeting}, {firstName}</h1>
              <p className="text-xs text-[#8A968D] sm:text-[13px]">
                {currentMonthLabel} · {primeiroAcesso ? "sua empresa ainda não tem movimentações" : "dados sincronizados"}
              </p>
            </div>

            <div className={`order-3 flex h-10 w-full items-center gap-1 rounded-[12px] bg-white p-1 sm:order-none sm:w-auto ${primeiroAcesso ? "pointer-events-none opacity-50" : ""}`}>
              {["Mês", "Trimestre", "Ano"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPeriod(item)}
                  className={`flex-1 rounded-[9px] px-3.5 py-[7px] text-[13px] transition active:scale-[0.98] sm:flex-none ${
                    period === item ? "bg-[#12B85C] font-bold text-white" : "text-[#4C6355] hover:bg-[#F1FBF6]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div ref={notificationsAnchor} className="relative">
              <button
                type="button"
                aria-label="Abrir notificações"
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F8FAF9] active:scale-95"
              >
                <NotificationIcon size={17} />
                {(dashboard?.overdue.count ?? 0) > 0 && <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-[#E5533D] ring-2 ring-white" />}
              </button>
              {notificationsOpen && (
                <div className="popover-enter absolute right-0 top-12 z-30 w-[300px] rounded-2xl bg-white p-3.5 shadow-[0_20px_50px_rgba(11,31,20,.18)]">
                  <div className="flex items-center gap-2 px-1 pb-2.5">
                    <strong className="text-[13px]">Notificações</strong>
                    {!nadaPendente && <span className="ml-auto rounded-md bg-[#FDECEA] px-2 py-0.5 text-[10px] font-bold text-[#8E1F16]">{atrasadas + pendentes} pendente{atrasadas + pendentes === 1 ? "" : "s"}</span>}
                  </div>
                  {/* Mesma regra do cartão "Precisa de você": zero não é notificação. */}
                  {nadaPendente && <NadaPendente texto="Avisamos aqui quando houver atraso ou lançamento a revisar." />}
                  {atrasadas > 0 && (
                    <button onClick={() => setLocation("/lancamentos")} className="flex w-full gap-3 rounded-xl bg-[#FDECEA] p-3 text-left transition hover:brightness-[.98]">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#E5533D]" />
                      <span><strong className="block text-xs text-[#8E1F16]">{atrasadas} conta{atrasadas === 1 ? "" : "s"} em atraso</strong><span className="mt-0.5 block text-[11px] text-[#8A4A45]">Total pendente de {formatMoney(dashboard?.overdue.amount ?? 0)}</span></span>
                    </button>
                  )}
                  {pendentes > 0 && (
                    <button onClick={() => setLocation("/lancamentos")} className="mt-1.5 flex w-full gap-3 rounded-xl p-3 text-left transition hover:bg-[#F1F4F2]">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#12B85C]" />
                      <span><strong className="block text-xs">Lançamentos pendentes</strong><span className="mt-0.5 block text-[11px] text-[#8A968D]">{pendentes} {pendentes === 1 ? "item aguarda" : "itens aguardam"} revisão</span></span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {podeEscrever && (
            <button
              type="button"
              onClick={() => setNovoLancamento(true)}
              className="flex h-10 items-center gap-2 rounded-[12px] bg-[#12B85C] px-3.5 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E] active:scale-[0.98] sm:px-4"
            >
              <PlusIcon size={15} />
              <span className="hidden sm:inline">Novo lançamento</span>
              <span className="sm:hidden">Novo</span>
            </button>
            )}

            <ProfileMenu />
          </header>

          {carregando && <VisaoGeralSkeleton />}

          {!carregando && primeiroAcesso && podeEscrever && (
            <VisaoGeralVazia
              empresa={companyQuery.data?.legalName || null}
              categorias={overviewQuery.data ? overviewQuery.data.categories.length : null}
              contas={accountCount}
              lancamentos={lancamentos}
              onCadastrarConta={() => setLocation("/organizacao?nova=conta")}
              onNovoLancamento={() => setNovoLancamento(true)}
              onImportar={() => setLocation("/lancamentos?importar=extrato")}
            />
          )}

          {!carregando && (!primeiroAcesso || !podeEscrever) && (<>
          <div className="grid gap-5 xl:grid-cols-[392px_minmax(0,1fr)]">
            <AuroraSurface className="min-h-[326px] rounded-[20px] p-5 sm:p-6">
              <div className="flex flex-1 flex-col gap-[18px]">
              <div className="relative z-10 flex items-center gap-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8FB39E]">Caixa disponível</span>
                {/* O olhinho mora aqui, e só aqui: ver HideValuesButton. */}
                <HideValuesButton tone="onDark" className="ml-auto" />
                <span className="rounded-lg bg-[#06120B]/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                  {accountCount} {accountCount === 1 ? "conta" : "contas"}
                </span>
              </div>
              <div className="relative z-10 flex flex-col gap-1.5">
                <strong className="text-[36px] leading-none tracking-[-0.03em] sm:text-[42px]">{formatMoney(dashboard?.cashAvailable ?? 0)}</strong>
                <span className={`text-[13px] font-semibold ${(dashboard?.current.balance ?? 0) >= 0 ? "text-[#7EE2A8]" : "text-[#F4A497]"}`}>{formatMoney(dashboard?.current.balance ?? 0)} no período</span>
              </div>
              <div className="relative z-10 min-h-[96px] flex-1" aria-label="Curva de evolução do saldo acumulado">
                {cashCurve ? (
                  <>
                  <svg
                    viewBox={`0 0 ${cashCurve.width} ${cashCurve.height}`}
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-full w-full overflow-visible"
                    role="img"
                    aria-label="Evolução do saldo no período selecionado"
                  >
                    <polygon points={cashCurve.areaPoints} fill="#12B85C" opacity="0.22" />
                    <polyline
                      points={cashCurve.linePoints}
                      fill="none"
                      stroke="#7EE2A8"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <ChartDot
                    x={cashCurve.lastPoint.x}
                    y={cashCurve.lastPoint.y}
                    width={cashCurve.width}
                    height={cashCurve.height}
                    size={9}
                    color="#FFFFFF"
                  />
                  </>
                ) : (
                  <span className="flex h-full items-center justify-center text-[11px] font-medium text-[#8FB39E]">Sem histórico de movimentações</span>
                )}
              </div>
              <div className="relative z-10 mt-auto grid grid-cols-2 gap-5 border-t border-[#1F3D2B] pt-4">
                <div><span className="block text-[11px] text-[#8FB39E]">Entradas no período</span><strong className="mt-0.5 block text-[17px]">{formatMoney(dashboard?.current.incoming ?? 0)}</strong></div>
                <div><span className="block text-[11px] text-[#8FB39E]">Saídas no período</span><strong className="mt-0.5 block text-[17px] text-[#F4A497]">{formatMoney(dashboard?.current.outgoing ?? 0)}</strong></div>
              </div>
              </div>
            </AuroraSurface>

            <div className="flex min-w-0 flex-col gap-5">
              <div className="grid gap-5 sm:grid-cols-3">
                <article className="card-hover flex flex-col gap-3 rounded-[20px] bg-white p-5">
                  <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#DFF6EA]"><ArrowUpIcon size={20} className="text-[#0A7A42]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">A receber</span></div>
                  <strong className="text-[26px] tracking-[-0.02em] text-[#0A7A42]">{formatMoney(dashboard?.pendingReceivable.amount ?? 0)}</strong>
                  <span className="text-xs text-[#8A968D]">{dashboard?.pendingReceivable.count ?? 0} título{dashboard?.pendingReceivable.count === 1 ? "" : "s"} · {dashboard?.dueToday.count ?? 0} vence{dashboard?.dueToday.count === 1 ? "" : "m"} hoje</span>
                </article>
                <article className="card-hover flex flex-col gap-3 rounded-[20px] bg-white p-5">
                  <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#FDECEA]"><ArrowDownIcon size={20} className="text-[#B3261E]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">A pagar</span></div>
                  <strong className="text-[26px] tracking-[-0.02em] text-[#B3261E]">{formatMoney(dashboard?.pendingPayable.amount ?? 0)}</strong>
                  <span className="text-xs font-semibold text-[#B3261E]">{dashboard?.overdue.count ?? 0} em atraso · {formatMoney(dashboard?.overdue.amount ?? 0)}</span>
                </article>
                <article className="card-hover flex flex-col gap-3 rounded-[20px] bg-white p-5">
                  <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#F1F4F2]"><ChartIcon size={20} className="text-[#28382E]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">Margem líquida</span></div>
                  <strong className="text-[26px] tracking-[-0.02em]">{(dashboard?.margin ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong>
                  <span className="text-xs font-semibold text-[#0A7A42]">Calculada sobre o período selecionado</span>
                </article>
              </div>

              <section className="rounded-[20px] bg-white p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-[15px] font-bold">Entradas e saídas</h2>
                  <div className="ml-auto flex gap-3.5 text-xs text-[#4C6355]">
                    <span className="flex items-center gap-1.5"><i className="h-[9px] w-[9px] rounded-[3px] bg-[#12B85C]" />Entradas</span>
                    <span className="flex items-center gap-1.5"><i className="h-[9px] w-[9px] rounded-[3px] bg-[#E5533D]" />Saídas</span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-[46px_minmax(0,1fr)] gap-3">
                  <div className="flex h-[150px] flex-col justify-between text-right text-[9.5px] font-medium leading-none text-[#8A968D] sm:text-[10.5px]">
                    {chartTicks.map((value, index) => <span key={index}>{formatMoney(value, true)}</span>)}
                  </div>
                  <div className="relative h-[150px]">
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
                      {Array.from({ length: 5 }).map((_, index) => <span key={index} className="block border-t border-dashed border-[#DFE6E1]" />)}
                    </div>
                    <div className="relative z-10 flex h-full items-end gap-2 sm:gap-4">
                      {months.map((month, index) => {
                        /*
                         * Nos meses das pontas o balão é ancorado pelo lado de
                         * dentro: centralizado, ele passaria da borda do cartão
                         * e sairia meio de fora da tela.
                         */
                        const ponta = index >= months.length - 2 ? "fim" : index <= 1 ? "inicio" : "meio";
                        const posicaoBalao = ponta === "fim" ? "right-0" : ponta === "inicio" ? "left-0" : "left-1/2 -translate-x-1/2";
                        const posicaoSeta = ponta === "fim" ? "right-3" : ponta === "inicio" ? "left-3" : "left-1/2 -translate-x-1/2";
                        return (
                        <div key={`${month.label}-${index}`} className="group relative flex h-full flex-1 items-end gap-[3px] sm:gap-1">
                          {/* O `title` do navegador demora quase um segundo e sai
                              fora do desenho da tela. Este balão aparece na hora,
                              e é o mesmo verde do resto do produto. */}
                          <span className={`pointer-events-none absolute bottom-full z-20 mb-2 whitespace-nowrap rounded-[10px] bg-[#12B85C] px-2.5 py-2 text-[11.5px] font-semibold text-white opacity-0 shadow-[0_8px_22px_rgba(11,31,20,.22)] transition-opacity duration-[90ms] group-hover:opacity-100 ${posicaoBalao}`}>
                            <span className="block text-[10px] font-bold uppercase tracking-[.08em] text-white/70">{month.label}</span>
                            <span className="mt-1 block">Entradas {formatMoney(month.incoming)}</span>
                            <span className="block">Saídas {formatMoney(month.outgoing)}</span>
                            <span className={`absolute top-full -mt-1 h-2 w-2 rotate-45 bg-[#12B85C] ${posicaoSeta}`} />
                          </span>
                          <span className="barra-do-grafico flex-1 rounded-t-[5px] bg-[#12B85C] transition-[filter] duration-200 group-hover:brightness-110" style={{ height: `${Math.max(month.incoming > 0 ? 3 : 0, (month.incoming / chartScale) * 100)}%`, animationDelay: `${index * 55}ms` }} />
                          <span className={`barra-do-grafico flex-1 rounded-t-[5px] transition-[filter] duration-200 group-hover:brightness-95 ${index === months.length - 1 ? "bg-[#E5533D]" : "bg-[#F4A497]"}`} style={{ height: `${Math.max(month.outgoing > 0 ? 3 : 0, (month.outgoing / chartScale) * 100)}%`, animationDelay: `${index * 55 + 28}ms` }} />
                        </div>
                        );
                      })}
                    </div>
                  </div>
                  <span aria-hidden="true" />
                  <div className="flex text-center text-[10px] text-[#8A968D] sm:text-[11.5px]">
                    {months.map((month, index) => <span key={`${month.label}-${index}`} className={`flex-1 ${index === months.length - 1 ? "font-semibold text-[#0B1F14]" : ""}`}>{month.label}</span>)}
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_392px]">
            {/*
              A seção é coluna flex porque ela ESTICA: na grade ela acompanha a
              altura da coluna da direita, e sem isso o bloco de vazio parava na
              altura mínima dele e deixava uma faixa branca embaixo. Com a
              coluna, o vazio ocupa o cartão inteiro e se centraliza nele — que
              é como a tela de primeiro acesso já desenhava.
            */}
            <section className="flex min-w-0 flex-col rounded-[20px] bg-white p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px] font-bold">Últimos lançamentos</h2>
                <button onClick={() => setLocation("/lancamentos")} className="ml-auto flex items-center gap-1 text-[12.5px] font-semibold text-[#0A7A42] hover:text-[#0B1F14]">
                  Ver extrato <ChevronRightIcon size={14} />
                </button>
              </div>
              <div className="mt-3.5 flex flex-1 flex-col gap-1.5">
                {(dashboard?.recent ?? []).map((transaction) => {
                  const isPositive = transaction.amount > 0;
                  const initials = transaction.description.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("");
                  return (
                    <button
                      key={transaction.id}
                      type="button"
                      onClick={() => setLocation("/lancamentos")}
                      className="group flex w-full items-center gap-3 rounded-[14px] bg-[#F8FAF9] px-3 py-2.5 text-left transition hover:bg-[#F1F4F2] active:scale-[0.995]"
                    >
                      <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] text-[13px] font-bold ${isPositive ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FDECEA] text-[#B3261E]"}`}>
                        {initials || "NV"}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <strong className="truncate text-[13px] font-semibold sm:text-[13.5px]">{transaction.description}</strong>
                        <span className="truncate text-[11px] text-[#8A968D] sm:text-[11.5px]">{transaction.category} · {new Date(`${transaction.transactionDate}T12:00:00`).toLocaleDateString("pt-BR")}</span>
                      </span>
                      <span className={`hidden rounded-md px-[9px] py-[3px] text-[11px] font-semibold sm:block ${transaction.status === "Pago" ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FFF5DD] text-[#B87500]"}`}>
                        {transaction.status}
                      </span>
                      <strong className={`w-[88px] shrink-0 text-right text-xs sm:w-[104px] sm:text-sm ${isPositive ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(transaction.amount)}</strong>
                    </button>
                  );
                })}
                {!dashboardQuery.isLoading && (dashboard?.recent.length ?? 0) === 0 && (
                  <CartaoVazio
                    icone={<MenuIcon size={20} />}
                    titulo="Nenhum lançamento ainda"
                    texto="Entradas e saídas aparecem aqui conforme forem registradas ou importadas do banco."
                    acoes={podeEscrever ? [
                      { rotulo: "Novo lançamento", onClick: () => setNovoLancamento(true), icone: <PlusIcon size={15} /> },
                      { rotulo: "Importar extrato", onClick: () => setLocation("/lancamentos?importar=extrato"), icone: <UploadIcon size={15} />, tom: "secundario" },
                    ] : []}
                  />
                )}
              </div>
            </section>

            <aside className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
              <section className="rounded-[20px] bg-white p-5">
                <h2 className="text-[15px] font-bold">Receita por canal</h2>
                <div className="mt-3.5 space-y-3">
                  {(dashboard?.revenueByCategory ?? []).map((channel) => (
                    <div key={channel.label}>
                      <div className="flex text-[12.5px]"><span>{channel.label}</span><strong className="ml-auto">{formatMoney(channel.amount)}</strong></div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded bg-[#EDF2EE]"><div className="h-full rounded bg-[#12B85C] transition-all duration-300" style={{ width: `${dashboard?.current.incoming ? (channel.amount / dashboard.current.incoming) * 100 : 0}%` }} /></div>
                    </div>
                  ))}
                  {!dashboardQuery.isLoading && (dashboard?.revenueByCategory.length ?? 0) === 0 && <BarrasFantasma texto="As categorias de receita aparecem aqui depois das primeiras entradas do mês." />}
                </div>
              </section>

              <section className="rounded-[20px] bg-white p-5">
                <h2 className="text-[15px] font-bold">Precisa de você</h2>
                <div className="mt-3 space-y-2">
                  {/*
                    Três linhas de zero não são uma lista de pendências: são o
                    aviso de que não há nenhuma, dito da forma mais cansativa
                    possível. Com tudo zerado o cartão diz isso em uma linha.
                  */}
                  {nadaPendente ? <NadaPendente /> : (<>
                  {atrasadas > 0 && <button onClick={() => setLocation("/lancamentos")} className="flex w-full items-center gap-3 rounded-[14px] bg-[#FDECEA] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold text-[#8E1F16]">{atrasadas} conta{atrasadas === 1 ? "" : "s"} em atraso</span><strong className="text-[13px] text-[#8E1F16]">{formatMoney(dashboard?.overdue.amount ?? 0)}</strong></button>}
                  {pendentes > 0 && <button onClick={() => setLocation("/lancamentos")} className="flex w-full items-center gap-3 rounded-[14px] bg-[#F1F4F2] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold">{pendentes} lançamento{pendentes === 1 ? "" : "s"} pendente{pendentes === 1 ? "" : "s"}</span><strong className="text-[12.5px] text-[#0A7A42]">Revisar</strong></button>}
                  {recebimentosHoje > 0 && <button onClick={() => setLocation("/lancamentos")} className="flex w-full items-center gap-3 rounded-[14px] bg-[#F1FBF6] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold text-[#0A7A42]">{recebimentosHoje} recebimento{recebimentosHoje === 1 ? "" : "s"} hoje</span><strong className="text-[13px] text-[#0A7A42]">{formatMoney(dashboard?.dueToday.amount ?? 0)}</strong></button>}
                  </>)}
                </div>
              </section>
            </aside>
          </div>
          </>)}
        </section>
      </div>

    </main>
  );
}
