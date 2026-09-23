---
name: guard-rows-vs-product-rows
description: BUGS.md convention ruled 2026-09-23 — a defect in our own verification apparatus is a numbered [GUARD] row that is NOT counted in the severity totals; the axis is "can a user experience it", never "has it merged"
metadata:
  type: feedback
---

A defect in **our own verification apparatus** (a hole in a spec, a false capability claim in a
guard's prose, a fixture that cannot reach the shape it exists for, a harness limitation stated as a
fact) gets a **numbered `[GUARD]` row in `docs/qa/BUGS.md` with full repro and evidence, and is
EXCLUDED from the severity counts**. A defect in shipped behaviour a user/coach/admin can reach is a
PRODUCT row and is counted. The **fix** for a `[GUARD]` row is a backlog row that `senior-po` owns;
the row closes only when QA re-runs the original repro against the merged fix.

**Why:** `senior-po` proposed the axis be *merged vs unmerged artefact* and asked rather than
asserting. Rejected — it would file the same defect differently depending on the hour it was found
(BUG-217 was found ~40 minutes before its guard merged). The counts are the one product-health
number Raed reads, and a user cannot experience a hole in a test; but the witness must not live only
on a card, because a card can be **withdrawn** (EV-219 was, inside a day), and the merged guard now
**cites BUG-217/218/219/220 by number**, so moving them to the backlog would orphan those citations.

**How to apply:** tag the heading `## 🛡 \`[GUARD]\` BUG-nnn — …`, never touch the P0–P3 header for
it, and list the class members in the convention block under the counts in `BUGS.md` (written there
2026-09-23, so it does not get re-litigated per finding). Re-class a `[GUARD]` row to PRODUCT — and
only then move the counts — if it turns out to be reachable by a user. Related:
[[project_ev216-gate]], [[bug-register-bookkeeping]].
