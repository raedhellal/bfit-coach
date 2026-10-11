---
name: a-cleared-marker-is-a-sync-only-if-it-was-entered
description: BUG-742 — "wait until aria-busy is gone" passes at once if busy never appeared, or left early; witness entry AND that it left with the render (observer snapshot), not an expect poll
metadata:
  type: feedback
---

A sync of the form "await the action's response, then wait for the pending marker to be gone"
is hollow unless the test also proves the marker was ENTERED. `waitForResponse` resolves on the
headers (~45 ms after the click in fixture mode), long before the render; with the marker
removed, `toHaveCount(0)` is true at once and the read lands before the action's render. That
made BUG-691's URL test pass over its own regression (QA's M-691+nobusy, 3/3 green).

**Why:** `1736c62` fixed the "checked radio is not a sync point" trap (EV-356c checks the radio
at once) and swapped in a sync with the same hole one level down. Any optimistic UI keeps
producing these: the visible state changes before the server answers.

**How to apply:** before the click, arm a recorder (`qa/roster-busy.ts`: MutationObserver,
`attributeOldValue` so a set-and-cleared pair in one batch counts); after the "gone" wait,
assert it saw the marker. Not `expect(busy).not.toHaveCount(0)`: an expect poll retries at
100/250/500 ms and can miss a short busy window at zero fixture latency. Witness both ways: the
marker removed must go red on its own, and the original regression must stay red without it.

**Entered is necessary, NOT sufficient (staff S2, 2026-10-11).** A marker that clears BEFORE the
render (staff's M-flash: busy gone 20 ms after the sort starts) is entered and seen, and the
"gone" wait passes early again (M-691 + M-flash: URL test green 2/3). Also witness that it LEFT
with the render: the observer snapshots the rows at the first callback with busy gone, and the
test asserts that snapshot is the new order. Where the action changes nothing visible (the
`q=lin` URL test) there is no DOM witness; name the gap rather than sync on Next internals.
Related: [[a-notice-already-on-screen-is-not-a-sync-point]],
[[a-revalidating-action-wipes-the-guard-flag]].
