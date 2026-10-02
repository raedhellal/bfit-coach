---
name: nav-progress-second-click-facts
description: b-fit-coach NavigationProgress (BUG-670 + staff review, 2026-10-02) — one pending run per wait, first click's 400 ms deadline, current-tab click ends a run, readiness attribute, test traps (WebKit hydration, retrying expect hides a gap, two next dev in one tree, process.env in evaluate)
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
- **A click on the CURRENT tab during a pending navigation abandons it** (Next's
  `dispatchAction` discards a pending navigation; the new one re-renders the page on
  screen, no URL change). Nothing ended the run, so the bar stayed 20 s; it now `stop()`s
  on a plain click to here while pending. Witnessed at 0.4 s and 1.8 s into the load: the
  abandoned tab never lands. Any new end-of-run rule needs that "does it really never
  land" witness, or it hides the bar over a live load.
- **Readiness:** the effect sets `data-nav-progress-ready` on the bar after attaching
  its listeners; tests wait for that (staff nit: a fiber key + 50 ms is a guess).
- **Every test was one slow navigation from a fresh document**, so deleting the per-run
  reset (`pending.current = false`) stayed green. Pin per-document state with two runs.
- **Probe trap:** `process.env.X` inside a `page.evaluate` callback runs in the BROWSER
  (undefined, ReferenceError in a setTimeout, silently no click). I wrongly concluded
  "Next drops a second click to `/`" from such a void probe. Pass values as the arg.

See [[coach-loading-tsx-and-nav-progress]].
