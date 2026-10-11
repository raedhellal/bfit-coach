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
  file). A static test checks that no page file serves those URLs and that each target is a `ROUTE_FILES`
  page. Deleting the four entries without adding `REWRITTEN` would have silently dropped BUG-704's
  render-error check of `/x/{id}`. The 19 opened URLs are the same as before.
- `qa/editor-create-then-update.spec.ts` ends with two static tests:
  - AC1: the four folders are absent, and `editor` is the only page folder directly under
    recipes/ and templates/. Any other single-segment folder would be shadowed by the `:id` rule.
  - AC2: it imports `next.config.mjs`, calls `rewrites()`, and `toEqual`s the four rules.
- `qa/warm-routes.ts` still warms `/x/new` and `/x/{nobody}`. Those compile `editor/page.tsx` through
  the rewrite.
- WebKit on `next start` (cookies re-added without `Secure`, scratch `sign-in.ts` patch): BUG-739's
  "template: a direct load renders with no console error" goes red intermittently, on the tip 7/12 and on
  base `8c866e1` 7/11. Every red line is a list page's cancelled AUTO prefetch ("Failed to fetch RSC
  payload … Load failed"). A fresh-tab load (old tab closed first) is clean 6/6 in WebKit, EN and FR.
  This is not a regression. Measure it against base, never against zero.

Related: [[a-path-segment-change-always-remounts]], [[a-route-table-url-can-match-its-file-and-reach-another]].
