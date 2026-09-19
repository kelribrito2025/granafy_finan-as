import { AppSidebar } from "@/components/AppSidebar";
import { ChartDot } from "@/components/ChartDot";
import { HideValuesButton } from "@/components/HideValuesButton";
import { VisaoGeralSkeleton } from "@/components/PageSkeleton";
import { ProfileMenu } from "@/components/ProfileMenu";
import { VisaoGeralVazia } from "@/pages/VisaoGeralVazia";
import { formatMoney, type VisaoGeral } from "@/pages/visaogeral/useVisaoGeral";
import type { CSSProperties } from "react";
// O design system Voltura, com escopo nesta tela (ver DESIGN.md na raiz).
import "@/styles/voltura.css";

/*
 * Ícones Tabler (contorno, traço 1.5), que é a família que o DESIGN.md pede.
 * São só os desta tela; os caminhos vêm do SVG oficial do Tabler.
 */
const TABLER = {
  menu: ["M4 6l16 0", "M4 12l16 0", "M4 18l16 0"],
  sino: ["M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6", "M9 17v1a3 3 0 0 0 6 0v-1"],
  mais: ["M12 5l0 14", "M5 12l14 0"],
  entrada: ["M17 7l-10 10", "M8 7l9 0l0 9"],
  saida: ["M17 7l-10 10", "M16 17l-9 0l0 -9"],
  seta: ["M5 12l14 0", "M13 18l6 -6", "M13 6l6 6"],
  ok: ["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M9 12l2 2l4 -4"],
  upload: ["M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2", "M7 9l5 -5l5 5", "M12 4l0 12"],
  recibo: ["M9 7h6", "M9 11h6", "M9 15h4", "M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2"],
};

function Tabler({ d, size = 18, sw = 1.5, className, style }: { d: string[]; size?: number; sw?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={{ flexShrink: 0, ...style }}>
      {d.map(caminho => <path key={caminho} d={caminho} />)}
    </svg>
  );
}

/**
 * O painel da Visão geral, desenhado com o design system Voltura.
 *
 * Um desenho só para os dois temas: as cores vêm dos tokens do `voltura.css`,
 * que trocam de valor quando o app entra no escuro. Só o desenho mora aqui;
 * os dados chegam prontos de `useVisaoGeral`.
 */
