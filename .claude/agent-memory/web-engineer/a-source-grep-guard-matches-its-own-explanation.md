---
name: a-source-grep-guard-matches-its-own-explanation
description: A test that greps a source file for a literal will match the javadoc that explains the literal — strip comments first, and beware substring anchors that also match a declaration
metadata:
  type: project
---

A guard that reads a file from `src/` and asserts a string is present (or absent) has
three failure modes that all look like protection, and all three were witnessed in one
afternoon on EV-210b by mutating the thing they claimed to protect.

1. **It matches the comment that documents the thing.** The fixture's javadoc quoted the
   tuple it was seeding (`` `[1, 3, 0]` ``); deleting the tuple from the code left the
   guard **green**. A guard reading its own documentation back. Strip comments first —
   `.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")`.
2. **A `split` on an entry key gives you the rest of the file.** `[X_ID]: () => ({`
   appears in both `BASE_OVERVIEWS` and `PROGRESS`, and the slice starting at the first
   one runs to EOF and contains *everybody else's* data. "the part that contains
   `adherenceSeries(`" therefore found Lina's series and went red on correct code.
   Anchor on the part whose call comes **before the next entry key**.
3. **A substring anchor matches the declaration too.** `adherenceSeries(` matches
   `function adherenceSeries(specs…)` several hundred lines earlier; `adherenceSeries([`
   matches only call sites.

**The banned-string variant.** A scan for a forbidden sentence (EV-210 AC4's
`"No sessions in the last 8 weeks"`) must exempt comments — the javadoc recording *why*
it was deleted is the thing that stops it coming back — and in `qa/` must allow it only
on lines that assert its absence, with a **counter that at least one such assertion still
exists**, or deleting the regression makes the scan pass. Write the needle as a
`join(" ")` of two halves so the scanner is not an exception to its own rule.

Related: [[a-picture-with-no-text-is-unassertable]], [[a-card-located-by-its-text-asserts-nothing]].
