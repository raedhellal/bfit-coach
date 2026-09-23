---
name: a-paint-probe-must-sample-where-the-channel-paints
description: Before believing a mutant's result, photograph it — and sample the scanline the channel actually paints on, or a real full bar reads as 4% and looks like a mutant that never fired
metadata:
  type: feedback
---

A CSS mutant must be **watched painting** before its suite result means anything, in
either direction. A green under an unseen mutant is worthless; so is a red.

**Why:** EV-216. `senior-qa` had already lost a run to a dud (a `var()` whose varying
stop sat in an ancestor's custom property — Chrome resolves `var()` **at the declaring
element**, so nothing painted and the green looked like a wide escape). I then hit the
mirror image: my probe sampled each week row's **vertical middle**, and a
`border-image-source` mutant paints in the **10 px border strip at the top of the row**.
It reported *blue 0.04 of the row width* — indistinguishable from "never fired". Five
scanlines on the same screenshot read **1.000 at y=1 and y=7 of 26**: a full bar beside
"2 / 4 sessions".

**How to apply:**
- Screenshot the element and **decode the PNG** (zlib inflate + unfilter is ~50 lines,
  no dependency), then report the painted fraction of the width. A byte diff of two
  screenshots cannot tell a bar from an antialiasing wobble and cannot report its width
  — and the width is the defect.
- **Sample several scanlines**, not one. `box-shadow: inset` and `mask-image` wash the
  whole box; `border-image` only paints the border strip; a `::before` may paint
  anywhere. Print `y=n/height` beside each number so a dud is visible as a dud.
- Run the **control on clean code first** — the honest bar gives ~0.90 of row width at
  100 %, so the mutant's number is read against that, not against zero.
- Prove the picture is **proportional**, not just present: the same mutant should read
  0.75 on a 3/4 week and 1.0 on the 2/4 current week. That is what makes it the shape
  the guard was written for rather than "some value on a property".
- Probe scripts must live **inside the worktree** — from the scratchpad, node will not
  resolve `@playwright/test` (see [[coach-portal-node-modules-and-spec-sync]]). Name it
  `.probe-*.mjs`, keep it untracked, delete it before the gate.

Related: [[a-paint-channel-list-is-data-not-three-reads]],
[[a-fixture-without-the-shape-cannot-guard-it]],
[[a-picture-with-no-text-is-unassertable]].
