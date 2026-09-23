---
name: content-and-first-letter-are-paint-channels
description: "Two constructed, rendered escapes of EV-216's PAINT_CHANNELS: `content: linear-gradient(…)` on ::before, and ::first-letter carrying background-image — both paint a proportional bar and both leave the 12-entry table green"
metadata:
  type: feedback
---

A paint-channel enumeration over `(property, box)` has two holes that are not "a fourth
property" in the abstract — I constructed both against `40dc530` and photographed them:

- **`content` is a paint channel, not a box-generating one.** `li::before { content:
  linear-gradient(90deg, blue var(--r), transparent var(--r)); display:block; grid-column:
  1/-1; height:10px }`, with `--r` set inline per row from `done / plannedSoFar`. Measured:
  blue **1.000** across y=297..306 beside *"21 Sept 2026 | 2 / 4 sessions"*, 0.750 / 0.500 on
  the finished weeks — mechanism 2 of EV-210's table, restored — and `background-image` reads
  `none` on the element, `::before` and `::after`. Guard result: **16 passed, exit 0**.
- **`::first-letter` is a fourth box.** A rule on the date `span` (made `display:block`) with
  `background-image` + a percentage-scaled `padding-right` paints a band on every row; the
  guard is **16 passed, exit 0**. It IS reachable: `getComputedStyle(span, "::first-letter")
  .getPropertyValue("background-image")` returns the gradient, so one table entry closes it.

**Duds, recorded so nobody re-runs them:** `::marker` generates **no box at all** when the row
is `display: grid` — even a coloured `\2588` glyph in `content` paints nothing, so a
`::marker{background-image}` witness taken in a generic `page.setContent` harness does not
transfer to this surface. `-webkit-box-reflect` **does** paint (blue at y=17..26 when the row
box ends at y=12 — a clipped screenshot reads it as `paints=no`), but it only mirrors existing
content, and the current week draws no bar to mirror, so I could not construct an
overstatement with it.

**Why:** the line that holds is witnessed → table entry, unwitnessed → disclosure. It is the
same standard that made `box-shadow` a row rather than a paragraph, and it bounds the table
instead of growing it on speculation.

**How to apply:** when reviewing any `(property, pseudo)` paint enumeration, run `content` on
the pseudos and `::first-letter` before approving the banner — and build every mutant inside
the **surface's own DOM**, never a synthetic page, because layout (`display:grid` here)
decides whether the box exists.
**A "does not paint" number is only as big as the box under test.** EV-216 r2 measured
`box-shadow` on `::first-letter` at 0.040 of row width (control 0.049) and declared the cell
empty. With `padding-right: 100vw` on that box — so "does not paint" cannot mean "the box is
one glyph wide" — the same declaration reads **1.000 on every scanline** beside "2 / 4
sessions", proportional across weeks (0.894 on 3/4, 0.596 on 2/4, 0.000 on 0/4), guard **16
passed, exit 0**. `border-image-source` there genuinely does not paint (0.073 vs control
0.074) and `mask-image` is dropped (computes `none` when declared) — both re-measured and
confirmed. Third instance of the probe-geometry error class in one file.

Related: [[list-ratchet-binds-length-not-reads]], [[non-vacuity-counter-does-not-bind-a-second-picture]],
[[normalisation-claim-falsified-by-prefixed-spellings]].
