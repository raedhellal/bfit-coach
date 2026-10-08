---
name: a-label-map-lookup-of-free-text-hits-the-prototype
description: `labels[value] ?? value` over a trainee's typed text returns Object.prototype's function for "constructor"; use an own-property check (BUG-694 dietValueLabel)
metadata:
  type: project
---

The portal's enum-label maps (`ruleLabels`, catalogue maps) are looked up as
`copy.x.labels[value] ?? value`. That is safe for an api ENUM, and wrong for FREE TEXT: a
trainee who types "constructor" or "toString" gets `Object.prototype`'s function back, not
the fallback. Witnessed 2026-10-07 on `fix/bug694-diet-preset-labels`: under the mutant
`labels[value] ?? value` the spec's lookup returned `[Function Object]`.

**Why:** BUG-694 maps the trainee app's preset allergies/dislikes (stored as English labels,
`b-fit-mobile` `prefsVocabulary.ts`) while typed values pass through unchanged, so the input
is user text by design.

**How to apply:** any map from a stored string that a USER can type → label goes through
`src/lib/dietValueLabel.ts` (own-property check) or the same pattern. Give such maps literal
keys in `copy.ts` (not `as Record<string, string>`), so `fr … satisfies Copy` refuses a missing
preset at compile time. Two values can then print the same text (a typed « Arachides » beside
the preset "Peanuts"), so a list keyed by value warns about duplicate keys — key by index.

**A label map whose English value equals its key is a smell (BUG-706, 2026-10-08).**
`ruleLabels` read `{ HALAL: "HALAL", KOSHER: "KOSHER" }` under a comment saying English
"shows the token as it always has"; QA read that as deliberate. The trainee app's `en.json`
(`nutrition.prefs.rule.*`) says "Halal" / "Kosher", so the English portal was printing the
stored enum. Before trusting such a map, diff it against `b-fit-mobile`
`src/i18n/locales/{en,fr}.json` at hub `origin/main` (`git show`, never the live checkout),
and pin the app's labels as literals in the spec. `ruleLabels` is literal-keyed now and goes
through `dietValueLabel` too. A spec of a printed label reads BOTH `allInnerTexts()` and
`allTextContents()`: a CSS `text-transform` passes a textContent read. Changing an English label so it EQUALS the French one trips `qa/coach-i18n.spec.ts`'s
identical-string guard (it named `nutrition.ruleLabels.HALAL`): add the key to `SAME_IN_BOTH`
with the app dictionaries as the reason, in the same commit.
