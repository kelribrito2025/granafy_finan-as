---
version: alpha
name: Voltura
description: A dark crypto cockpit on a citrine field. Hairline-cut olive-charcoal panels orbit a single luminous acid-lime focal card.
colors:
  page: "#B8C44A"
  canvas: "#15191A"
  surface: "#1D2123"
  surface-recess: "#10141A"
  primary: "#D3F23F"
  primary-hi: "#DCF853"
  primary-lo: "#C8E72E"
  on-primary: "#14181A"
  on-surface: "#ECEFE8"
  on-surface-mute: "#7A8278"
  border: "#262B2C"
  border-strong: "#323839"
  focus: "#D3F23F"
  positive: "#8FE27A"
  negative: "#EC6A5E"
  cat-coral: "#E58940"
  cat-magenta: "#C84B86"
  cat-green: "#5AC36B"
  cat-blue: "#3A8FD9"
typography:
  display:
    family: "Space Grotesk"
    weights: [500, 600, 700]
    tracking: "-0.02em"
  body:
    family: "Inter"
    weights: [400, 500, 600]
    tracking: "0"
  mono:
    family: "JetBrains Mono"
    weights: [400, 500]
    tracking: "0"
  headline-lg:
    typography: "{typography.display}"
    size: "44px"
    lineHeight: 1
    weight: 600
  headline-md:
    typography: "{typography.display}"
    size: "28px"
    lineHeight: 1.05
    weight: 600
  headline-sm:
    typography: "{typography.display}"
    size: "22px"
    lineHeight: 1.2
    weight: 600
  numeral-xl:
    typography: "{typography.display}"
    size: "44px"
    lineHeight: 1
    weight: 600
  numeral-2xl:
    typography: "{typography.display}"
    size: "56px"
    lineHeight: 0.95
    weight: 600
  body-md:
    typography: "{typography.body}"
    size: "14px"
    lineHeight: 1.45
    weight: 400
  body-sm:
    typography: "{typography.body}"
    size: "13px"
    lineHeight: 1.45
    weight: 400
  label-sm:
    typography: "{typography.body}"
    size: "12px"
    lineHeight: 1.2
    weight: 500
    transform: uppercase
    tracking: "0.14em"
  mono-sm:
    typography: "{typography.mono}"
    size: "11px"
    lineHeight: 1.3
    weight: 500
rounded:
  none: "0px"
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "22px"
  2xl: "28px"
  full: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
  gutter: "20px"
  page: "clamp(16px, 2.4vw, 28px)"
  sidebar: "220px"
  container-max: "1320px"
elevation:
  flat: "none"
  card: "0 0 0 1px {colors.border}"
  card-hover: "0 0 0 1px {colors.border-strong}"
  recess: "inset 0 0 0 1px #1A1F20"
  focal-glow: "0 0 0 1px rgba(211,242,63,0.28), 0 12px 40px -12px rgba(211,242,63,0.45)"
components:
  shell:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.page}"
  sidebar:
    backgroundColor: "{colors.surface-recess}"
    width: "{spacing.sidebar}"
    padding: "20px 16px"
    borderRight: "1px solid {colors.border}"
  nav-item:
    typography: "{typography.body-sm}"
    textColor: "{colors.on-surface-mute}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  nav-item-active:
    textColor: "{colors.on-surface}"
    backgroundColor: "{colors.canvas}"
    accentBar: "{colors.primary}"
  card:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.xl}"
    padding: "24px"
  card-focal:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.xl}"
    padding: "24px"
    elevation: "{elevation.focal-glow}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.full}"
    height: "38px"
    padding: "0 20px"
    typography: "{typography.body-sm}"
    weight: 600
  button-primary-hover:
    backgroundColor: "{colors.primary-hi}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface}"
    border: "1px solid {colors.border-strong}"
    rounded: "{rounded.full}"
    height: "38px"
    padding: "0 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.on-surface-mute}"
    rounded: "{rounded.full}"
    height: "38px"
  input-field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-surface}"
    placeholderColor: "{colors.on-surface-mute}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  input-field-focus:
    border: "1px solid {colors.focus}"
    elevation: "0 0 0 3px rgba(211,242,63,0.18)"
  checkbox:
    size: "18px"
    rounded: "6px"
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.border-strong}"
  checkbox-checked:
    backgroundColor: "{colors.primary}"
    checkColor: "{colors.on-primary}"
    border: "1px solid {colors.primary-lo}"
  tabs-item:
    typography: "{typography.body-sm}"
    textColor: "{colors.on-surface-mute}"
    padding: "10px 0"
  tabs-active:
    textColor: "{colors.on-surface}"
    underlineColor: "{colors.primary}"
    underlineHeight: "2px"
  chip:
    backgroundColor: "rgba(236,239,232,0.06)"
    textColor: "{colors.on-surface}"
    border: "1px solid {colors.border}"
    rounded: "{rounded.full}"
    height: "24px"
    padding: "0 10px"
    typography: "{typography.label-sm}"
  chip-delta-up:
    backgroundColor: "{colors.positive}"
    textColor: "#0E1A0E"
  chip-delta-down:
    backgroundColor: "{colors.negative}"
    textColor: "#1C0908"
  distribution-bar:
    height: "10px"
    rounded: "{rounded.full}"
    segmentGap: "3px"
    backgroundColor: "{colors.canvas}"
