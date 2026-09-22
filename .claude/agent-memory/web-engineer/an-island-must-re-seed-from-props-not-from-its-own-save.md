---
name: an-island-must-re-seed-from-props-not-from-its-own-save
description: revalidatePath pushes fresh props with the action's own response, so dropping router.refresh() does NOT stop a form island re-seeding over what the coach is typing — use a per-field dirty flag
metadata:
  type: project
---

Two separate mistakes in one re-seed guard, both made on EV-202b, the second caught by
staff review after I had claimed it fixed.

**1. Compare against the last PROP, never the last value you SAVED.**
```
// WRONG — `seen` is set from the action's RESPONSE
if (sig(props) !== seen) { setSeen(sig(props)); reseed(props); }
```
After a save the island is ahead of the server's props, so every signature looks "new"
and the island re-seeds back to the pre-save values, then forward again. The state
variable must track *the last prop this island was given*.

**2. 🔴 `revalidatePath` inside the server action returns a fresh RSC payload WITH the
action's own response.** Props therefore change in the same tick the save resolves, and
a form that re-seeds on any prop change deletes whatever was typed during the round
trip — **whether or not you call `router.refresh()`**. Removing the refresh closes
nothing; it only removes a second, redundant round trip. A reviewer measured it three
ways (as-is: reverted · without the success re-seed: still reverted · without
`revalidatePath` too: survives).

**How to apply:**
- Keep `revalidatePath`. The same push is what keeps a reload, a back-navigation and a
  second tab off a cached render — deleting it to win the race trades a lost keystroke
  for a stale screen.
- Hold a **per-field dirty flag**: set on `onChange`, cleared when a save is *sent*,
  and consulted by *both* re-seed paths (prop signature and success handler). Advance
  the prop signature even when a field was not re-seeded, or a dirty field leaves the
  island a prop behind for good.
- Carry the flags in the same state object as the field values and update them with
  functional updates — the success handler runs after an `await` and a closure over
  the old state is stale.
- The display half (a table, a summary) should still follow props unconditionally. Only
  the inputs are the coach's.

Related: [[client-islands-go-stale-after-a-server-write]],
[[a-notice-already-on-screen-is-not-a-sync-point]].
