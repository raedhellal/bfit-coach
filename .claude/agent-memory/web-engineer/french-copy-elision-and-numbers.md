---
name: french-copy-elision-and-numbers
description: b-fit-coach French copy — de()/que() elision helper and the sweep that pins it, h left alone on purpose, parseTarget for French-typed whole numbers, the display-name fixture switch, and Next's route announcer being a role=alert
metadata:
  type: project
---

Since `fix/portal-french-polish-1001` (2026-10-01, PB-2/PB-4/PB-5 of the EV-273b gate):

- **Never write `de ${name}` or `que ${name}` in `copy.fr.ts`.** Use `de(x)` / `que(x)`,
  exported from `copy.fr.ts`, which give "d'Inès" / "qu'Omar". The rule is the first
  letter without its accent or case: a vowel, Æ/Œ, or Y before a consonant (d'Yves,
  but de Yusuf). **H is deliberately NOT elided** ("de Hugo"): mute and aspirated h are
  spelt alike, and "d'Hamid" would be worse. If Raed rules otherwise, it needs a word
  list, not a letter rule.
- `qa/french-polish.spec.ts` sweeps EVERY function in `fr`, once per argument position
  with "Inès" there, and pins the positions that are allowed to hit: dates, numbers and
  weekdays ("le 8 oct.", "de 0 à 5000", "le lundi"). The list is exact, so adding a copy
  function with a date or weekday argument after "le"/"de" means adding it there, with
  the reason.
- **Whole-number targets go through `parseTarget` (`src/lib/numberInput.ts`).** It accepts
  a space, U+00A0 or U+202F between thousand groups only ("1 800" yes, "18 00" no). A
  decimal part after "." OR "," is `notWhole` → "Saisissez un nombre entier, sans
  décimales." "1,000" is ALWAYS `notWhole`, never 1 or 1000 (BUG-460). `parseWhole`
  (recipe macros) reads the same grouping; quantities keep comma-as-decimal.
- `weekFailed(first, applyLabel)` quotes the week card's button via `weekApplyLabel`
  (exported from `NutritionWeekCard`). Never rebuild a button label in a sentence.
- **Fixture switch `evoli_fixture_display_name=<clientId>:<encodeURIComponent(name)>`**
  serves a link under another name on the roster, overview and nutrition reads, for one
  browser context. Use it to get a vowel-initial client onto the populated roster
  instead of adding a seventh row that every roster-count and picker spec would absorb.
- **`page.getByRole("alert")` is ambiguous on every page:** Next's
  `#__next-route-announcer__` is an empty `role=alert`. Scope it, e.g.
  `page.locator('p[role="alert"]')`.
- The `\uXXXX`-lands-literally problem ([[unicode-escapes-in-written-source]]) happened
  again on this branch, including a U+0301 in a test string. Scan after every Write.

See [[stories-carry-verbatim-copy]] before rewording any sentence an AC quotes.
