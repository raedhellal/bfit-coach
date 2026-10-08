---
name: a-first-viewport-ac-is-about-the-bottom
description: EV-344.1 STOP (2026-10-08) — an "inside the first viewport" AC needs the element's BOTTOM above the sticky bar; the exercise row is 319 px at 1024, so arithmetic on its top was wrong from the start
metadata:
  type: feedback
---

Before sizing or prototyping a "X is on the first screen" layout row, measure **X's own
height** and do the floor arithmetic: `(top of the first thing that must precede X) + (every
≥ 44 px control that must stay visible between them) + height(X)` vs the sticky bar's top.

**Why:** EV-342f F.1 / EV-344. `programme-first.spec.ts` defines "inside the first viewport"
as the WHOLE box between y 0 and `.action-bar`'s top. Staff, the PO ruling and the EV-344
card all reasoned about the first exercise row's TOP ("≈675–690, under the bar at 700").
But the row (`[role=group]` per exercise in `RoutineDocumentEditor`) is **319 px at
1024 px** (its six prescription fields wrap to two lines, 138 px; notes 64; Move/Replace/
Remove 44) and **245 px at 1180**. The plan-name field, which must precede it, ends at
y 419. So 419 + 319 = 738 > 700 with NOTHING between them. The probe (fold the settings card
+ tighten the day header, `c736eb9` on `feat/ev344-programme-first-screen`, not merged)
moved the row's top 1041 → 779 and still missed by 304–398 px in all four cases → STOP.

**How to apply:**
- Any future reshape of F.1 must change one of: what sits ABOVE the plan name (375 px of
  back link, client header, tabs, h2, profile line, plan card), the exercise row's own
  height at 1024, or the AC (e.g. row's name line / top). The two EV-344 changes alone
  cannot pass, by arithmetic.
- The probe harness is a throwaway spec importing `./fixture-test` that appends a table to
  a file (`PROBE_OUT`); never commit it (it has no assertions).
- Stack at 1024×800 on main `6caecb8` (Lina): h2 216 · profile line 256→314 · plan card
  328→478 (field 375→419) · settings card 494→784 · « Jours d'entraînement » 800 · row 1041.

See [[programme-frame-337f1-facts]], [[day-accordions-337f2-facts]], [[layout-assertions-need-occlusion]].
