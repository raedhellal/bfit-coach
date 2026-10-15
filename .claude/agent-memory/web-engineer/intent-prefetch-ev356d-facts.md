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
- **P4, witnessed 2026-10-10 in both browsers, is a regression caused by `static: 30`.** With `static == dynamic`, a plain
  `<Link>` whose AUTO entry has expired re-prefetches on hover (tree only). The click then paints the OLD tree-cache
  node with zero requests: at +35 s and +70 s after a revoke, the routine or overview tab showed her data. Under `static: 300`
  the entry is `stale`, and the same click refetches the leaf and lands on `/clients/denied`. Playwright's `click()` hovers first.
- **P5 is pre-existing on main.** An error node in the tree cache is replayed by Back + click (inside 30 s) and by
  Forward, with zero requests. Only a reload escapes it.
- WebKit fires `pointerover` under a stationary pointer after Back, so an IntentLink row under the cursor prefetches.
  Chromium does not.
- **The fixes (2026-10-10).** `51f9939`, R1-H: `BootMark` (a module flag, set in an effect, mounted outside the root
  Suspense) plus the `error.tsx` client-load branch, which reloads once when the error is met after boot. `e9af1fe`,
  invariant N: every link goes through `components/ui/Link.tsx` (`prefetch={false}`), and ESLint bans `next/link`
  elsewhere.
  - `next build` runs lint, so a mutant that brings `next/link` back fails the BUILD. Build it with
    `next build --no-lint` to see its runtime red.
  - R1-H changes timing for any spec that navigates client-side onto the overview during an outage: the arrival
    reloads. BUG-713's walk had to wait for the 500 notice before its next `goto` (otherwise ERR_ABORTED).
  - To see "at any frame" across a reload, use `addInitScript` (a MutationObserver) plus `exposeBinding`.
    Skip text inside SCRIPT and STYLE.
  - Multi-page tests in one context need `context.setDefaultTimeout`: the start config sets no action timeout, so a
    bad locator hangs until the test timeout and names no step.
- WebKit's Tab skips links (Safari default). A keyboard test across links in WebKit must press `Alt+Tab`. The
  witness: plain Tab focused no roster row.
- A spec-launched browser runs under the chromium project, while a Playwright `webkit` project with `grep` runs
  specs that use the runner's own page. Both need the Secure-cookie strip on `next start`.
- Scratch Playwright configs outside the repo cannot resolve `@playwright/test`. Put a probe under `qa/`, untracked,
  and give `webServer` a `cwd`.

**How to apply:** any FULL prefetch in this portal (here or on a future link) needs D.6's question answered first.
Measure on `next start` in both browsers.
