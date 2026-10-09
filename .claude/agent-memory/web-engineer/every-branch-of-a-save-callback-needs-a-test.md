---
name: every-branch-of-a-save-callback-needs-a-test
description: EV-337g1 staff S1 — the "typed while the save was in flight" branch shipped with no spec; hold the action POST with page.route and fill during the hold to reach it
metadata:
  type: feedback
---

A save callback with a conditional (EV-337g1: close the form only if nothing was typed since the request left)
needs a test per branch. Staff's mutant `if (true || !typedSince)` passed 54 tests; only their probe saw it.

How to reach the in-flight branch: a server action is a POST to the page's own URL, so
`page.route("**/clients/<id>/nutrition", r => r.request().method() === "POST" ? delay-then-continue : r.continue())`
holds it; `locator.fill` needs no pointer, so it types behind the confirm dialog's overlay during the hold. Then
assert the branch's outcome AND what depends on it (the leave guard asks on the next tab click).

**Why:** a branch written for a rare case is exactly the one no happy-path spec visits, and the reviewer
assumed it was tested because the rest was.

**How to apply:** before handing back, list each `if` in a write callback (land / refuse / fail / lost /
access ended / typed-in-flight) next to the test that reaches it; run the "always take the other branch"
mutant for any without one. See [[targets-form-closed-on-load]], [[a-fixture-without-the-shape-cannot-guard-it]].
