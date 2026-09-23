---
name: decision-ev210-ac4-source-grep
description: EV-210 AC4 ruling 2026-09-23 - banned sentence forbidden in expressions, permitted in comments and forbidding lines; the counter is anti-vacuity, not anti-substitution
metadata:
  type: project
---

**EV-210 AC4's last limb, ruled 2026-09-23 in the implementer's favour.** The banned BUG-205 sentence
*"No sessions in the last 8 weeks"* is forbidden in every **expression** in `src/` and `qa/`;
**permitted in comments** (the record of what was removed and why) and **on `qa/` lines that assert
its absence** — plus a counter that at least one such assertion still exists.

**Why:** the literal AC ("absent from `src/` and `qa/`") was red against merged, correct code and its
letter required deleting the javadoc at `AdherenceSeries.tsx` / `copy.ts` and the three EV-208
assertions in `qa/coach-monitoring.spec.ts` that forbid the sentence — i.e. removing the guard
against the bug the AC is about. The shipped rule is stronger: the literal one is satisfied by an empty
repository, this one is not — **plain deletion with no substitute runs red** (mutant M9; carve-out
probed both directions).

🔴 **Corrected 2026-09-23 by `senior-qa` (MQ9b):** the counter accepts **any** forbidding line
anywhere in `qa/`, so it guards **vacuity**, not **substitution** — substituting the three occurrences
and planting one unrelated forbidding line ran **green**. **Ruled: counter stays repo-wide, prose
corrected**, because scoping it to one filename would go red on a legitimate move of that regression.
Residue recorded, not closed. See [[feedback-never-assert-an-unprobed-consequence]].

**How to apply:** if a future row proposes "grep the repo for a banned string", write it as *banned in
expressions, required in at least one assertion* from the start. Do not re-open this as a weakening —
it is recorded as a strengthening with a witness. Rejected scope on EV-210 stands: no fixes, no
property-testing framework, no extension of P-ADH to nutrition/streak/red flags/weigh-ins, no ADR
filed by me.
