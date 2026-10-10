---
name: intent-prefetch-ev356d-facts
description: EV-356d roster-row intent prefetch: next-start-only tests, WebKit Secure-cookie trap, a FULL prefetch caches a thrown page error (P3), the 60 s window
metadata:
  type: project
---

EV-356d (2026-10-10, branch perf/ev356d-intent-prefetch): roster rows are `IntentLink`
(`src/components/roster/IntentLink.tsx`): `<Link prefetch={false}>` + FULL `router.prefetch`
after an 80 ms dwell (mouse pointerenter, focus). `staleTimes.static` 300 -> 30, as Raed ruled (option A).

**Why these facts matter:** each one cost a run, or turned out to be the merge blocker.

- `router.prefetch` is a no-op under `next dev`. Prefetch tests live in `qa/intent-prefetch.spec.ts`
  and run only in `playwright.start.config.ts`, which runs `next build && next start` unless `COACH_START_PREBUILT=1`.
  `qa/production-build.ts` tells the two apart by the hashed `webpack-<hex>.js` script.
- **WebKit + `next start` + http://localhost = signed out.** In production the session cookies are `Secure`
  (session.ts, middleware.ts). Chromium exempts localhost and WebKit does not, so every page 307s to /login.
  The tests re-add the cookies with `secure: false` (`signInOverHttpWebKit`).
- **P3 / D.6 (the STOP).** The overview page `throw`s `clientLoadError()` when a read fails. On an RSC request that
  is a **200** with the error inside the flight, not a non-OK answer. So a hover while the api fails caches the error,
  and the click paints « This trainee could not be loaded. » with **no request**, even though the server answers 200 by then.
  The MPA fallback in `fetch-server-response.js` only covers non-OK statuses.
- The ruled window was witnessed in both browsers. Cached at +20 s and +45 s after the revoke, `/clients/denied` at +65 s.
  A FULL entry is fresh for `static` from the prefetch, then reusable for `dynamic` from the first use, and only the
  first use stamps `lastUsedTime`.
- A FULL prefetch over an existing TEMPORARY entry (a page visited by click, without a hover) refetches
  (`switchedToFullPrefetch`). Re-hovering a page you only clicked into is one more render, not a dedupe.
- React's `onPointerEnter` is built from `pointerover`/`pointerout`. A synthetic test must dispatch a bubbling
  `pointerover` with `pointerType`. Pair a "touch renders nothing" check with a "mouse renders one" control.
- A spec that `readFileSync`s a new source file at module load does not even load on the parent branch, so every test
  there "fails" for the same reason and none of them is a real red. Guard the read with `existsSync`.
- `git restore --source=<parent> -- src` DELETES files the parent lacks, and `--source=HEAD` brings them back.
  Builds with a warm `.next/cache` take about 8 s, so a fast build is not a broken build.
- Scratch Playwright configs outside the repo cannot resolve `@playwright/test`. Put a probe under `qa/`, untracked,
  and give `webServer` a `cwd`.

**How to apply:** any FULL prefetch in this portal (here or on a future link) needs D.6's question answered first.
Measure on `next start` in both browsers.
