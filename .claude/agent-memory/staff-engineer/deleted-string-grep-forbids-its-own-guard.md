---
name: deleted-string-grep-forbids-its-own-guard
description: A DoD line of the form `grep -r "<deleted string>" src qa` returns nothing is unsatisfiable — the regression guard and the "why it was deleted" comment must both name the string; grep the build output instead
metadata:
  type: feedback
---

When a story deletes a user-visible string, do **not** accept (or let `senior-po` write)
a Definition of Done line of the shape
`grep -r "<the deleted string>" src qa` **returns nothing**.

**Why:** the only assertion that can catch the string coming back is a negative one
(`await expect(page.getByText("<string>")).toHaveCount(0)`), and it must spell the string
out to be a guard at all. The javadoc that stops a future author re-adding it must spell
it out too. A literal source grep therefore forbids exactly the two artefacts that protect
the deletion, and as a CI check it would fail on its own guards. Seen on EV-208
(b-fit-coach, 2026-09-22): six residual hits, all comments or `toHaveCount(0)` guards.

**How to apply:** the product claim is about what is *served*, so demand two greps instead:

- `grep -rn "<copyKey>" src qa` → nothing (the key is gone from `copy.ts`), and
- `grep -rl "<the deleted string>" .next` → **0 files** after `npm run build`.

The `.next` grep is meaningful on this repo — server-component copy does land in the build
output (EV-208's two *new* sentences each showed 2 `.next` hits), so a comment cannot
satisfy it and a rendered string cannot escape it. It is the one of the two that is safe
to automate in CI.

Related: [[bar-and-its-own-label-disagree]], [[defect-pattern-bound-that-does-not-bound]].
