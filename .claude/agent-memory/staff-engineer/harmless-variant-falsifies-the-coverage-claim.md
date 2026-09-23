---
name: harmless-variant-falsifies-the-coverage-claim
description: Run the *harmless* variant of a mutant too — it is what falsifies an over-broad "this guard catches X" sentence
metadata:
  type: feedback
---

When a file claims "✓ this guard catches a renderer that did X", run **both** the harmful
and the harmless variant of X. The harmless one usually stays green, and that is what
shows the ✓ sentence is wider than the guard.

**Why:** EV-210b claimed a `plannedSoFar`-denominator renderer is caught "every day of the
week". Verified 2026-09-23: swapping the denominator *while keeping "draw no bar on the
partial week"* is **green** (for a finished week `plannedSoFar === planned`, so nothing
differs); only the variant that also draws the current week goes red. The guard's reach
coincides exactly with the *harmful* subset — which is the correct outcome and the wrong
sentence.

**How to apply:** the accurate form is "caught **when it draws the row where the two
denominators differ**". Under this project's rule (a totality sentence is only written
after a mutant of that exact shape ran red), demand the narrowing rather than the extra
assertion — the coverage is already right.
