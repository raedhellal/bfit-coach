---
name: probe-a-css-declaration-through-the-dom-not-an-html-attribute
description: A CSS probe written as style="…url(\"data:…\")…" in a page.setContent string is silently truncated by the inner quote — and a raw <svg> payload is then injected as markup, faking a paint
metadata:
  type: feedback
---

Build the declaration under test with `el.style.cssText`/`setProperty` inside `evaluate`, never by
interpolating it into a `style="…"` attribute in a `page.setContent` HTML string.

**Why:** ADR-0024 round 2 (2026-09-23). Any value containing `"` — every `url("data:…")` — ends the
HTML attribute early. Two different wrong answers came out of one artifact: with a **raw** `<svg>`
payload the remainder was parsed as markup and injected a real `<svg>` element, so the box differed
from the control and I reported `paints=YES` for a background that was never set, plus a bogus
`computed = url("")`; with a **percent-encoded** payload the declaration was merely truncated, so
`architect` reported the same case as *does not paint*. Rebuilt through the DOM it paints and
computed returns the full URL. `senior-qa`'s M-Q3 `url(` witness was right the whole time.

**How to apply:** this is the same class as the ancestor-`var()` dud and the border-image sampled at
the wrong height — the construction, not the browser, produced the result. When two agents disagree
about whether something paints, suspect the harness before the engine, and check whether the payload
could have entered the DOM as markup (`document.querySelectorAll("svg").length` is a one-line tell).
Related: [[normalisation-claim-falsified-by-prefixed-spellings]].
