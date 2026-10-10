---
name: project_coach-s3h-gate
description: 2026-10-10 coach train/coach-s3h c378aea (BUG-735 late edit + fluidity batch 1 EV-356a/b/c) gate PASS; WebKit cannot sign in on next start, frame recorders that miss streamed frames, history-flag helpers satisfied by Next's HistoryUpdater, response-headers sync trap
metadata:
  type: project
---

**2026-10-10, b-fit-coach `train/coach-s3h` @ c378aea** = d717e57 (prod) + e59ef78 (BUG-735 @ed1ffb7) + c378aea (fluidity batch 1
@07aad77). Session log: scratchpad `coach-s3h-qa.md`; artefacts scratchpad `s3h/`. Previous: [[project_coach-s3g-gate]].
Verdict and numbers are in the session log, not here.

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]).

**How to apply (reusable):**
- **`next start` + Playwright WebKit cannot sign in** (session cookies are `Secure` when IS_PROD; WebKit drops them over http://localhost;
  the login sits on /login until timeout). Chromium on `next start` for timings, WebKit on `next dev` of the same commit for behaviour.
  I re-learned this the slow way: read the s3c note first.
- **WebKit + `next dev`: a `goto` right after sign-in or on a route's first compile is "interrupted by another navigation".** Settle on
  load and retry the goto once; it is not a product step.
- **A frame recorder started at readyState "interactive" cannot see a streamed document's early frames** (a loading.tsx skeleton on a
  document load). Base passing a "no skeleton" check is the tell. Start the MutationObserver + rAF loop at document start, and count a
  frame as visible only once that document has a `paint` entry (paint holding keeps the old page until then).
- **Frames are kept only on change**, so "the frame before the click" can sit seconds earlier: slice from the last frame with t < click,
  never a fixed −5 ms window.
- **CSS transitions show up in computed style**: `.roster-list` ramps 1 → .55 over 150 ms; a "dimmed in every busy frame" check is wrong.
- **`page.waitForResponse` on a server action resolves on HEADERS** (~45 ms), long before the revalidated render (~1 s at latency 1000).
  A sync must wait on a page state that was provably entered (assert `aria-busy` seen, then gone), or it is hollow when that marker
  regresses (M-691 + no-busy passed 3/3).
- **`!history.state?.evoliUnsavedGuard` is satisfied by Next 14.2's HistoryUpdater** after any revalidating action, on the sentinel
  itself. Mutant "release never steps back" (M-S2) kept coach-progress-goal 49/49 green. Witness a guard's step by the Navigation API
  index (`navigation.currentEntry.index`), as editor-late-edit.spec.ts does.
- **Fixture facts:** Lina's flag-on recipe swap sheet asks « Replace … on Monday? » and is then REFUSED (her dietary settings); Pia's
  flag-off sheet is the applied path. Yusuf has no routine draft in the seed (first template apply succeeds, the second asks to replace).
- **Swap check in its OWN call, then decide.** I chained `sysctl vm.swapusage; …playwright…` for the roster suite and it read 288 MB
  free (swap had grown 3 → 5 GB mid-session) — the run went ahead against the rule. Read, then start.
- **Default suite = 1812 + 8 (fluidity) + 10 (editor-late-edit) = 1830 at c378aea**, roster 323 + 1 skip; `pro-roster-states.spec.ts` runs in the DEFAULT config
  (the ignore regex needs `pro-roster.spec.ts` verbatim).