icon:
  library: "Tabler Icons"
  style: "outline"
  strokeWidth: "1.5px"
  size: "18px"
---

## Overview

Voltura is a dark crypto cockpit that lives on a saturated citrine ground. The product feel is that of an industrial instrument cluster at night: muted, calm, dense with numbers, and punctuated by a single bright signal. The system should feel calm-but-electric — like a trading desk where every monitor is off except the one that matters.

The visual metaphor is an *inset display*: the bright olive-citrine page is the chassis, the deep Inkwell canvas is the screen recessed inside it, and the acid-lime focal card is the cursor — the one place the user's eye is supposed to land first. Everything else is engineered to read as supporting instrumentation.

What Voltura should feel like in use:

- A serious tool that respects the reader's attention. No decorative chrome, no shadow theater, no busy gradients.
- Editorial rather than promotional. Large balances, quiet labels, and disciplined whitespace make the system feel like a financial publication.
- Confident with one accent. The acid-lime is rationed; it never appears twice on the same screen as a feature surface.

What Voltura should *not* feel like:

- A neon casino. The citrine and acid lime are loud only because the rest of the system is dark and quiet.
- A generic SaaS dashboard. Voltura uses hairline cuts, not drop shadows; oversized numerals, not flat KPI tiles; pill-rounded geometry, not rectangular blocks.
- A consumer crypto app. There are no emoji, no playful illustrations, and no soft pastel surfaces.

Essential traits to preserve across every screen: the dark-canvas-on-citrine-field contrast, exactly one Luminous Focal Card per layout, the multi-color categorical distribution bar, the pill-radius geometry, and the brand mark colored in acid lime on dark surfaces.

## Colors

The palette is split into three strict roles. Mixing roles will collapse the system.

**Structural** — the bones of every layout:

- `page` `#B8C44A` Citrine Field — outer chassis surrounding the app shell.
- `canvas` `#15191A` Inkwell — primary app canvas inside the shell.
- `surface` `#1D2123` Slate Panel — every card body inside the canvas.
- `surface-recess` `#10141A` — sidebar and any recessed wells inside the canvas.
- `border` `#262B2C` Hairline — the 1px cut that separates everything; `border-strong` `#323839` for hover and form fields.

**Accent** — used as a single signal:

- `primary` `#D3F23F` Acid Lime is the system's only chromatic interface accent. It is reserved for: the Luminous Focal Card fill, the primary button, the active sidebar bar, the active tab underline, the focus ring, the chart line, and inside the checkbox checked state. Never use Acid Lime as a card background outside the focal card, never use it as body text on Inkwell (it vibrates), and never use it inside the categorical distribution bar.

**Type** — pure neutral hierarchy on dark surfaces:

- `on-surface` `#ECEFE8` Bone for primary text and all display numerals.
- `on-surface-mute` `#7A8278` Moss Mute for labels, captions, secondary metadata.
- On the Acid Lime focal card, invert: text becomes `on-primary` `#14181A` (Inkwell), and muted text becomes `rgba(20,24,26,0.62)`.

