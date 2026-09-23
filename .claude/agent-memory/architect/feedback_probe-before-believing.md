---
name: feedback-probe-before-believing
description: On this project, confirm a construction actually does the harmful thing (rendered observation) before believing red OR green, and state explicitly what you could not establish.
metadata:
  type: feedback
---

Every constructed check must be **probed**: confirm by rendered/observed evidence that the mutant
actually paints (or actually fails to) before accepting either result. And every design writeup
names, in its own section, **what could not be established** — *"I could not construct one"* is the
preferred third answer.

**Why:** CLAUDE.md's no-witness rule runs in both directions, and this codebase has a history of
falsified totality sentences (six on one guard file, by four people). `senior-qa` produced a dud
here by putting a varying stop in an ancestor's custom property — Chrome resolves `var()` in a
custom property at the **declaring** element, so nothing painted and the suite went green: a dud
that looked like a wider escape.

**How to apply:** for DOM/paint work, byte-compare an element screenshot against a paint-free
control — that is cheap and is a real rendered observation. For any ADR, keep an explicit
"What I could not establish" section listing how many constructions were tried, since N
constructions is never a proof of impossibility.

## The construction, not the engine, produces the result — three times in one sprint

**Never write a CSS declaration into a `style="…"` attribute inside a `page.setContent` HTML
string.** An inner `"` ends the attribute. With a raw `<svg>` data-URL payload the remainder parses
as markup and **injects a real element**, so the box differs from the control and the probe reads
`paints=YES` for a background that was never set, with a truncated computed value. With a
percent-encoded or base64 payload there is nothing to inject and the same broken attribute reads
`paints=no`. **One bug, two opposite wrong answers, both nearly shipped as facts in an ADR.**

**Build the declaration through the DOM instead** — `el.style.cssText = …` inside `evaluate` — so no
HTML quoting can touch it. **Tells:** `document.querySelectorAll("svg").length` (must be `0`);
a computed value that looks truncated; `el.style.length`.

**Why:** clause 7 caught three wrong answers in one sprint, all of them harness artefacts rather
than engine behaviour — `senior-qa`'s ancestor-`var()` dud (Chrome resolves `var()` in a custom
property at the **declaring** element), the EV-216 implementer's `border-image` sampling geometry (a
screenshot clipped to the element's own box misses paint **outside** it, e.g. `-webkit-box-reflect`),
and this attribute truncation.

**How to apply:** before reporting any paint result, ask *which part of my harness could produce
this reading without the engine doing anything?* Clip geometry, attribute quoting and
`var()` resolution scope are the three that have actually bitten. A screenshot-vs-control diff is
necessary, not sufficient — it proves *something* changed, not that **your declaration** changed it.
