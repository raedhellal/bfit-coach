---
name: nav-progress-second-click-facts
description: b-fit-coach NavigationProgress (BUG-670, 2026-10-02) — one pending run per wait, why the 400 ms keeps the first click's deadline, and the test traps (hydration race in WebKit, retrying expect hides a gap, two next dev in one tree)
metadata:
  type: project
---

`src/components/shell/NavigationProgress.tsx` treats every start during a pending run as
part of the SAME wait: a visible bar stays; an armed 400 ms timer keeps the FIRST click's
deadline; only the 20 s give-up restarts (it belongs to the latest navigation). Before
BUG-670, `begin()` called `stop()`, so a second click hid the bar ~400 ms mid-load.

**Why first-click deadline, not second:** EV-337 L3 / BUG-670 expected (2) says the bar
shows no later than 400 ms after the first click. A fast second navigation (router-cache
revisit) still never flashes it, because its commit changes the URL and `stop()` runs
before the first deadline. `qa/nav-progress.spec.ts` pins this with a show-now mutant (red).

**How to apply (test traps, measured):**
- **WebKit on `next dev`: a click right after `goto` beats hydration.** The Link navigates
  but the bar's effect-attached listener does not exist yet, so no bar ever starts. Wait
  for `__reactFiber*` on `.nav-progress`, then one task (`hydrated()` in the spec).
- **A retrying `expect(...).toBeVisible()` waits out a 400 ms gap** and passes on the bug.
  To prove "never dropped", read once right after the click, or record with a
  MutationObserver from before the first click (`twoClicks()` records `gapAt`).
- **A self-launched WebKit context with `locale: "fr-FR"` still rendered English** inside
  the roster config (`use.locale: "en-US"`); a standalone node script got French. Set the
  `evoli_pro_locale=fr` cookie instead; it outranks Accept-Language.
- **Two `next dev` in one worktree clobber `.next`**: the older one then answers 500
  "missing required error components". Kill a probe server before a Playwright run whose
  webServer uses the same tree, and `rm -rf .next` after.
- Observed, unexplained (Next 14.2.35, Chromium, +1 s/read): a second click to `/` or
  `/challenges` 600 ms into a pending tab navigation was dropped; the first tab committed.
  A second click to another client tab supersedes. The bar is right either way (it ends on
  the commit that happens).

See [[coach-loading-tsx-and-nav-progress]].