**Categorical (data only)** — Coral `#E58940`, Magenta `#C84B86`, Green `#5AC36B`, Blue `#3A8FD9`. These colors *only* appear inside the distribution bar, crypto-asset avatars, and chart legends. They are forbidden as UI chrome (buttons, borders, links, backgrounds) so they keep their meaning as data categories.

**Signal** — `positive` `#8FE27A` and `negative` `#EC6A5E` only appear on delta chips and the transaction direction icon. Do not use them in body text.

Accessibility: Bone on Inkwell reaches ~14:1, Bone on Slate ~12:1, Moss Mute on Slate ~5.1:1. The acid-lime focal card uses Inkwell text for ~12:1 contrast. Never rely on color alone for transaction direction; pair with an arrow icon.

## Typography

Three families, each with one job:

- **Space Grotesk** — display headlines, KPI numerals, card titles, balances. Use 500–700 weights, tight negative tracking (-0.02em to -0.035em), tabular numerals. This is the font that carries the drama: oversized balances against small labels.
- **Inter** — every piece of UI text: nav, buttons, table cells, body copy. Use 400 for body, 500 for nav and buttons, 600 for emphasis. No tracking adjustments.
- **JetBrains Mono** — ticker symbols (`BTC`, `USDT`), wallet addresses, transaction IDs, axis labels. Always set in uppercase for tickers with subtle letter-spacing (0.04–0.08em).

Scale rhythm: the drama comes from balance-to-label ratio, not from heading scale. A KPI block looks like a 12px uppercase Moss label sitting on top of a 36–56px Bone numeral. Headlines themselves stay modest at 22–28px so the numerals can dominate.

Rules:

- Numerals are always tabular (`font-variant-numeric: tabular-nums`).
- Tickers and addresses are always mono, uppercase, with mute color.
- Card titles never exceed 18px; the numeral inside the card carries the visual weight.
- Do not increase font sizes to add hierarchy; use the dedicated `numeral-xl` / `numeral-2xl` levels.

## Layout

The system is built around an inset-shell pattern.

**Page shell.** The body is painted Citrine across the entire viewport with `page` gutters of `clamp(16px, 2.4vw, 28px)`. Inside this gutter floats one rounded-rectangle dark shell (`2xl` radius) that fills the remaining viewport. The shell holds a fixed-width sidebar on the left and a flexible main column on the right. This inset-on-citrine geometry is non-negotiable — it is the system's signature container.

**Sidebar.** 220px wide, painted `surface-recess` (slightly darker than the canvas) with a 1px Hairline right border. Top section: brand mark + search field. Middle section: a vertical list of nav items, each row 36–40px tall, icon-left, label-right. Active row uses Inkwell background and a 3px acid-lime bar pinned to the left edge. The sidebar collapses to a hidden drawer below 760px.

**Top bar.** Inside the main column, a 64–72px tall row with the page title on the left and a horizontal cluster of utility controls on the right (currency selector, add button, notifications, profile). Bottom-bordered with a single Hairline.

**Content grid.** Below the top bar, content is a 20px-gap vertical stack of horizontal grids:

- **Hero row** — a 1-column-narrow + 1-column-wide split. The narrow column (≈320–360px) holds the *Luminous Focal Card* with the primary KPI and primary CTA. The wide column holds the secondary card cluster (portfolio summary, distribution bar).
- **Split row** — a ~1.6 : 1 ratio between the chart card and the transactions card. The chart card stretches; the transactions card stays compact.
- **Optional 3- or 4-up grids** for KPI strips, but only when there is no focal card competing for attention.

**Hero card pattern.** Hero blocks always pair *one* Luminous Focal Card on the left with multiple dark cards on the right inside a single shared card body. The focal card is intentionally narrower than the supporting block so it reads as a *signal*, not a panel.

**Section pattern: dashboard.** Top bar → hero row (focal + summary) → split row (chart + transactions) → optional table or feed. Each card is self-contained, with its own internal padding (24px) and its own controls in the card head.

**Section pattern: detail / form.** Same shell, but the content area becomes a single column with `container-max: 1320px` and 24–32px gaps. Forms use 12–16px vertical rhythm. Inputs are full-width inside their card. Buttons align to the right of the card footer.

