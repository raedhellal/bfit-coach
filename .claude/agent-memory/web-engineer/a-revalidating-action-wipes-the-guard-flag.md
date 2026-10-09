---
name: a-revalidating-action-wipes-the-guard-flag
description: BUG-735 — after an update action that revalidates, Next 14.2 replaceStates the current entry and drops evoliUnsavedGuard; the sentinel is still there; witness by navigation.currentEntry.index. Also: a late edit + "stays" release needs stillUnsaved()
metadata:
  type: project
---

**The trap.** `history.state.evoliUnsavedGuard` is NOT a witness that the guard holds its entry
once a server action that calls `revalidatePath` has answered. Next 14.2's `HistoryUpdater`
(`next/dist/client/components/app-router.js` ~l.98) installs the action's render with
`replaceState({ ...(pushRef.preserveCustomHistoryState ? history.state : {}), __NA, tree })`,
and `preserveCustomHistoryState` is false there, so the flag on the CURRENT entry is gone while
the sentinel entry itself is still current (`sentinel.current` true, Back still asks). My first
BUG-735 spec polled the flag and went red on the FIXED update paths only (creates were green: their
sentinel is re-pushed after the action). Witness with Chromium's
`navigation.currentEntry.index`: read `start` on load before the first keystroke; armed = `start+1`,
clean = `start` (`historyIndex` in `qa/editor-late-edit.spec.ts`, as in BUG-730's specs).
`armed()`/`disarmed()` in `form-leave-guard.spec.ts` are still fine BEFORE any action answers.

**The fix's shape (BUG-735, fix/bug-735-late-edit-dirty).** Template and recipe editors count
edits (`revision`, RoutineEditor's pattern) and clear `dirty` only if nothing was typed after the
request left. Update with a late edit: do NOT `release()` (sentinel stays; `useCoachForm.saved`
does the same). Create with a late edit: still `release(then, "stays")` (the `replaceState` must
not land on the sentinel), then `leaving.stillUnsaved()`. `dirty` never changed value, so the
arming effect never re-runs and BUG-730's `rearm` is never set: without `stillUnsaved` the step
removes the only entry and Back leaves silently (mutant: 4 create tests red, updates green).
`useCoachForm.saved(stored, then, "stays")` has the same gap but NO caller uses "stays" today:
if one appears, call `stillUnsaved()` there when `isDirty(next)`.

Holding the answer: `page.route` → `route.fetch()` (write committed) → await a test-owned gate →
`route.fulfill({ response })`; hold only the first `next-action` POST, `unrouteAll({behavior:"wait"})`.

See [[the-guards-own-history-step-is-not-the-coachs-back]], [[every-branch-of-a-save-callback-needs-a-test]],
[[coach-form-hooks-342o-facts]].
