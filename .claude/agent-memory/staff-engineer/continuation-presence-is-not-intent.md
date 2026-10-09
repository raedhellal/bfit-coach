---
name: continuation-presence-is-not-intent
description: A hook that infers "this callback leaves the page" from "a callback was passed" — BUG-730's leave guard dropped its re-armed sentinel for the two creates whose then STAYS; also, a test's Back press can heal the state it was meant to witness
metadata:
  type: feedback
---

When a shared hook branches on `then ? … : …` / `thens.length === 0`, list EVERY caller's `then` and classify it (navigates / stays). BUG-730 (b-fit-coach `fix` 25dcbc5, 2026-10-09): `useUnsavedChanges` skipped the re-armed sentinel whenever a `then` was queued, "since a then leaves the page". The Template and Recipe creates pass a `then` that stays (setId + replaceState): a keystroke inside the save's history step left the form dirty with NO sentinel, and Back left silently for the rest of the session. Base had only asked a spurious question there, so the fix traded a nuisance for silent data loss.

**Why:** the caller-side doc ("then is a navigation the save leads to") was true for useCoachForm's callers and false for the two older editors that share the hook. The hook cannot know intent; the caller must say it.

**How to apply:**
- `git grep` the hook's callers, read each `then`, and build the probe on the caller the comment did not consider (here: `/templates/new` with `history.back` held 400 ms by an init script, keystroke in the hold, then Back).
- Run the probe on base too, by swapping the hook file in (`git show <base>:path > path`, then `git checkout --`). The comparison is what tells you whether the fix made a path worse.
- Mutant lesson from the same review: a test that presses Back before the next save HEALS a hook that forgot its re-pushed sentinel (Back re-pushes it). Mutant "clear `sentinel` after the re-push" survived 5/5. Ask for the variant with no intervening user action.
- Round 2 (`79e918d`) fixed it with `release(then, "stays" | "leaves")` as an overload; a bare `then` is TS2575. Witness the overload with a throwaway file under tsc. `useCoachForm.saved` hardcodes "leaves", so the guarantee stops at that wrapper. (N1 at 8ec16aa threads it through)
- An index poll under a held step is vacuous. `expect.poll(historyIndex).toBe(start)` with `start` read while the sentinel was current passed while the save's step was still held; the index really ended one lower. Log the index at each step (loaded / armed / final) before trusting 'ends where it was loaded'.
- To confirm that a test rewrite fixed a vacuous assertion, run the OLD spec copy (`git show <old>:spec > qa/zz-old.spec.ts`) beside the new one, against the same mutant, in one server run. That shows WHICH assertion catches it in each version. Round 3 (4437475), with a stray pushState after the staying re-push: the new check failed at "the history is not where the page was loaded" (2 vs 3); the old check got past its index poll and failed only at the closing goBack→waitForURL timeout.
- Related: [[defect-pattern-bound-that-does-not-bound]], [[invariant-cited-from-code-that-does-not-validate-its-input]].
