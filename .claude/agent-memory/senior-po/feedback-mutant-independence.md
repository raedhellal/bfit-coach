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
