---
name: overview-768-band-ev345-facts
description: EV-345 (2026-10-08) — how the client overview got one screen shorter at 768–1279 px without touching < 768 / ≥ 1280; the probe recipe (CSS injection on a next-start build), the numbers, and the traps (inline margins, shared .ov-card, :scope locators)
metadata:
  type: project
---

Branch `feat/ev345-overview-768` off coach `6caecb8`. Lina 768×1024 `next start`:
FR 2,851 → 2,152, EN 2,818 → 2,099 (J.3 needs ≤ 2,198). `next dev` reads the SAME heights
for this page, so the default suite can hold J.3.

**The layout (all inside `@media (768px..1279px)`, globals.css « EV-345 »):**
`.layout-split.ov-split` two columns; `.ov-pair` wraps trend + goal + series, is
`display: contents` OUTSIDE the band (byte-identical full-page PNGs at 390/767/1280/1440,
FR+EN, base vs branch; viewport height 900, fresh context per width, networkidle,
fonts.ready — at 1024 tall the fixed footer/sidebar make them differ) and a grid `"trend series" "goal goal"` inside it. The goal stays
full width: its three `flex: 1 1 180px` fields stack in half a row, which makes it taller. A lone alert
card (`:only-child`) puts `.alert-card-action` beside word+title (`grid-row: 1 / span 2` —
those two rows always render; a span over optional rows adds empty gap rows).

**Probe recipe that saved rebuilds:** build base once, `next start`, then measure layout
variants by `page.addStyleTag()` before reading `scrollHeight` (v1 2,260 → v3 2,176 FR);
only then write the source and rebuild to confirm. Per-block heights from `main#main`'s
children + one level into grids.

**Traps:**
- The blocks carry INLINE `marginBottom: 18` (Card, MonitoringBlock section) — a media
  query cannot beat them; the grid uses them as its row spacing (no row-gap) instead.
- `.ov-card` / `.ov-section` are shared with `/invited/[userId]`: scope spacing rules with
  `.page:has(.ov-pair)`.
- A Playwright locator chained off `main` does not match `"main > div"` — use `:scope > …`.
- WebKit probe outside the suite cannot sign in on http://localhost (cookie not kept) —
  use the suite's WebKit setup, not a bare `webkit.launch()` script.
- The J-R6 guard (EN ≤ 2,900) was deleted (J-R6 allows it once J.3 is a plain test) and
  replaced by an EN ≤ 2,198 test; the J.3 test moved into a nested `French` describe, title
  and assertion unchanged.

Headroom is ~46 px FR on Lina; fixture dates move with the clock (month names differ in
width), so a tight new block on the overview can trip J.3. See [[ev342-kjm-portal-facts]],
[[client-overview-redesign-facts]], [[layout-assertions-need-occlusion]].
