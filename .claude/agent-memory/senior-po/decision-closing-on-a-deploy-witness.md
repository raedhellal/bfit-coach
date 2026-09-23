---
name: decision-closing-on-a-deploy-witness
description: BUG-205 precedent — a bug may close on merge + confirmed deploy + regression over its own reproduced world, with the unperformed check named and rehomed, never dropped
metadata:
  type: project
---

**A defect may close WITHOUT observing the fixed behaviour on production, but only on this bar** and
only with the gap written on the card: merged sha **+ confirmed deployed sha** (a *transition*
observed, not one matching reading) **+ a green regression over the defect's own reproduced world**
**+ a guard against that regression's silent deletion** **+ the gate driven against a real backend.**
Set on **BUG-205**, 2026-09-23.

**Why:** the portal needs auth and the only production coach credential is the one published in the
repo — **BUG-215**, an open P0. Using the P0's own credential to close a P2 is spending the incident
to buy bookkeeping. Leaving the P2 open instead tells Raed the defect may still be live while five
witnesses say it is not.

**How to apply:** name the residual inference **precisely** — for BUG-205 it was *one* step (the
fixture world stands in for a real trainee reaching that state), **not** the weaker "does the artifact
match the code", which the sha closes. **Rehome the unperformed check onto the row whose closure
creates the access** (BUG-205's screen check rides on BUG-215) so it is neither lost nor blocking.
A closure with fewer witnesses than those five does not get to cite this precedent. Related:
[[feedback-never-assert-an-unprobed-consequence]].

**Also settled here:** merging to `b-fit-coach` main **IS releasing** — say a test-only row *"ships
nothing"*, never *"is not released"*. And **a bug row carrying a product decision gets a board card**;
BUG-205 had none for its whole open life though `BUGS.md` named me owner of its wording. I do **not**
write `docs/qa/BUGS.md` — that register is `senior-qa`'s.
