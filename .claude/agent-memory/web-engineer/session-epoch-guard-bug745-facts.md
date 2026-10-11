---
name: session-epoch-guard-bug745-facts
description: BUG-745 / ADR-0033 D33.14 (2026-10-11) — where the session-epoch guard lives, the wake-off fixture switch, and five places the ADR's witness text did not match the code (W4/M8, W16 layer, W3 doc count, M3/W10, WebKit back+forward)
metadata:
  type: project
---

`fix/bug745-session-epoch` (b-fit-coach, base 50f31f7 + merged 4e95519 = s3j).

**Where:** `src/lib/sessionEpoch.ts` (isomorphic: the name, options, the ONE parser,
`isSessionLeaving`), `src/components/shell/SessionEpochGuard.tsx` (layers a–d, banner,
`announceSessionBoundary`, `isSessionStale`), writers in `session.ts` (`beginSessionEpoch`,
`clearSession`) and middleware `toLogin`. `<html data-session-epoch>` is the layout's echo.
`clientSession.replaceDocument` is the one `location.replace`, so the unit harness can stub it.

**Test switch:** `evoli_fixture_session_wake=off` (fixture mode only) makes the layout render
`data-session-wake="off"`, which removes layer (d) entirely. That is the ADR's "M9 build". Without
it, a `focus` when Playwright brings tab 1 forward, or the BroadcastChannel message, reloads tab 1
before the click the witness is about.

**`seen` is seeded at the guard's FIRST COMMIT, not at module evaluation (the ADR's wording).**
A render that throws before the first byte (BUG-629/BUG-689's 500s) is served as Next's error shell
`<html id="__next_error__">` with NO root-layout attributes (`app-render.js:381-389`), and the
client then renders the whole tree (`app-index.js:152`). A module-scope read got `null`, the cookie
made that "stale", and every 500 page reloaded itself forever. That was caught only by the DEFAULT
gate (6 red, `page.goto` timeouts), not by any D33.14 witness. Locked by W11b and the unit test
"the error shell". Any future "read it at module scope" idea must survive the error shell.

**Where the ADR text did not match the code (all reported, none redesigned):**
- **W4 cannot fail here.** Every create action calls `revalidatePath`, so the action answer
  carries a render and `server-action-reducer.js` sets `prefetchCache = new Map()`. The push must
  then REQUEST the page after the sign-out, middleware 307s it, and nothing paints. M2 and M8
  leave W4 green. W4b holds the push's data-carrying RSC GET instead, and M8 turns W4b red.
- On a cold cache, `router.push` first sends a `Next-Router-Prefetch: 1` RSC GET that returns the
  tree only, then a FULL GET with the data. To hold "the answer", match the one with no prefetch header.
- **W16's first layer is `b`, not `c`.** `release(then, "stays")` pops the guard's sentinel
  with `history.back()` before `then` runs the `replaceState(null, …)`.
- **W3 (Back, then Forward queued while leaving)** makes two refused document requests in Chromium:
  the popstate re-issue supersedes the first replace after its 307. "At most one" holds for Back alone.
- **M3 (epoch in writeSession) leaves W10 green.** W10's rotation is middleware's, which never
  calls writeSession. U4's activation case catches M3. An epoch written in the rotation block
  (M3r) turns W10 red.
- WebKit treats a synchronous `history.back(); history.forward()` as no traversal at all. Queue the
  Forward inside the Back's popstate instead.
- Playwright's `waitForURL` fails on an aborted navigation (`ERR_ABORTED`). Poll `page.url()`.

**Round 2 (2026-10-11; architect R1–R9 and staff APPROVE WITH NITS accepted every deviation):**
- R9: `crossSessionBoundary` records `boundaryTarget`, and `leave()` and the re-issue reload
  `sessionReloadTarget()`. `replaceDocument` lives in `src/lib/documentLoad.ts` so the unit
  harness runs the REAL `clientSession.ts` (U10, M11).
- S2: when the last armed guard deregisters, the hook notifies (`onUnsavedWorkCleared`) and the
  guard re-decides as (c). WebKit had left the banner over a clean editor (W20 = staff P3).
  Consequence: M5 (undo 3a/3b) no longer reddens W17. A layout-phase `setEnded` flushes the
  passive cleanup in the same task, and the re-decide leaves before paint. **Only U9 catches M5
  now.** W17's list-name record is proven live by the M2+M6+MS2+M9 control.
- S1: W19 (scripts held across the sign-out) plus the unit "E1 rendered, E2 at load" case. Both
  go red with the rejected cookie read in `seedSeen`.
- **Session witnesses have no CI**: `npm run test:e2e:session` with `COACH_SESSION_SERVER=dev`, then
  `=start`. The default config ignores both session specs. Name both runs in any gate that
  touches the guard, `useUnsavedChanges`, `toLogin` or the root layout.

**Rigs:** `qa/tls-front.mjs` (an https front) is needed for WebKit on `next start`. A `__Host-`
cookie needs Secure, and the server writes the epoch at sign-out, so re-adding cookies by hand
cannot work. Here it was green in 40/40 WebKit start tests. The BUG-739 note says a hand-rolled
proxy caused RSC "Load failed" reds; that was not reproduced with this one (it pipes bodies and
rewrites `Location`). See [[a-path-segment-change-always-remounts]].

**Mutant runner traps:** run the HTTP cookie specs AFTER the rebuild and restart, or they test the
previous mutant's server. A mutant that leaves an unused import fails `next build` (lint runs inside the build).