export function VisaoGeralPainel({ vg }: { vg: VisaoGeral }) {
  const {
    setLocation, period, setPeriod, dashboard, dashboardQuery,
    atrasadas, pendentes, recebimentosHoje, nadaPendente,
    accountCount, overviewQuery, companyQuery, lancamentos, primeiroAcesso, carregando,
    greeting, firstName, currentMonthLabel, mobileOpen, setMobileOpen,
    setNovoLancamento, podeEscrever,
    notificationsOpen, setNotificationsOpen, notificationsAnchor,
    months, chartScale, chartTicks, cashCurve, canais,
  } = vg;

  return (
    <main className="voltura vg-pagina">
      <div className="flex w-full">
        <AppSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

        <section className="vg-casca flex min-w-0 flex-1 flex-col">
          <header className="v-topbar vg-topo">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Abrir menu"
                onClick={() => setMobileOpen(true)}
                className="v-btn v-btn--secondary v-btn--icon xl:hidden"
              >
                <Tabler d={TABLER.menu} />
              </button>
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="v-h1 truncate">{greeting}, {firstName}</h1>
                <span className="v-caption truncate">
                  {currentMonthLabel} · {primeiroAcesso ? "sua empresa ainda não tem movimentações" : "dados sincronizados"}
                </span>
              </div>
            </div>

            <div className="vg-topo__acoes">
              <div className={`v-pill-tabs ${primeiroAcesso ? "pointer-events-none opacity-50" : ""}`} role="tablist" aria-label="Período">
                {["Mês", "Trimestre", "Ano"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={period === item}
                    onClick={() => setPeriod(item)}
                    className={`v-pill-tabs__item ${period === item ? "v-pill-tabs__item--active" : ""}`}
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
                  className="v-btn v-btn--secondary v-btn--icon relative"
                >
                  <Tabler d={TABLER.sino} />
                  {(dashboard?.overdue.count ?? 0) > 0 && <span className="vg-ponto" />}
                </button>
                {notificationsOpen && (
                  <div className="popover-enter v-card v-card--compact vg-notificacoes">
                    <div className="v-card__head">
                      <strong className="v-card__title">Notificações</strong>
                      {!nadaPendente && <span className="v-chip v-chip--delta-down">{atrasadas + pendentes} pendente{atrasadas + pendentes === 1 ? "" : "s"}</span>}
                    </div>
                    {/* Mesma regra do cartão "Precisa de você": zero não é notificação. */}
                    {nadaPendente && <span className="v-caption">Avisamos aqui quando houver atraso ou lançamento a revisar.</span>}
                    <div className="v-list">
                      {atrasadas > 0 && (
                        <button type="button" onClick={() => setLocation("/lancamentos")} className="v-list__row vg-linha">
                          <span className="v-list__icon v-list__icon--neg"><Tabler d={TABLER.saida} size={16} /></span>
                          <span className="v-asset-row__meta"><span className="v-list__title">{atrasadas} conta{atrasadas === 1 ? "" : "s"} em atraso</span><span className="v-caption">Total pendente de {formatMoney(dashboard?.overdue.amount ?? 0)}</span></span>
                          <Tabler d={TABLER.seta} size={16} className="v-muted" />
                        </button>
                      )}
                      {pendentes > 0 && (
                        <button type="button" onClick={() => setLocation("/lancamentos")} className="v-list__row vg-linha">
                          <span className="v-list__icon"><Tabler d={TABLER.recibo} size={16} /></span>
                          <span className="v-asset-row__meta"><span className="v-list__title">Lançamentos pendentes</span><span className="v-caption">{pendentes} {pendentes === 1 ? "item aguarda" : "itens aguardam"} revisão</span></span>
                          <Tabler d={TABLER.seta} size={16} className="v-muted" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {podeEscrever && (
                <button type="button" onClick={() => setNovoLancamento(true)} className="v-btn v-btn--primary">
                  <Tabler d={TABLER.mais} size={16} sw={2} />
                  <span className="hidden sm:inline">Novo lançamento</span>
                  <span className="sm:hidden">Novo</span>
                </button>
              )}

              <ProfileMenu />
            </div>
          </header>

          <div className="v-content">
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
          {/* ---- Linha de destaque: o cartão luminoso e o resumo do período ---- */}
          <div className="v-grid v-grid--hero">
            {/*
              O único cartão aceso da tela: o caixa disponível. Tudo o que o
              sistema pede para o "focal card" — o número principal, o
              subdado em chip escuro e a curva — mora aqui.
            */}
            <article className="v-card v-card--focal vg-focal">
              <div className="v-card__head">
                <span className="v-kpi__label">Caixa disponível</span>
                <div className="v-card__actions">
                  {/* O olhinho mora aqui, e só aqui: ver HideValuesButton. */}
                  <HideValuesButton tone="onDark" className="vg-olho" />
                  <span className="v-chip v-chip--on-acid">{accountCount} {accountCount === 1 ? "conta" : "contas"}</span>
                </div>
              </div>
              <div className="v-kpi">
                <strong className="v-numeral-2xl vg-focal__valor">{formatMoney(dashboard?.cashAvailable ?? 0)}</strong>
                <span className="v-kpi__sub">
                  <Tabler d={(dashboard?.current.balance ?? 0) >= 0 ? TABLER.entrada : TABLER.saida} size={14} sw={2} />
                  {formatMoney(dashboard?.current.balance ?? 0)} no período
                </span>
              </div>
              <div className="vg-focal__curva" aria-label="Curva de evolução do saldo acumulado">
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
                  <span className="flex h-full items-center text-[12px] font-medium" style={{ color: "var(--v-on-acid-mute)" }}>Sem histórico de movimentações</span>
                )}
              </div>
              <div className="v-kpi-grid vg-focal__pe">
                <div className="v-kpi"><span className="v-kpi__label">Entradas</span><strong className="v-numeral vg-focal__mini">{formatMoney(dashboard?.current.incoming ?? 0)}</strong></div>
                <div className="v-kpi"><span className="v-kpi__label">Saídas</span><strong className="v-numeral vg-focal__mini">{formatMoney(dashboard?.current.outgoing ?? 0)}</strong></div>
              </div>
            </article>

            <article className="v-card">
              <header className="v-card__head">
                <div>
                  <h2 className="v-card__title">Resumo do período</h2>
                  <p className="v-caption" style={{ margin: "4px 0 0" }}>{period} · {currentMonthLabel}</p>
                </div>
                <div className="v-card__actions">
                  <button type="button" onClick={() => setLocation("/a-pagar-e-receber")} className="v-btn v-btn--secondary v-btn--sm">
                    A pagar e receber
                    <Tabler d={TABLER.seta} size={14} />
                  </button>
                </div>
              </header>

              <div className="vg-kpis">
                <div className="v-kpi">
                  <span className="v-kpi__label">A receber</span>
                  <strong className="v-kpi__value">{formatMoney(dashboard?.pendingReceivable.amount ?? 0)}</strong>
                  <span className="v-kpi__sub">{dashboard?.pendingReceivable.count ?? 0} título{dashboard?.pendingReceivable.count === 1 ? "" : "s"} · {dashboard?.dueToday.count ?? 0} vence{dashboard?.dueToday.count === 1 ? "" : "m"} hoje</span>
                </div>
                <div className="v-kpi">
                  <span className="v-kpi__label">A pagar</span>
                  <strong className="v-kpi__value">{formatMoney(dashboard?.pendingPayable.amount ?? 0)}</strong>
                  <span className="v-kpi__sub">
                    {atrasadas > 0
                      ? <><span className="v-chip v-chip--delta-down"><Tabler d={TABLER.saida} size={12} sw={2.2} />{atrasadas} em atraso</span>{formatMoney(dashboard?.overdue.amount ?? 0)}</>
                      : "Nada em atraso"}
                  </span>
                </div>
                <div className="v-kpi">
                  <span className="v-kpi__label">Margem líquida</span>
                  <strong className="v-kpi__value">{(dashboard?.margin ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong>
                  <span className="v-kpi__sub">Sobre o período selecionado</span>
                </div>
              </div>

              <hr className="v-divider" />

              <div className="vg-dist">
                <div>
                  <div className="v-card__title" style={{ fontSize: "var(--v-fs-14)" }}>Receita por canal</div>
                  <div className="v-caption" style={{ marginTop: 4 }}>Participação de cada categoria nas entradas</div>
                </div>
                {canais.length > 0 ? (
                  <div className="v-dist">
                    <div className="v-dist__bar" role="img" aria-label={canais.map(c => `${c.label} ${c.share.toFixed(0)}%`).join(", ")}>
                      {canais.map(c => <span key={c.label} className="v-dist__seg" style={{ flex: `0 0 ${c.share}%`, background: c.cor }} />)}
                    </div>
                    <div className="v-dist__legend">
                      {canais.map(c => (
                        <div key={c.label} className="v-dist__item">
                          <span className="v-dist__dot" style={{ background: c.cor }} />
                          <span className="v-dist__nome">{c.label}</span>
                          <span className="v-dist__value">{formatMoney(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <span className="v-caption">As categorias de receita aparecem aqui depois das primeiras entradas do período.</span>
                )}
              </div>
            </article>
          </div>

          {/* ---- Linha dividida: gráfico à esquerda, lançamentos e pendências à direita ---- */}
          <div className="v-grid v-grid--split">
            <article className="v-card">
              <header className="v-card__head">
                <div>
                  <h2 className="v-card__title">Entradas e saídas</h2>
                  <p className="v-caption" style={{ margin: "4px 0 0" }}>Por mês · {period.toLowerCase()} atual</p>
                </div>
                <div className="v-card__actions vg-legenda">
                  <span className="v-dist__item"><span className="v-dist__dot" style={{ background: "var(--v-acid)" }} />Entradas</span>
                  <span className="v-dist__item"><span className="v-dist__dot" style={{ background: "#F4A497" }} />Saídas</span>
                </div>
              </header>
              <div className="vg-grafico">
                <div className="vg-grafico__eixo">
                  {chartTicks.map((value, index) => <span key={index}>{formatMoney(value, true)}</span>)}
                </div>
                <div className="relative h-full min-h-[170px]">
                  <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, index) => <span key={index} className="vg-grafico__linha" />)}
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
                      return (
                      <div key={`${month.label}-${index}`} className="group relative flex h-full flex-1 items-end gap-[3px] sm:gap-1">
                        <span className={`v-chart__tip pointer-events-none absolute bottom-full z-20 mb-2 whitespace-nowrap opacity-0 transition-opacity duration-[90ms] group-hover:opacity-100 ${posicaoBalao}`} style={{ position: "absolute" }}>
                          <span className="v-label">{month.label}</span>
                          <span className="v-chart__tip-val">{formatMoney(month.incoming)}</span>
                          <span className="v-caption">Saídas {formatMoney(month.outgoing)}</span>
                        </span>
                        <span className="barra-do-grafico flex-1 rounded-t-[4px] transition-[filter] duration-200 group-hover:brightness-110" style={{ background: "var(--v-acid)", height: `${Math.max(month.incoming > 0 ? 3 : 0, (month.incoming / chartScale) * 100)}%`, animationDelay: `${index * 55}ms` }} />
                        <span className="barra-do-grafico flex-1 rounded-t-[4px] transition-[filter] duration-200 group-hover:brightness-125" style={{ background: index === months.length - 1 ? "#E5533D" : "#F4A497", height: `${Math.max(month.outgoing > 0 ? 3 : 0, (month.outgoing / chartScale) * 100)}%`, animationDelay: `${index * 55 + 28}ms` }} />
                      </div>
                      );
                    })}
                  </div>
                </div>
                <span aria-hidden="true" />
                <div className="vg-grafico__meses">
                  {months.map((month, index) => <span key={`${month.label}-${index}`} className={index === months.length - 1 ? "vg-grafico__mes--atual" : ""}>{month.label}</span>)}
                </div>
              </div>
            </article>

            <div className="flex min-w-0 flex-col gap-5">
              <article className="v-card vg-lancamentos">
                <header className="v-card__head">
                  <div>
                    <h2 className="v-card__title">Últimos lançamentos</h2>
                    <p className="v-caption" style={{ margin: "4px 0 0" }}>Movimentações mais recentes</p>
                  </div>
                  <button type="button" onClick={() => setLocation("/lancamentos")} className="v-btn v-btn--ghost v-btn--sm">
                    Ver extrato <Tabler d={TABLER.seta} size={14} />
                  </button>
                </header>
                <div className="v-list">
                  {(dashboard?.recent ?? []).map((transaction) => {
                    const isPositive = transaction.amount > 0;
                    return (
                      <button
                        key={transaction.id}
                        type="button"
                        onClick={() => setLocation("/lancamentos")}
                        className="v-list__row vg-linha"
                      >
                        <span className={`v-list__icon ${isPositive ? "" : "v-list__icon--neg"}`}>
                          <Tabler d={isPositive ? TABLER.entrada : TABLER.saida} size={16} sw={1.8} />
                        </span>
                        <span className="v-asset-row__meta">
                          <span className="v-list__title truncate">{transaction.description}</span>
                          <span className="v-list__sub truncate">{transaction.category} · {new Date(`${transaction.transactionDate}T12:00:00`).toLocaleDateString("pt-BR")}</span>
                        </span>
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="v-list__amt">{formatMoney(transaction.amount)}</span>
                          <span className="v-list__time">{transaction.status}</span>
                        </span>
                      </button>
                    );
                  })}
                  {!dashboardQuery.isLoading && (dashboard?.recent.length ?? 0) === 0 && (
                    <div className="vg-vazio">
                      <Tabler d={TABLER.recibo} size={28} className="v-muted" />
                      <strong className="v-h3">Nenhum lançamento ainda</strong>
                      <span className="v-caption">Entradas e saídas aparecem aqui conforme forem registradas ou importadas do banco.</span>
                      {podeEscrever && (
                        <div className="v-row" style={{ marginTop: 8 }}>
                          <button type="button" onClick={() => setNovoLancamento(true)} className="v-btn v-btn--primary v-btn--sm"><Tabler d={TABLER.mais} size={14} sw={2} />Novo lançamento</button>
                          <button type="button" onClick={() => setLocation("/lancamentos?importar=extrato")} className="v-btn v-btn--secondary v-btn--sm"><Tabler d={TABLER.upload} size={14} />Importar extrato</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>

              <article className="v-card v-card--compact">
                <header className="v-card__head" style={{ alignItems: "center" }}>
                  <h2 className="v-card__title">Precisa de você</h2>
                  {!nadaPendente && <span className="v-chip">{atrasadas + pendentes + recebimentosHoje}</span>}
                </header>
                {/*
                  Três linhas de zero não são uma lista de pendências: são o
                  aviso de que não há nenhuma. Com tudo zerado o cartão diz
                  isso em uma linha.
                */}
                {nadaPendente ? (
                  <span className="v-caption flex items-center gap-2"><Tabler d={TABLER.ok} size={16} style={{ color: "var(--v-pos)" }} />Atrasos, conciliações e recebimentos do dia aparecem aqui.</span>
                ) : (
                  <div className="v-list">
                    {atrasadas > 0 && <button type="button" onClick={() => setLocation("/lancamentos")} className="v-list__row vg-linha"><span className="v-list__icon v-list__icon--neg"><Tabler d={TABLER.saida} size={16} /></span><span className="v-list__title">{atrasadas} conta{atrasadas === 1 ? "" : "s"} em atraso</span><span className="v-chip v-chip--delta-down">{formatMoney(dashboard?.overdue.amount ?? 0)}</span></button>}
                    {pendentes > 0 && <button type="button" onClick={() => setLocation("/lancamentos")} className="v-list__row vg-linha"><span className="v-list__icon" style={{ background: "var(--v-fill)", color: "var(--v-text)" }}><Tabler d={TABLER.recibo} size={16} /></span><span className="v-list__title">{pendentes} lançamento{pendentes === 1 ? "" : "s"} pendente{pendentes === 1 ? "" : "s"}</span><span className="v-chip">Revisar</span></button>}
                    {recebimentosHoje > 0 && <button type="button" onClick={() => setLocation("/lancamentos")} className="v-list__row vg-linha"><span className="v-list__icon"><Tabler d={TABLER.entrada} size={16} /></span><span className="v-list__title">{recebimentosHoje} recebimento{recebimentosHoje === 1 ? "" : "s"} hoje</span><span className="v-chip v-chip--delta-up">{formatMoney(dashboard?.dueToday.amount ?? 0)}</span></button>}
                  </div>
                )}
              </article>
            </div>
          </div>
          </>)}
          </div>
        </section>
      </div>

    </main>
  );
}
