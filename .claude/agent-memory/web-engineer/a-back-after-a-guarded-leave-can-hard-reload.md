---
name: a-back-after-a-guarded-leave-can-hard-reload
description: BUG-232 root cause is in the app, not the test — after a guarded Leave, ~4% of Back presses hard-reload the editor (Next RSC fetch aborted -> MPA fallback); never "fix" the EV-190 AC2 test by waiting it out
metadata:
  type: project
---

BUG-232 (EV-190 AC2 breadcrumb test, `qa/coach-routine.spec.ts` ~:818-821, 4-6 % flake)
is NOT two Backs racing in the test. Measured 2026-09-25 at `main` `7bddb7a`, `next dev`
fixture mode:

- After "Leave without saving", ONE Back to the editor makes the page issue a
  **cross-document request for the editor's own URL** (beforeunload, new document) in
  **5/120** single-Back runs; the same Back after an UNGUARDED breadcrumb click (no edit)
  did it **0/160**. Double-Back control without the guard: 0/150.
- The self-reload starts ~5-10 ms after the Back commits, right after the restore's
  `_rsc` fetch reports `net::ERR_ABORTED`. Next 14.2's `fetchServerResponse` turns a
  failed RSC fetch into an MPA navigation (`doMpaNavigation`). Why the fetch aborts, and
  why the restored editor segment has no cached RSC, is NOT proven — suspect the guard's
  `history.back()` + `router.push()` in `useUnsavedChanges.leave` (Next also RESTOREs on
  that popstate).
- Every test failure had the self-reload in flight before the second Back was even
  sent (the history snapshot Playwright acts on was correct: currentIndex=2, target "/").
  Playwright `goBack` = `Page.getNavigationHistory` + `navigateToHistoryEntry(id)`.

**Why:** a test fix that "waits for the first Back to settle" would silently absorb an
app anomaly the test is currently the only detector of. Brief said STOP if the app is at
fault; I stopped and reported, no src/ or spec change.

**How to apply:** if BUG-232 comes back, the fix belongs in the guard (senior-po /
architect call), and the spec should then assert NO document request after the first
Back (count `request.isNavigationRequest()`), which is a deterministic witness at 1 run
per ~20. Diagnostic harness: in-page init-script history hooks reported via `console`
(zero added latency); a `page.evaluate` between steps slows it enough to hide it.
Related: [[coach-portal-fixture-mode]].
