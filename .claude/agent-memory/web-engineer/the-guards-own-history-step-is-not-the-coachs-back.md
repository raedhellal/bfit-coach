---
name: the-guards-own-history-step-is-not-the-coachs-back
description: BUG-730 — the leave guard misread its own in-flight history.back() as the coach's Back when a keystroke re-armed it inside that step; held history.back to see it; release(then, stays|leaves) after staff B1; idle-machine repeat runs prove nothing
metadata:
  type: project
---

`useUnsavedChanges` hands its sentinel back with `history.back()` (after a save: `release()`; when a
form goes clean without a save: the effect cleanup). The `popstate` lands 2–14 ms later (median 4,
280 saves, idle Mac). Before BUG-730, a keystroke inside that window re-armed the guard with a fresh
`pushState`, and the step's `popstate` reached the re-armed listener after `withCleanHistory`'s had
cleared `bypass`: « Leave with unsaved changes? » over the form. In `coach-progress-goal` :952 that
was a Save click under `data-modal-backdrop` for 60 s, or a `waitForResponse` for a save never sent,
and serial mode skipped the 19 tests after it. A coach can hit it (typing just after a save lands),
so the row is PRODUCT, not a test flake.

**Why it was invisible here:** on an idle machine the natural rate is 0 (base 20/20, 40/40, and 40/40
under `taskpolicy -b`: background QoS slows renderer and browser alike, the ratio holds). The
engineer's 6/20 was on a loaded gate. Do not read an idle-machine ×40 as a fix witness.

**How to find/hold such a race:** wrap the page's own `history.back` in an init script that runs it
N ms later (`holdHistoryBack` in `qa/form-leave-guard.spec.ts`). 30 ms: base :952 0/10. Log
pushState/back/popstate to `console` from the init script to see the order (zero added latency).
Count `history.back()` CALLS too: a bounce caused by an unmount cleanup is invisible to a test whose
own `goBack` lands elsewhere (mutant M2 survived until the count was asserted). Read page counters
before a `goBack` that loads another document (the init script resets them).

**The fix:** a push while our step is in flight is deferred to the landing (`releasing`/`rearm`);
the landing marks its own `popstate` (`ours.current = event`; every window listener gets the same
event object, so the Back listener skips it without a timer); a release inside the step does not
call `back()` again and queues its `then`; the effect cleanup goes through `withCleanHistory` too.

**Staff REQUEST CHANGES (B1), the lesson:** I first assumed every `then` leaves the page and skipped
the re-push whenever one was queued. TemplateEditor/RecipeEditor creates pass a `then` that STAYS
(`setId` + `replaceState`), so typed work went unguarded for the rest of the session: worse than
base. Now `release(then, "stays" | "leaves")` is REQUIRED by an overload (bare `then` = TS2575);
stays-thens run first, then the re-push (so it carries the replaced URL). **Before encoding an
assumption about a callback, `git grep` every caller and classify it.** Also: a mutant I "rewrote"
for new code (deleted a line instead of moving it) was not staff's mutant; run the faithful diff.
Mutants that survived the first round: S6 (sentinel forgotten after the re-push, healed by a Back in
the test) and S4 (queued `then` dropped, untested) — a test that presses Back can hide bookkeeping.
M7 (rearm clear on a release inside the step) stays unwitnessed, commented so.

See [[coach-form-hooks-342o-facts]], [[a-back-after-a-guarded-leave-can-hard-reload]],
[[a-notice-already-on-screen-is-not-a-sync-point]].
