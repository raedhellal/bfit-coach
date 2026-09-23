---
name: finding-cssom-invalid-declarations
description: Measured in Chromium 153 — no CSSOM channel sees a parser-discarded declaration, but computed background-image is NOT spelling-normalised across function spellings. Basis for ADR 0024.
metadata:
  type: project
---

Probed by rendered observation (screenshots byte-compared against a paint-free control),
2026-09-23, Chromium 153.0.8010.12, standalone Playwright `setContent` — no server, no ports.

**A directly-declared invalid declaration is invisible to every CSSOM channel.** For
`background-image: linear-gradient(90deg, blue Infinity%, transparent 0%)` (does not paint):
`el.style.backgroundImage` `""`, `cssText` `""`, `el.style.length` `0`,
`el.attributeStyleMap.size` `0`, `computedStyleMap().get(...)` `none`,
`getComputedStyle(...).backgroundImage` `none`, `CSSStyleValue.parse` throws, `CSS.supports` false,
and a **stylesheet** rule serialises as `#sel { }`. Only `getAttribute("style")` retains it.

**🔴 Computed values are NOT normalised across function spellings.** This falsified my own round-1
claim. Painting, computed value = author's spelling verbatim: `-webkit-linear-gradient(left, …)`,
`-webkit-gradient(linear, left top, right top, from(blue), to(transparent))`. Blink canonicalises
*inside* a function, not *across* function spellings. (`url("data:…")` computes as the **full URL**
and **paints** — an earlier `url("")` reading here was a harness bug, see
[[feedback-probe-before-believing]].) What IS normalised:
`linear-gradi\65 nt`, `color-mix()`, `light-dark()`, `image-set`/`-webkit-image-set`, `1x→1dppx`,
comment-`;` re-serialisation, accented custom-property names.

**Therefore: a computed read is unevadable only while it inspects NO value text.** A computed clause
spelled `/gradient\(/` is walked past by `-webkit-gradient(linear, …)`. Test property *presence*
(`!== "none"`), never the value string.

**Custom-property form** is visible post-parse (`getComputedStyle(el).getPropertyValue("--p")`
returns the token stream, and computed styles enumerate custom properties) — but ident escapes
survive there unresolved and `:root` custom properties inherit onto every element, so it is still
text matching with a false-positive surface.

**Geometry, 200px `overflow:hidden` track:** `width:150%` → 150.0; `width:Infinity%` → dropped, span
falls to `auto` = 100.0 (inline text still matches `/Infinity/i`); **`width:calc(1 / 0 * 100%)` is
VALID in Blink** → computed `calc(infinity * 1%)`, drawn 16777216.0, matches no text pattern.

**Also:** `getComputedStyle().backgroundImage` reports a `-50%` stop that renders nothing — the
computed read is *"what survived the parser"*, not *"what is visible"*.
Ratios: `Infinity%`/`NaN%` no paint; `50%`/`100%`/`150%` paint.

**Unresolved, not negative:** `-webkit-box-reflect` (a reflection paints below the element's own
box, so a clipped screenshot is a sampling dud); `-webkit-cross-fade` reproduces for staff-engineer
only in the `linear-gradient` two-argument form, not the `url()` form — not reproduced by me.

**How to apply:** cite these before anyone proposes "just read the parsed side", "just parse the
attribute", or writes a computed clause that greps the value. See
[[decision-adherence-paint-guard-post-parse]].
