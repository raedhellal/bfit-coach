---
name: decision-reviewer-extension-does-not-block
description: A hazard found in review that the row's own AC does not name is a follow-up row, not a rejection — ruled on EV-210b/EV-214, 2026-09-23
metadata:
  type: project
---

**A hazard a reviewer constructs that the row's own AC does not name is a FOLLOW-UP ROW, not a
rejection.** Ruled 2026-09-23: `staff-engineer` built a working bypass of EV-210b's guard (a CSS
gradient painted behind the figures, whole suite green at 256 passed). It was carded as **EV-214
(C4)**; EV-210b was **not** blocked and shipped to `To Verify`.

**Why:** EV-210b's AC3 scopes the check to *a fill read as a percentage attribute or inline width*.
The bypass is neither. The implementer went **past** its AC to geometric measurement and wrote the
remaining residue into the test file rather than claiming it away. Blocking a 0.5-day,
zero-production-code row on a hazard its own AC does not name is **tuning the gate to the reviewer's
extension** — the mirror of the failure EV-210 exists to prevent, and the same shape as
[[feedback-amending-a-red-ac]] pointed the other way.

**How to apply:** when a reviewer's finding lands, first ask *does the row's AC name this?* If no, it
is a new row, and the reviewer's construction becomes that row's **AC2 witness**. Two things make the
follow-up actionable and must be carried onto it: the **bounds** (which nearby variants already go
red, so the row does not re-solve solved cases) and the **rejected scope with its reason** — on
EV-214 I rejected `<canvas>`/`<img>` because nobody has constructed either, and **banning a thing
with no witness is the same defect as permitting one**. Do not let a follow-up row silently widen.
