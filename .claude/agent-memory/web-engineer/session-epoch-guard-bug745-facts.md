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

**Rigs:** `qa/tls-front.mjs` (an https front) is needed for WebKit on `next start`. A `__Host-`
cookie needs Secure, and the server writes the epoch at sign-out, so re-adding cookies by hand
cannot work. Here it was green in 40/40 WebKit start tests. The BUG-739 note says a hand-rolled
proxy caused RSC "Load failed" reds; that was not reproduced with this one (it pipes bodies and
rewrites `Location`). See [[a-path-segment-change-always-remounts]].

**Mutant runner traps:** run the HTTP cookie specs AFTER the rebuild and restart, or they test the
previous mutant's server. A mutant that leaves an unused import fails `next build` (lint runs inside the build).
