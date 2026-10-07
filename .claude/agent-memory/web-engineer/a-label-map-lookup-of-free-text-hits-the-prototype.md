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