**Section pattern: empty state.** Place the empty state inside a regular dark card. No illustrations — instead, a Moss-Mute Tabler icon at 28px, a single Bone headline, one line of caption, and a single primary button. Centered vertically inside the card; left-aligned for text below 480px width.

**Responsive behavior.** Below 1100px, the hero and split rows collapse to single columns, with the focal card moving to the top so it stays the first thing seen. Below 760px, the sidebar disappears entirely and the top bar gets a menu button.

**Whitespace discipline.** 24px is the default card padding. 20px is the default gap between cards. Never go below 16px for either; never go above 32px without changing the section pattern. Voltura is dense, but the density comes from disciplined rhythm, not from cramming.

## Elevation & Depth

Voltura is *flat-first*. Almost nothing casts a shadow.

- **Cards** have no shadow. They are separated from the canvas by a single 1px Hairline border. The card body is one step lighter than the canvas (`surface` over `canvas`), so the seam reads as a precision cut rather than a soft drop.
- **Sidebar** uses the opposite trick: it is one step *darker* than the canvas (`surface-recess`), so the canvas itself reads as the elevated surface. The Hairline border on the right preserves the cut.
- **Luminous Focal Card** is the only element allowed to glow. It uses a soft inner radial gradient (Acid Hi → Acid → Acid Lo) plus a faint outer halo (`0 12px 40px -12px rgba(211,242,63,0.45)`). The halo is not a shadow — it is implied light.
- **Inputs** have no shadow at rest. On focus, they gain a 3px acid-lime ring at 18% alpha plus a solid acid-lime border.
- **Buttons** are flat. The primary button gets a *very* soft acid glow underneath (`0 8px 28px -10px rgba(211,242,63,0.55)`) only because it inherits energy from the focal card; without it, the button would read as a sticker.

There are no inner shadows, no bevels, no glassmorphism, and no blurred surfaces.

## Shapes

The shape language is pill-soft rectangles with one circle exception.

- **Outer shell**: 28px radius (`2xl`).
- **Cards**: 18–22px radius (`lg`–`xl`).
- **Inner stat blocks and nav items**: 10–14px radius (`sm`–`md`).
- **Buttons, chips, distribution bars**: fully rounded `pill` (999px).
- **Crypto asset avatars**: perfect circles.
- **Checkbox**: 6px radius soft-square (`xs`).

There are no sharp 0px corners, no decorative ornament (no dots, no plus marks, no corner brackets), and no diagonal lines. Borders are exclusively 1px Hairline. Distribution-bar segments have a 3px gap between them so the categorical colors read as discrete units.

## Components

The component grammar must extend through every screen. Each component below has one job; do not invent variants beyond what is listed.

**Luminous Focal Card.** The single brightest panel in any layout. Acid-lime radial-gradient fill, dark Inkwell text, optional dark-on-acid chip for sub-metadata, and an inverted button (`button--on-acid`) for the primary CTA. There is *exactly one* per layout. Use it for the headline KPI (account balance, hero stat) or the primary CTA destination. If a layout has no obvious primary metric, do not invent one — leave the focal card out and add it back when the data justifies it.

**Card.** Slate Panel body, 1px Hairline border, 18–22px radius, 24px padding. Card head: title left, action chips/buttons right. Card body: free-form. Card titles use the small headline level (15–18px), never the display level — the contents (numerals, charts, lists) are meant to be louder than the title.

**Sidebar nav item.** Icon (Tabler, 18px) + label (Inter 500, 13px). 10–12px horizontal padding, 36–40px tall, 10px radius. Resting state is Moss Mute on transparent. Hover lifts text to Bone and adds a 4% Bone background. Active state pins a 3px acid-lime bar to the left edge and uses Inkwell background.

**Buttons.**

- `primary` — acid lime fill, Inkwell text, pill radius, soft acid halo. The only place acid lime appears as a fill outside the focal card.
- `secondary` — transparent fill, Bone text, 1px Hairline-strong border, pill radius.
- `ghost` — transparent fill, Moss text, no border. Hover lifts text to Bone.
- `on-acid` — used *only* inside the focal card. Inkwell fill, acid text. Inverted to keep contrast.
- All buttons share three heights: 30 / 38 / 46px (`sm` / `md` / `lg`).

