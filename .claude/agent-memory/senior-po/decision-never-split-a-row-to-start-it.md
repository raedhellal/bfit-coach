---
name: decision-never-split-a-row-to-start-it
description: EV-205a — refused to carve AC7 out to make the row startable, because that AC's non-merge clause is the pressure closing an open P0
metadata:
  type: project
---

**Do not split a row to make it startable.** Refused on **EV-205a**, 2026-09-23.

**Why:** EV-205 AC7 says *"this branch does not merge until the remediation is done — it is the branch
that makes the seed unnecessary, so merging it while the seed is live would close the argument for
fixing it."* Carving AC7 out is the exact act that clause forbids: it would let EV-205a merge while
the seeded credentials are live on production, removing the pressure that closes **BUG-215**. The
split is not bookkeeping, it destroys a mechanism.

**How to apply — and check the REASON, not just the conclusion.** The reason offered for waiting was
*"AC7 can't be run without the seeded credentials"*, which is **false**: AC7 is a read-only `SELECT`,
not a sign-in. Acting on a wrong reason later produces a wrong decision. The durable reason is:
**BUG-215 already decided AC7's direction, so the row is merge-blocked before a line is written**, and
starting 2 d of work queues a third unmergeable branch behind one ops action. **When BUG-215 closes,
EV-205a starts immediately.**

Also rejected: *"AC7 is the row's actual value."* It is not — the value is AC1–AC6 + AC9 (the admin
granting coach status); AC7 is a **rider**. Calling a rider the value would justify splitting the
*feature* off instead. See [[decision-closing-on-a-deploy-witness]] for the BUG-215 riders.
