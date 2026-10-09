---
name: client-header-name-slot-is-the-h1
description: ClientHeader's name slot is the client pages' only h1; with no name (overview read failed) the tab must take the h1 itself via headerHasName (BUG-713). Live-mode rig for outages.
metadata:
  type: project
---

`ClientHeader` draws the trainee name as the page's one `h1`. Since BUG-713 (2026-10-09, fix 355b19d on
fix/bug-713-tab-empty-h1) it draws NO avatar and NO h1 when the name is blank, and the routine and nutrition
tabs render `ClientNotice asHeading={!headerHasName(...)}`. UPDATED by BUG-714 (174f57c): `ClientHeader` now
takes `trainee` (the read, `null` = it failed) and `headerHasName(trainee)` is `trainee !== null`; a blank or null
name in a read that SUCCEEDED draws the h1 "Unnamed client" (see [[unnamed-trainee-is-absent-not-unknown]]). The overview page does not use this: it
throws `clientLoadError()` to the error boundary (BUG-629, a 500), the tabs stay 200 (ruling 713-R1).

**Why:** a null overview became `""`, and the header drew `<h1 title="">` plus an avatar with no initials. No
test caught it because nothing in the fixture seed fails the overview; only the `evoli_fixture_overview=fail`
cookie (set at the ROOT url) reaches the branch.

**How to apply:** any new client page or header state must keep the "exactly one h1" invariant through the
same predicate, never by a second condition. Live-mode outage reproduction: QA's
`scratchpad/s3b/rig/probe-live.mjs` (forged unsigned COACH token) + `stub-api.mjs`; the probe imports
`playwright`, so copy it into the worktree to run it (ESM resolves from the script's dir). See
[[a-page-can-answer-500-through-a-digest]], [[playwright-addcookies-url-scopes-the-path]].
