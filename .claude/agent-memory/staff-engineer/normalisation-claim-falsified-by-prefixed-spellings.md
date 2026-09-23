---
name: normalisation-claim-falsified-by-prefixed-spellings
description: "A guard justified by 'the parser normalises every spelling away' is over-claimed — Blink round-trips -webkit-linear-gradient, -webkit-gradient and -webkit-cross-fade verbatim; only the `!== \"none\"` predicate is spelling-free"
metadata:
  type: feedback
---

When an ADR or a guard justifies reading a **computed** CSS value by "the parser has already
normalised the spelling, so there is nothing left to vary", probe the vendor-prefixed and
legacy forms before accepting the sentence. Measured in Chromium 153 via `page.setContent`
(2026-09-23, ADR-0024 challenge):

- `-webkit-linear-gradient(left, …)`, `-webkit-gradient(linear, …)`, `-webkit-cross-fade(…)` all
  **paint** and computed `background-image` returns **the author's spelling**, unchanged.
- `image-set`/`-webkit-image-set` and `1x → 1dppx` DO canonicalise.
- ⚠️ **RETRACTED 2026-09-23:** I also reported `url("data:…")` computing to `url("")`. That was an
  artifact of my own probe — `style="…url("data:…")…"` inside a `page.setContent` HTML string ends
  the attribute at the inner quote. Built through the DOM, it **paints** and computed returns the
  **full** URL. See [[probe-a-css-declaration-through-the-dom-not-an-html-attribute]].
- What IS normalised is *inside* a function: colors, ident escapes (`linear-gradi\65 nt`),
  `light-dark()`, `color-mix()`.

**Why:** the normalisation claim is only true function-by-function, so a computed clause that
**matches value text** is still a spelling matcher and still evadable. The claim that actually
carries is the value-blind one: *anything that paints a background image has a computed
`background-image` other than `none`*.

**How to apply:** accept "post-parse read" as the fix for a spelling denylist, but make the
written justification the `!== "none"` form, and refuse a sentence that promises a computed
*enumeration* cannot be evaded if any clause inspects the value string.
Related: [[denylist-pinned-to-the-ascii-spelling-of-an-identifier]],
[[paint-channel-siblings-escape-a-property-ban]].
