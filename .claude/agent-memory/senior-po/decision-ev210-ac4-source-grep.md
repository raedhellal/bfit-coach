---
name: decision-ev210-ac4-source-grep
description: EV-210 AC4 ruling 2026-09-23 — the banned BUG-205 sentence is forbidden in expressions, permitted in comments and in the assertions that forbid it
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
against the bug the AC is about. The shipped rule is strictly stronger: the literal one is satisfied
by an empty repository, this one goes red if the regression is deleted (that counter is **mutant M9**,
run red; carve-out probed both directions).

**How to apply:** if a future row proposes "grep the repo for a banned string", write it as *banned in
expressions, required in at least one assertion* from the start. Do not re-open this as a weakening —
it is recorded as a strengthening with a witness. Rejected scope on EV-210 stands: no fixes, no
property-testing framework, no extension of P-ADH to nutrition/streak/red flags/weigh-ins, no ADR
filed by me.
