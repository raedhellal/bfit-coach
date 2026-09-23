---
name: project_ev210b-gate
description: EV-210b (P-ADH in the DOM) gate 2026-09-23 — PASS at a2f483d; which limbs of qa/coach-adherence-property.spec.ts now have mutant witnesses, and the one AC4 counter that does not scope to the EV-208 regression
metadata:
  type: project
---

**EV-210b gated PASS at `a2f483d`, 2026-09-23** (test + fixture only; `AdherenceSeries.tsx`
and `copy.ts` byte-identical to main). Default gate 256 passed (main baseline 245, +11),
roster config 18 passed, tsc/lint/`next build` all exit 0. `b-fit-coach` has no
`.github/workflows`, so `playwright.config.ts` is CI: `--list | grep -c
coach-adherence-property` = 11, i.e. the file runs with no flag.

**Why:** the fourth look at a test-only row was asked for because C3 shipped nine guards
that read as protection and did not bind. The value of this note is the mutant ledger, so
the next reader does not re-run limbs that already have a witness.

**How to apply — limbs of `qa/coach-adherence-property.spec.ts` with a red witness (mine,
on top of the implementer's and reviewer's):**
- a bar drawn on a row that prints no figures → red naming the week (`drawBar =
  !week.partial`).
- a bar on a `planned = 0` week ("0 / 0 sessions", the EV-187a shape) → red.
- `transform: scaleX(-2)` → red as "WIDER than its track" (boxes include transforms).
- the bar moved onto the text-bearing label → red via the `minimumBars` counter.
- both empty-state sentences shipped at once → red on "a plan EXISTED".

**Unreached / not constructible:** the `Number.isFinite(drawnPercent)` limb (the file says
so itself) and the *negative bar* limb — `getBoundingClientRect().width` is never negative
and the parent-width guard yields 0, so I could not construct one.

**The one soft spot, and it is in the AC not the code.** AC4 (iii)'s counter counts *any*
line in `qa/` that forbids the sentence, not the EV-208 regression specifically. Witnessed:
remove all three forbidding lines from `qa/coach-monitoring.spec.ts` and add one unrelated
`qa/` line carrying the sentence next to `.not` → the limb is **green**. Plain deletion
still goes red (M9). Related: [[coach-portal-merge-is-release]].

**The accepted C4 gap is described accurately.** Reproduced the reviewer's "B3" (one line
adding a `linear-gradient` behind the current week's figures): Ines renders
`linear-gradient(90deg, var(--blue-500) Infinity%, transparent 0)`, Lina a 100 % painted
gradient beside "2 / 4 sessions", whole suite **256 passed**. Both straightforward gradient
refactors the file claims go red do go red.
