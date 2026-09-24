---
name: a-witness-does-not-choose-between-two-checks
description: The bug's own witness is red on several check designs; a design choice (e.g. an unfiltered text read) needs its own mutant that only it catches, isolated from other limbs
metadata:
  type: feedback
---

The witness a bug row gives you is red on the check you write, and usually on its weaker
variants too, so it does not justify any particular choice in the check. On EV-251 (a
week row's text must equal copy + fixture), the BUG-227 `█` bar was red on the unfiltered
text read AND on a `trim()`-filtered one. What separated them was a bar of `U+00A0`
spaces drawn by an underline (paints 0.262), which the filtered read drops.

The isolation pitfall: the first NBSP bar was also killed by the EV-210b geometry limb,
because `renderedWeeks` treats a leaf whose TRIMMED text is empty as a picture and
measures it. That is two clauses, so it proves neither. Adding an empty `<i />` child made the span a
non-leaf. The geometry limb then skips it, and EV-251 alone went red (5 failed / 285).

**Why:** reviewers hold "a mutant killed by two clauses shows neither is needed", and "why
is it unfiltered / exact / fixture-derived?" is answered only by a run where the other
design goes green.

**How to apply:** for each non-obvious choice in a new check, mutate the CHECK (apply the
weaker design) against a renderer mutant built to exploit exactly that choice, and
confirm on the whole gate that nothing else kills it. Probe that it paints first
([[a-paint-probe-must-sample-where-the-channel-paints]]). Also break the check's oracle
on clean code to prove the rows are compared at all ([[a-fixture-without-the-shape-cannot-guard-it]]).
