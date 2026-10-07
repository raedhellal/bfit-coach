---
name: a-module-split-can-grow-the-page-it-was-for
description: EV-348 (2026-10-07) — splitting small client modules out made webpack DUPLICATE them across the layout chunk and shared chunks; the client page grew +0.78 kB. Measure cold encodedBodySize before claiming a split saves bytes
metadata:
  type: project
---

On `refactor/ev348-module-split` `3e6af97` (WIP, not mergeable), moving `countUrlChange`,
`startNavigationProgress` and `hasUnsavedWork` into their own modules took `/` and
`/templates` down 0.70 / 0.84 kB but took the client page UP 0.78 kB (cold load, `next start`,
`encodedBodySize` of every JS resource, 5 identical runs). Next's splitChunks stopped grouping
`i18n/client` + `NavigationProgress` + `useUnsavedChanges` in one shared chunk (`1119` at
`05abea6`) and duplicated the small modules into the layout chunk AND page-shared chunks. A
variant keeping `startNavigationProgress` in the component was worse (+1.56 kB, and
`nav-progress-fill` in two chunks: the very defect 348.2 was written against, which did NOT
exist at `05abea6`).

Also found: `rosterReturn.ts` reaches every signed-in page through `SignOutButton` →
`clientSession.clearRosterReturn`, not only through `UrlChangeCounter`; and `/` (the roster)
needs it anyway, so EV-348's 348.1 cannot hold on `/` as worded.

**Why:** the card's byte claims were "read from the chunks, not measured one by one"; a chunk
graph is a heuristic's output, and moving a module moves its neighbours too.

**How to apply:** for any bundle-size story, measure base and branch with the same script
(scratch `ev348/measure.mjs` pattern: fresh context per load, sign in by
`/api/auth/login`, sum `performance` resource `encodedBodySize` for `.js`, grep the bodies
for marker strings) BEFORE writing the split up as done, and report the per-chunk diff when
a page grows.