**Chips.** Pill-shaped, 24px tall, 10px horizontal padding. Default is transparent with Hairline border and Bone text. Variants: `mono` (JetBrains Mono ticker chip), `delta-up` (Positive green fill, Inkwell text), `delta-down` (Negative coral fill, Inkwell text), `on-acid` (dark-glass chip used only inside the focal card).

**Inputs.** Inkwell fill, 1px Hairline border, 14px radius, 40px height, 16px horizontal padding, Bone text, Moss placeholder. Focus replaces the border with acid lime and adds a 3px 18%-alpha acid ring. The pill variant uses 999px radius and is reserved for compact filter bars.

**Checkbox.** 18px soft-square with 6px radius. Resting: Inkwell fill, Hairline-strong border. Checked: acid-lime fill with an Inkwell tick. Never use a circular radio for boolean choices — circles are reserved for asset avatars.

**Tabs.** Underline tabs only. Bone text on active, 2px acid-lime underline with pill caps. Pill-tabs are a second variant used for compact filter rows (BTC / ETH / All): a Hairline-bordered pill container holding small Inkwell-filled pills for the active state.

**Distribution bar.** A 10px-tall pill row holding the categorical segments (Coral / Magenta / Green / Blue) with 3px gaps. Segment widths reflect data; never use the bar as decoration. Each segment is paired with a legend item (small dot + label + tabular percentage).

**Asset row.** A horizontal row of `avatar + name/ticker + amount/value`. The avatar uses the categorical color matched to the asset. The name uses Bone 14px 600; the ticker uses Mono 11px uppercase Moss; the amount uses display 13px tabular numerals; the value uses 12px Moss below.

**KPI block.** Three vertical pieces: a 12px uppercase Moss label, a 36–56px display numeral, and an optional sub-line with a delta chip. Always left-aligned, never centered. Inside the focal card the same anatomy applies but with Inkwell text and dark-on-acid chip.

**Chart panel.** Single 2px acid-lime polyline on a transparent area gradient (acid → transparent). Dashed Hairline grid lines, mono axis labels in Moss. One floating tooltip card on hover, never gridded crosshairs.

**Transactions list.** Compact rows with a circular direction icon (green for receive, coral for send), title + Mono hash, right-aligned amount + timestamp. Date headings are 12px uppercase Moss labels. Rows are separated by 1px Hairline.

