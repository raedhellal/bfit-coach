---
name: progress-goal-absent-key-semantics
description: b-fit-coach progress-goal PUT has MIXED semantics since EV-274 — two keys clear when omitted, milestoneBodyFatPct is unchanged when omitted; "touched" must outlive a refused save
metadata:
  type: project
---

`PUT /coach-portal/clients/{id}/progress-goal` (b-fit-api `18fbcab`, EV-274a) is a
whole representation for `startedOn` and `milestoneWeightKg` (omitted = CLEARED), but
for `milestoneBodyFatPct` **absent = UNCHANGED, null = CLEARED** (EV-274 B4). The
block's `bodyFatToGoPts` is `@JsonInclude(NON_NULL)`: ABSENT, not null, with no
body-fat reading. `milestoneSetByName` resolves when EITHER milestone exists.

**Why:** B4 exists so a portal tab loaded before the field existed cannot erase it.
The portal therefore sends the key only when the coach touched the field. The trap I
designed around in EV-274b: the form's `dirty` flags are cleared by `markSent` so the
reply may re-seed, so a key driven by `dirty` is DROPPED on the save after a refused
one (weight 500 → 400, fix weight, Save → "Saved." and the typed body fat never sent).
`bodyFatTouched` is cleared only when the field is re-seeded from the server.

**How to apply:**
- Any new progress-goal field: decide clear-on-absent vs keep-on-absent against the api
  DTO (`isXPresent()` setter flag), not by analogy with the neighbouring field.
- A "sent only if touched" key needs a test for the refused-then-resaved path, and one
  for the stale second tab (both in `qa/coach-progress-goal.spec.ts`, EV-274b section).
- The weight field has accepted a decimal comma since EV-202b, so EV-274 edge case 6's
  conditional makes the body-fat field accept one too (`20,5` → 20.5, `20,55` refused).
- Lina's fixture body fats are EV-274's TRAINEE-A numbers (28.0 → 24.0) on purpose, so
  AC2's line is asserted verbatim in the browser.
- The sticky `.shell-bar` can sit over a row after a viewport resize; centre the
  subject (`scrollIntoView({block:"center"})`) before `expectUnoccluded`, since
  `scrollIntoViewIfNeeded` leaves an "already visible" element under it.
- **A browser check that "matches the api" must match the api's VALUE rule, not a text
  shape.** The first cut's regex `\.\d` refused `20.10`, `60.00` and `3.00`, which the api
  (`stripTrailingZeros().scale() > 1`) accepts; staff found it by sending 675 inputs to both.
  Now `\.\d0*`. Exponent, a leading `+` and a trailing point stay refused on purpose, and
  every "matches" claim says so. Before writing "exactly", diff the two rules on a generated
  input set rather than on the story's list.
- Units are joined by U+00A0 (`formatPct`, `formatPtsDelta`). Playwright's string
  `toHaveText` normalises it to a space, a REGEX expectation does not — pin ` ` there.
- Never stash `src/` for a red-first run: a pause left the whole implementation in a
  stash. Run main in a separate `worktree add --detach … origin/main`, with the spec copied in.

Extends [[a-whole-representation-put-needs-a-required-nullable-type]] — that rule now covers TWO of the three keys.
See also [[a-notice-already-on-screen-is-not-a-sync-point]].
