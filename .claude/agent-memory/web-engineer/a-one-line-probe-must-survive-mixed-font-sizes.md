---
name: a-one-line-probe-must-survive-mixed-font-sizes
description: "number and unit on one line" read by Range rect tops/centres fails falsely when the unit is a smaller font; use vertical overlap, and an NBSP alone already holds the pair
metadata:
  type: feedback
---

A 20 px number and a 13 px unit share a BASELINE, not a top or a centre. The first EV-337g1 probe
(`Set(rects.map(top + height/2))`) reported every tile "on 2 lines" at 1440 on a correct page. Rule: two pieces
are on one line when their client rects overlap vertically.

The NBSP between number and unit keeps them together even under `white-space: normal`: the mutant "drop
nowrap" only produced a CLIP (`scrollWidth`), never a split. To see the one-line check go red the mutant had to
replace the NBSP with an ordinary space too.

**Why:** a probe that is red on a correct page gets loosened until it checks nothing; a mutant that cannot
express the defect "proves" a check that was never exercised.

**How to apply:** mixed-size text: overlap test, not tops. When mutating a "stays together" guarantee, remove
EVERY mechanism that holds it (nowrap AND the NBSP) and confirm the check reports the split, not some other
failure. See [[a-fixture-without-the-shape-cannot-guard-it]], [[photograph-the-mutant-on-the-right-scanline]].
