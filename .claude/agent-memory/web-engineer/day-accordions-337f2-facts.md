---
name: day-accordions-337f2-facts
description: EV-337f2 day accordions in RoutineDocumentEditor — hidden-not-unmounted, open state lifted to RoutineEditor, the F2.2-vs-F2.5 spec conflict, role locators skip hidden fields
metadata:
  type: project
---

Day accordions live in `RoutineDocumentEditor` (shared by the programme page and the template
editor). Header = `<h3 class="day-acc-head"><button aria-expanded aria-controls>`; body =
`<div class="day-acc-body" hidden>`. Rule on load: `initialOpenDays` (day 1 + days holding an
unbindable exercise); an added day opens; a missing entry reads OPEN.

- **Hidden, never unmounted.** F2.3 and BUG-490's `ExerciseRow` stash both need the row to stay
  mounted. Hidden fields keep value === defaultValue, so BUG-687's
  `useAdoptPrehydrationInput` DOM scan skips them (nothing typed pre-hydration into a
  display:none field).
- **Open state is held by `RoutineEditor`** (`openDays` / `onOpenDaysChange` props), NOT in the
  keyed editor: the `loads` remount (publish re-seed, Load saved version, Discard) would
  otherwise fold every day and lose the coach's place at day 6. TemplateEditor passes nothing
  and the editor keeps its own state. A sabotage (props removed) turns the re-seed test red.
- **F2.2 contradicts F2.5/F1.7 "specs pass unchanged".** Nine pre-f2 tests reach into day 2+
  (Add exercise nth(1), Day 6 Goblet Squat, Pull-Up on Dana's day 2…). Resolved with ONE
  helper call, `qa/day-accordion.ts` `openEveryDay(page)`, no assertion dropped; flagged to
  the PO. Expect the same in any later slice that collapses content.
- **Role locators exclude hidden elements; `getByLabel` + `toHaveValue`/`inputValue` do not.**
  So `getByLabel("Day 2 weekday").toHaveValue()` passes on a closed day but `selectOption`,
  `getByRole(...).nth(1)` and `getByRole("combobox")` counts do not. To witness a hidden field,
  hold its `elementHandle()` across the collapse.
- Fixture switch `evoli_fixture_unbindable_day=<clientId>`: a draft with « Zercher Carry » on
  the LAST day (the only seeded unbindable is Legacy strength's day 1).
- Serial spec files (`coach-routine.spec.ts`) hide later reds behind the first: count
  "did not run" before declaring a file fixed.

Related: [[programme-frame-337f1-facts]], [[routine-draft-write-path-facts]].
