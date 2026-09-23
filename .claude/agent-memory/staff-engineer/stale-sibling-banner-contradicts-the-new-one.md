---
name: stale-sibling-banner-contradicts-the-new-one
description: "A row whose deliverable is a corrected disclosure must also update the ADJACENT banner that enumerates the same thing — EV-216 left a 'it READS four channels' list 140 lines above its new 12-channel one"
metadata:
  type: feedback
---

When a story's deliverable is *prose accuracy* (a banner that states the predicate, a
single-source list), grep the whole file for the OLD enumeration before approving. The new
block being right does not make the file right, and a reader going top to bottom hits the
stale one first.

**Why:** EV-216 (2026-09-23) rewrote the EV-214/215 section banner and its `✗ box-shadow`
bullet, but left `qa/coach-adherence-property.spec.ts:616-627` saying the limb "**READS**,
once, at the default viewport, **four channels**" and naming three `getComputedStyle(el)
.backgroundImage` reads that no longer exist in the file. The file now reads 12 computed
channels via `getPropertyValue` plus two inline denylists. That is AC3's own "exactly one
place" clause failing inside the row that shipped it, and a falsifiable capability sentence
of the kind CLAUDE.md forbids.

**How to apply:** for any disclosure/banner story, run `grep -n` for each property or
mechanism name in the whole file and read every hit, not just the diff hunks. A comment the
diff did not touch is still a claim the merge ships.
Related: [[defect-pattern-cited-seam-does-not-exist]], [[javadoc-describes-the-rejected-version]].
