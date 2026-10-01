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
- **Every whole-number field reads through `readNumber` (`src/lib/numberInput.ts`)**
  since `fix/portal-number-input-followups`: `parseTarget` (targets, nutrition templates)
  and `parseWhole` (recipe kcal/macros) both map its kinds. Grouping spaces: U+0020,
  U+00A0, U+202F, U+2009, U+2007, between thousand groups only. `^\d{1,3}[.,]\d{3}$`
  ("1.000", "1,500", "150.000") is `thousands` → refused by BOTH, never 1 or 1000
  (BUG-460 and its dot twin). Targets: decimal → `notWhole` ("sans décimales"); digits
  that fit no reading ("18 00", "1 25") → `malformed` → `numberFormat` ("par exemple
  1 800", BUG-552); "supérieur à 0" ONLY for empty/zero/negative/no digit. The card
  shows one sentence for four fields via `targetRefusal` (invalid > malformed >
  notWhole). Recipes: a comma is a decimal like the point (BUG-553: "1200,5" → "Utilisez
  1200 ou 1201", "50,0" → 50); unreadable digits ("18 00") are `malformed` →
  `recipes.numberFormat(example)` (1800 for kcal, 150 for grams — an example inside the
  field's range), never `numberRange`.
- **Quantities read through `readNumber` too** since `fix/portal-number-input-tail`
  (BUG-556): `readQuantity` → empty / quantity / malformed / outOfRange; `parseQuantity`
  is its number-or-null wrapper. "1 000" g is 1000; `thousands` and a 3rd decimal stay
  `outOfRange` (the range sentence, which is true for them); unreadable digits get
  `recipes.quantityFormat`. The ENGLISH example must never be "1,000" — the portal
  refuses it; a spec asserts each example sentence's numbers parse.
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
