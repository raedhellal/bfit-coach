---
name: collapsible-form-close-branch-unwitnessed
description: When an always-open form becomes open-on-request, the "stay open if typed during the save" branch is new code no existing spec reaches; mutate it to always-close and run the suite
metadata:
  type: feedback
---

When a review turns an always-open editor into a closed card with an opener (EV-337g1 targets card,
b-fit-coach adc06c3), the close-on-success callback grows a branch — "a field typed while the request
was out keeps the form open" — that NO pre-existing spec can reach: they were written when there was
nothing to close. At EV-337g1 the mutant `if (true || !typedSince)` passed pro-nutrition-frame +
coach-nutrition (54 green); only a staff probe (page.route holding the server-action POST 2.5 s, type
into a second field, assert 4 textboxes + typed value after "Targets saved.") went red. Always-close
hides dirty text behind the stored values while the leave guard stays armed for work the coach cannot see.

**Why:** the engineer's progress log listed the branch as a decision taken, and the AC table had no row
for it; "close after save" was filed as a PO question, which made the guard look like PO scope, not test debt.

**How to apply:** for any "closes on success unless X" or "keeps open on failure/lost answer" logic, list
each branch and find the spec that reaches it; failure/lost-answer are usually already held by a
`retry`-button-enabled check (BUG-711's no-answer spec), the in-flight-typing branch usually is not.
Hold a server action with `page.route('**/<page path>', ...)` on method POST + setTimeout before
`route.continue()`. Related: [[harmless-variant-falsifies-the-coverage-claim]].
