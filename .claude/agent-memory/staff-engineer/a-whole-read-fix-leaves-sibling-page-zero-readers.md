---
name: a-whole-read-fix-leaves-sibling-page-zero-readers
description: BUG-472 routed /challenges through readWholeRoster; /templates and /nutrition-templates still call listClients() (page 0, 100 rows) — and the fixture's overflow rows cannot witness it
metadata:
  type: feedback
---

When a fix moves ONE caller of a paged reader to a read-every-page helper, grep every
other caller of the paged reader in the same review. BUG-472 fixed the challenge invite
list with `readWholeRoster` (`src/lib/rosterAll.ts`). At the BUG-738 review (2026-10-11,
`5b6a9e4`) the training-template and nutrition-template pickers still called
`coachApi.listClients()` with no arguments, which means page 0 and size 100. The api caps
`size` at 100 (`CoachPortalController` `@Max(100)`), so a roster of more than 100 rows
(every status) hides whoever sorts after row 100.

**Why:** the sibling pages were "already right" about the null-vs-empty failure contract,
so nobody reopened their read. Fixing one caller felt like fixing the class.

**How to apply:**
- On any roster or picker change, run `grep -rn "listClients(" src`. A caller with no page
  argument is a page-0 reader; ask why it is not `readWholeRoster`.
- Do not accept "the fixture covers it". `evoli_fixture_roster_extra=<n>` appends rows
  with `scopes: []` AFTER the six seeded rows, so every WORKOUTS or NUTRITION row stays on
  page 0. That switch can witness the challenges list (any ACTIVE row), never a
  scope-filtered picker. A spec for the picker fix needs overflow rows that carry the scope.

Related: [[defect-pattern-bound-that-does-not-bound]].
