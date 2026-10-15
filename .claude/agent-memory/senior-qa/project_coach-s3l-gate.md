---
name: project_coach-s3l-gate
description: 2026-10-11 coach train/coach-s3l cd13f54 (EV-356d + EV-362 + BUG-745) gate FAIL on the start config (23/66, __Host- epoch cookie vs the helpers' secure:false re-add); W1 run, R1-H x guard probes, (c) mutants, router.push as a non-click navigation
metadata:
  type: project
---

**2026-10-11, b-fit-coach `train/coach-s3l` @ cd13f54** = 8c866e1 + EV-356d @37acaac + EV-362 @2fb43ec + BUG-745 @6d01e24.
Session log: scratchpad `coach-s3l-qa.md`; artefacts scratchpad `s3l/` (rig/, logs/, mut/, ref/). Previous: [[project_coach-s3k-gate]].
Verdict and numbers live in the session log. FAIL at cd13f54 on the start config only; every product check passed.

**Why:** coach merge = production deploy ([[coach-portal-merge-is-release]]). First train where EV-356d and BUG-745 meet.

**How to apply (reusable):**
- **Two branches' test helpers can collide only on the merged train.** BUG-745 writes `__Host-evoli_pro_epoch` (Secure, IS_PROD).
  EV-356d's `qa/start-build.ts:32` and `intent-prefetch.spec.ts:81/:95` re-add EVERY cookie with `secure: false`; Chromium stores
  Secure cookies on http://localhost, so the `__Host-` re-add is invalid and `addCookies` throws "Invalid cookie fields": all 23
  Chromium cells red, WebKit green (it never stored the cookie). `next dev` writes a plain non-Secure name, so default/roster stay green.
  Always run EVERY config of both branches on the train, not only the ones the coordinator lists as new.
- **Any "re-add cookies without Secure" rig now needs `secure: c.name.startsWith("__Host-")`.** In WebKit over http the guard is
  INERT (no epoch cookie), so http WebKit runs never exercise BUG-745; use `qa/tls-front.mjs` (https) for both engines instead.
- **`window.next.router.push(path)` exists on a production build** (app-router.js "for debugging"). It is the navigation layers
  (a)/(b) never see, so it is how to reach layer (c) and R1-H's commit on purpose (my A1/C1/C2 probes).
- **R1-H x guard in one commit:** a cached error flight + a boundary + router.push puts error.tsx's reloading shell and
  `data-session-leaving=c` in the same commit; it gave ONE document request and no loop. Instrument R1-H's reach by a
  MutationObserver on `[data-client-load-reloading]` (the reload itself is unobservable from the page).
- **Mutant facts:** (c) as useEffect (the ADR's M8) survives W4b on `next start` in Chromium 8/8 (red on dev 8/8 and start WebKit
  2/2); survives a Back restore (sync commit flushes passive effects first). C2 (router.push to a hover-prefetched row after a
  sign-out) kills it in both engines. (c) removed: every C probe red 12/12.
- **To isolate layer (c) on a traversal:** wrap the FIRST `popstate` listener of the document into a no-op (init script). The guard
  registers (b) in a layout effect, before Next's router (passive); verify by the listener's source head and by layer = "c".
- W1 needs t0 = the prefetch's ANSWER and clicks at +2/+15/+29 s from it; a no-guard control (47e98a9) painting at +29 s proves the
  window was live. W1d (wake on) leaves on the message alone in 51–192 ms.
- The WebKit "direct load … no console error" red was the AUTO prefetch-cancel artefact: base 19/20, train 0/20 (invariant N).
