---
name: merged-editor-pages-ev362-facts
description: EV-362 (2026-10-11) - recipes/templates editor is ONE page file each, new/ and [id]/ deleted; the render-error registry can't hold a rewritten URL (REWRITTEN table); contract tests pin absence + rewrites
metadata:
  type: project
---

Since EV-362 (branch `chore/ev362-merged-editor-pages`, base `8c866e1`), `src/app/recipes/editor/page.tsx`
and `src/app/templates/editor/page.tsx` hold both branches (id empty = new, else existing) in ONE return.
`src/app/{recipes,templates}/{new,[id]}/` no longer exist. `/x/new` and `/x/{id}` reach the editor
only through the four `beforeFiles` rewrites in `next.config.mjs` (BUG-739). Without them, those URLs match
no page file.

**Why:** BUG-739's B′ had left two unserved page modules per resource and an element-position invariant
across two files. Raed approved deleting them by delegation (EV-362 Source).

**How to apply:**
- Edit the editor pages ONLY in `editor/page.tsx`. Keep the editor at one JSX slot for every branch. For
  recipes, the editor is the second child of `CoachShell`, after `PageHead`. For templates, it is the only
  child. Witnessed: wrapping only the new branch's `<RecipeEditor>` in a `<div>` turned BUG-739's two
  recipe create → update tests red ("the update's answer re-mounted the editor"). So keep the slot when
  you edit a branch.
- `qa/render-error-every-route.spec.ts`: 352.4 models the file-system router only. So a rewritten URL
  (`/recipes/new`, `/recipes/{id}`) can NOT sit in `ROUTE_FILES`. It goes in `REWRITTEN` (URL → target
  file), which staff's review bound to `rewrites().beforeFiles`:
  - every rule must take at least one `REWRITTEN` URL;
  - each target must be the page the first matching rule's destination pathname resolves to;
  - no page file may serve the URL directly.
  Deleting the four entries without `REWRITTEN` would have silently dropped BUG-704's check of `/x/{id}`.
- Page-file helpers (`PAGE_FILE`, `appPages`, `segmentsOf`, `urlPattern`, `resolvePage`, `sampleUrl`,
  `beforeFilesRewrites`, `sourceMatches`) live in `qa/app-pages.ts`. A spec must not import another
  spec. Sources compile with `next/dist/compiled/path-to-regexp` using Next's options (`/` delimiter,
  case-insensitive, strict). It ships no types, so `qa/next-path-to-regexp.d.ts` declares them.
- `qa/editor-create-then-update.spec.ts` has two static tests:
  - AC1 pins the four page FILES absent, not their folders, so a nested `recipes/[id]/history` page
    is allowed. It also fails any page under `src/app` whose sample URL (groups dropped, dynamic
    segments filled) a `beforeFiles` source takes, except a rule's destination page.
  - AC2 `toEqual`s the four rules as declared.
- Mutants witnessed (2026-10-11):
  - M1 restored `recipes/new` → red on both limbs.
  - M5 a swapped REWRITTEN target → red. M6 the `/recipes/{id}` entry deleted → red.
  - M7 `recipes/(list)/page.tsx` → AC1 green. M8 `recipes/(x)/import/page.tsx` → red.
  - M9 `recipes/[id]/history/page.tsx` → green.
  - An expect that fails stops the test, so make the first limb `expect.soft` if both limbs must report.
- `qa/warm-routes.ts` still warms `/x/new` and `/x/{nobody}`. Those compile `editor/page.tsx` through
  the rewrite.
- WebKit on `next start` (cookies re-added without `Secure`, scratch `sign-in.ts` patch): BUG-739's
  "template: a direct load renders with no console error" goes red intermittently, on the tip 7/12 and on
  base `8c866e1` 7/11. Every red line is a list page's cancelled AUTO prefetch ("Failed to fetch RSC
  payload … Load failed"). A fresh-tab load (old tab closed first) is clean 6/6 in WebKit, EN and FR.
  This is not a regression. Measure it against base, never against zero.

Related: [[a-path-segment-change-always-remounts]], [[a-route-table-url-can-match-its-file-and-reach-another]].
