---
name: a-notice-already-on-screen-is-not-a-sync-point
description: Waiting for "Saved." to assert that something SURVIVES a save returns instantly when the notice is still up from a previous save — the test then reports that the revert has not happened yet
metadata:
  type: project
---

A test for "X is still there after the save" cannot be synchronised on a success notice
that the setup step already put on screen. `await expect(getByText("Saved.")).toBeVisible()`
resolves in a millisecond against the *previous* save's notice, the assertion runs before
the round trip has even finished, and the test is green because **the revert has not
happened yet**. The first version of EV-202b's keystroke-race regression passed against
the exact defect it was written for, for this reason.

Two structural points, both of which apply to any "a value SURVIVES" assertion:

- **Polling assertions cannot express "stays".** `toHaveValue("69")` passes the moment
  it is true and never looks again, so on a broken build it passes before the overwrite.
  You need a deterministic point *after* the event, then the assertion.
- **Synchronise on the event itself and hold it open.** `page.waitForResponse(r =>
  r.request().method() === "POST" && r.url().includes(id))` for the server action, plus
  `page.route` delaying that POST by ~1.2 s so "typed during the round trip" is a fact
  rather than a race with the network. Then assert something that proves the response was
  *applied* (a table showing the saved value) before asserting what must not have moved.

**How to apply:** when a spec's green looks cheap — a wait that returned instantly, an
assertion that could have been true too early — reproduce the defect by hand first and
make sure the test fails on it. `senior-qa` and staff review both probe by hand; a test
that only passes is not evidence either way. Related:
[[an-island-must-re-seed-from-props-not-from-its-own-save]],
[[playwright-gettext-is-case-insensitive-substring]].
