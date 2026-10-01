---
name: recipes-and-editor-polish-facts
description: fix/recipes-and-editor-polish (2026-10-01) — BUG-490 seconds kept in the ROW (structure counter in the key, staff S1); BUG-573/574 changed only refusal sentences (\p{Nd} → malformed, readQuantity `ambiguous`); prod-build gates need a wrapper config; zsh eats "$T:q"
metadata:
  type: project
---

Branch `fix/recipes-and-editor-polish` (off coach main `da881af`). Items: EV-276, BUG-537,
BUG-490, BUG-573, BUG-574. Swap-sheet facts are in [[swap-sheet-portal-facts]].

- **BUG-490: the hidden seconds live in `ExerciseRow` state, not in the document.**
  `withTrackingType` still clears `durationSeconds` when switching to WEIGHT_REPS. That
  keeps the editor's rule that no value travels under a control the coach cannot see.
  The row stashes the number and restores it on the way back to DURATION. The other
  design (keep it in the doc, strip it in `forDraftSave`) would also need stripping in
  `templateDocument.forSave` and in every check that reads the doc. A reload forgets the
  stash, on purpose: a value that was never saved is not remembered. The proof that it
  is "not sent": the fixture stores the draft AS SENT. Save in Weight & reps, reload,
  switch to Duration, and Seconds must be empty.
- **Row-local state needs a key that changes when rows move.** Rows were keyed
  `${name}-${index}` inside `<Card key={dayIndex}>`. When another exercise with the same
  name landed in the same place (two Planks after Move up, or Friday's Plank after
  Wednesday was removed), React kept the row mounted and the stash showed on the WRONG
  exercise, as an editable number (staff S1). The fix is a `structure` counter in the
  editor, bumped on Move, Remove, Remove day and Replace, and put in every row key. Those
  edits drop the stash instead of moving it. Before you add any `useState` to
  `ExerciseRow`, check that it survives this.
- **BUG-573/574 changed SENTENCES, not acceptance (Raed approved the reader's rules).**
  `readNumber`'s last line is `/\p{Nd}/u` → `malformed`. JS `\d` is ASCII-only even
  with the `u` flag, so « ١٨٠٠ » used to fall through to `notNumber` ("above 0"). No
  digits are normalised. `readQuantity` has a new kind, `ambiguous`, for `thousands`.
  Its sentence is `recipePolish.quantityAmbiguous(typed)`. The macro fields keep
  `wholeNumber` for the same shape.
- **Own copy section `recipePolish`**, placed after `swapSheet` in both dictionaries.
  Other branches append at the tail, and a new section in the middle does not collide
  with them.
- **Known textual conflict:** `qa/french-polish.spec.ts` "number-input tail". This
  branch moved "1.000"/"1,500"/"150.000" out of the `outOfRange` loop and asserts the
  range sentence on "5 001". `fix/portal-french-polish-2` rewrote the same line to group
  5 000 with U+202F. Resolve by taking this branch's block with their grouped sentence.

**Gates on a prod build.** Every playwright config spawns `npx next dev`, and
`reuseExistingServer` is false. To run on `next start`, write an untracked
`cree-pw.*.config.ts` that imports the base config and overrides only
`webServer.command`/`url` with `npx next start -p <port>`. `COACH_API_MODE` is read at
runtime (`lib/env.ts`), so a plain `npm run build` serves fixture mode under that env.

**zsh pitfall:** `"$T:qa/file"` is a history modifier (`:q`) in zsh, so git gets a
mangled object name. Write `"${T}:qa/file"`.
