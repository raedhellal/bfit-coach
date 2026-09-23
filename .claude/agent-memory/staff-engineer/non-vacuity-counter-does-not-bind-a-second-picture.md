---
name: non-vacuity-counter-does-not-bind-a-second-picture
description: A minimum-bars counter proves *some* picture was measured, not that *every* picture was; an unmeasurable second picture beside honest bars passes
metadata:
  type: feedback
---

A geometric DOM guard ("find text-free painted leaves, compare their box to the printed
figures") plus a fixture-derived `minimumBars` counter binds two of three cases and not
the third:

- bar moved onto a text-bearing element, nothing else drawn → **red**, via the counter
  (`bars = 0 < minimum`).
- bar replaced by a single gradient-painted leaf → **red**, because the leaf measures
  100 % of its parent against a printed ratio that is not 100 %.
- honest bars kept for the rows that satisfy the counter, and **one extra row painted by
  a mechanism the measurement cannot see** (CSS gradient on the label span, canvas,
  background-image) → **green**. The counter is satisfied by the honest bars, and the
  dishonest picture is invisible.

**Why:** verified on EV-210b (`b-fit-coach`, 2026-09-23). A one-line change painting the
current week's `done / plannedSoFar` as a `linear-gradient` behind its own figures
rendered `linear-gradient(..., var(--blue-500) Infinity%, ...)` next to "1 / 3 sessions"
and passed all 256 Playwright tests including the new property file.

**How to apply:** when a guard measures *boxes*, the reach claim must be "every picture
drawn by a mechanism with a layout box", never "every picture". Ask for the counter to be
paired with a bound on the *shape* of painting (e.g. no `background-image` /
`linear-gradient` on any descendant of the row) before accepting a totality sentence.
Related: [[bar-and-its-own-label-disagree]], [[defect-pattern-bound-that-does-not-bound]].
