---
name: feedback-mutant-independence
description: Two clauses each killing the same mutant does not show either is needed — witness ACs must require per-clause independent attribution
metadata:
  type: feedback
---

**A multi-clause guard is only proved by a mutant set that contains, for EVERY clause, a mutant that
clause catches ALONE.** Witness ACs must demand **per-clause independent attribution**, not merely
*"the mutant goes red"*.

**Why:** EV-214's own mutants never tested whether its **computed-style** clause was necessary —
under its bypass, Lina was caught by **both** clauses, so deleting the computed read would have cost
nothing against that set. `staff-engineer` built the absent case (gradient from `globals.css`, ratio
in a custom property, no inline `background` at all → 4 red), which is what makes *"neither read
subsumes the other"* true in **both** directions. **A guard can carry a dead limb for years, and the
day the live limb goes blind — as the computed read does on `Infinity%` — the dead one was never
load-bearing and nobody knew.**

**How to apply:** whenever an AC adds a clause to an existing guard, the witness AC must say the new
clause is caught **by its own clause alone**, and that a mutant already caught by a pre-existing limb
**does not count** as that row's witness. First rows carrying it: EV-215 AC3, EV-216 AC2. Sibling
rule: [[feedback-write-acs-against-the-real-surface]].

📌 **Best witness form, found on EV-214:** `url(` went red in **both** directions **at once** —
Ines via the inline clause alone (the `Infinity%` size discards the shorthand, so computed is `none`),
Lina via the computed clause. **One construction proving both clauses beats two constructions each
proving one**, because it cannot be satisfied by a clause that is dead in the other direction.

🔴 **THE TRIO, completed 2026-09-23 — the three are NOT interchangeable:**

| Clause | The mutant… | What is unproven without it |
|---|---|---|
| **4** | dies to **two** clauses | that **either** clause is needed |
| **7** | **never fired** ([[feedback-probe-the-mutant-before-trusting-green]]) | **anything**, in either direction |
| **8** | fires, but on **a different shape** | that the guard catches **the defect it was written for** |

**A guard is proven only by a mutant that (i) demonstrably did the harmful thing, (ii) is the SHAPE
the guard was added for, and (iii) is caught by that guard ALONE. An exit code carries none of the
three.**

**Clause 8's origin:** QA deleted the `::after` line **and the ratchet together** to get 15 passed —
proving the pre-fix shape was the `minimumBars` hole exactly. The implementer's own run showed the
ratchet **trips**, not that it trips **on that shape**, and it said so itself: *"that is the check I
should have run."*

📌 **Clause 8 is the one most likely to pass review**, because a tripping guard *looks* like
evidence and the reviewer sees red where red was expected. **Ask not "did it go red?" but "would it
still have gone red if the bug had been the OTHER one?"**