**Icons.** Tabler Icons exclusively ([tabler.io/icons](https://tabler.io/icons), MIT). Outline style at 1.5px stroke width. Default size 18px in nav and buttons, 22px in card heads, 14px in chips. Icon color always inherits `currentColor`. Use Tabler official SVG markup directly; never invent custom paths and never mix with a second icon library.

**Brand mark.** The Voltura node mark (`logo.svg` embedded in `metadata.json`) renders at 24–28px in the sidebar header (acid lime on Inkwell) and larger on covers (Inkwell on acid). Always paired with the wordmark *Voltura* in Space Grotesk Semibold with tight tracking.

## Do's and Don'ts

**Do**

- Reserve exactly one Luminous Focal Card per layout. It is the system's signature.
- Cut surfaces apart with 1px Hairline borders — that is how Voltura signals elevation.
- Let oversized tabular numerals carry the hierarchy. Keep headings modest.
- Keep the citrine page visible as a border around the dark shell — the inset shape is the brand.
- Use the categorical palette only inside distribution bars, asset avatars, and chart legends.
- Pair every direction signal (send/receive, positive/negative) with both color and an icon.
- Use JetBrains Mono for any string that represents an identifier (ticker, hash, address).

**Don't**

- Don't use Acid Lime as a card background anywhere outside the focal card, and don't use it in body text.
- Don't introduce drop shadows on cards — the system depends on hairline cuts. The acid focal glow is the only allowed elevation.
- Don't center hero sections or KPI blocks; the system is editorial and left-aligned.
- Don't apply categorical colors (Coral / Magenta / Green / Blue) to buttons, links, borders, or UI chrome — they are reserved for data.
- Don't add ornament, decorative dividers, gradients on dark cards, or glass blur.
- Don't mix icon libraries. Tabler only, outline only, 1.5px stroke only.
- Don't increase heading sizes to create emphasis; promote to a numeral level instead.
- Don't fill empty space with extra accent surfaces — Voltura's calm depends on darkness around the signal.

## Neste projeto (GranaFy)

- **Onde está**: o CSS do sistema fica em `client/src/styles/voltura.css`. É o `system.css` do pacote com uma mudança: tudo tem escopo em `.voltura` (os tokens saem de `:root` para `.voltura`, e `body`, `::selection` e `:focus-visible` ficam presos ao mesmo escopo), para o Vite poder juntá-lo ao CSS do app sem o fundo citrino vazar para as outras telas. O pacote original (licença, `metadata.json`, `html/preview.html`, `html/cover.html`, `images/`) está em `design/voltura/`, só para consulta.
- **Onde é usado**: somente na Visão geral, nos dois temas. `client/src/pages/visaogeral/VisaoGeralPainel.tsx` é o desenho, e é um só: importa o CSS, envolve a página em `.voltura` e recebe os dados de `useVisaoGeral`, no mesmo diretório. `Home.tsx` só junta os dois e mantém o modal de lançamento fora do escopo.
- **Os dois temas**: as cores do pacote viraram a paleta do tema escuro e vivem em `.dark .voltura`; `.voltura` carrega a paleta clara equivalente, com os mesmos papéis (canvas atrás, cartões à frente, barra lateral atrás, um único cartão aceso). Trocar de tema troca token, nunca composição. Como o lima não lê sobre branco, texto, traço do gráfico e anel de foco usam `--v-acid-ink` (o mesmo lima escurecido); o lima cheio continua sendo preenchimento nos dois temas. As demais telas, a barra lateral (`AppSidebar`), o menu de perfil e os modais continuam com o visual anterior do app (Geist, Tailwind 4, verde `#12B85C`). Estender a outra tela é decisão do dono do produto.
- **Como aplicar**: classes `v-*` do sistema para componentes (cartão, cartão focal, KPI, botões, chips, pill-tabs, lista, barra de distribuição) e classes `vg-*` (no fim do mesmo arquivo) só para a composição da página. Tailwind pode ser usado para layout (`flex`, `grid`, `gap`), nunca para cor ou tipografia dentro do escopo — cor sai de token, senão um dos dois temas quebra.
- **O que foi adaptado do pacote**: botões usam o raio de 12px do produto, e não a pílula do Voltura, porque o mesmo botão existe nas outras telas; a pílula fica em chip, barra de distribuição, pontos e avatares.
- **Fontes**: o `voltura.css` importa Space Grotesk, Inter e JetBrains Mono do Google Fonts. Não duplicar o `@import`.
- **Ícones**: Tabler, contorno, traço 1.5, desenhados inline (`TABLER` em `Home.tsx`). Não misturar com os ícones Iconly do resto do app dentro do escopo.
- **Regras que a Visão geral segue**: um único cartão focal (o caixa disponível); cores categóricas (coral, magenta, verde, azul) apenas na barra "Receita por canal"; sinais positivo/negativo só em chips e no ícone de direção; sem sombras nos cartões (só o brilho do focal).
- **Modal "Novo lançamento"**: é aberto pela Visão geral e segue o sistema. O componente (`TransactionModal`) é compartilhado com outras telas e mantém a marcação dele; o que o veste é um embrulho `.voltura` em volta e um bloco de sobreposições preso ao `.drawer-enter`, no fim do `voltura.css`. Aberto de outra tela, ele continua com o visual do app.
- **Conflitos conhecidos**: o pacote não trazia versão clara — a daqui foi derivada e é nossa; ao trocar o pacote por uma versão nova, ela precisa ser refeita. O tema escuro do app (`client/src/index.css`) repinta as classes de cor do produto com `!important`; as sobreposições dos componentes compartilhados (barra lateral, menu do perfil) precisam de `!important` e de especificidade maior que `.dark .bg-white` para valer. Componentes compartilhados que aparecem dentro do escopo (`HideValuesButton`, `ProfileMenu`, `AppSidebar`, `VisaoGeralVazia`, `VisaoGeralSkeleton`) mantêm a marcação do app e recebem só cor e forma; o modal de lançamento fica fora do escopo de propósito.
