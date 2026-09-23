---
name: an-inline-denylist-is-one-var-hop-wide
description: HISTORY — the inline-style text denylist was walked past by var() hops and re-spellings four times; EV-218 deleted it for a post-parse read plus a fixture row
metadata:
  type: project
---

🔴 **SUPERSEDED 2026-09-23 (EV-218, ADR-0024): both inline patterns described below were
DELETED.** The guard now reads computed values only and the blind spot is closed by Lina's
`[3, 4, 2]` fixture row. Kept as the record of why a text denylist fails: every escape here
was a re-spelling, and spellings are unbounded.

`qa/coach-adherence-property.spec.ts` read a week row's paint on four channels. Two of
them are text patterns over the inline `style` attribute, and a text pattern is **one
`var()` hop wide**:

```
--adh-paint: linear-gradient(90deg, var(--blue-500) 100%, transparent 0%);
background-image: var(--adh-paint)
```

puts no image function in any `background` value. On its own that is **partial** — the
computed read still catches the half that paints. **Combined with the `Infinity%` shape**
(`done / plannedSoFar` on a fixture row seeded `1 / 3 / 0` — see
[[done-can-exceed-plannedsofar]]) it is **total**: Chrome discards the invalid gradient, so
`getComputedStyle(...).backgroundImage` is `none` on all three boxes at the same instant
the attribute holds no image function.

🔴 **And the pattern that closes it is itself escapable if it pins the SPELLING.** My first
cut, `/(^|;)\s*--[A-Za-z0-9_-]+\s*:…/`, was walked past by the same mutant with cosmetics
changed, twice, at the EV-215 gate:
- **`--é-paint`** — CSS idents allow non-ASCII, `[A-Za-z0-9_-]+` does not. Ines green, a
  total escape, and Chrome genuinely paints it (the valid rows went red on their own box).
- **`/*comment*/` before the declaration**, defeating the `(^|;)\s*` anchor.

What works is `/--[^:;]*:[^;]*(gradient\(|url\(|image-set\(|element\()/i` — no anchor, no
name charset. `[^:;]*` is the whole safety: it cannot cross the `;` ending a declaration or
the `:` starting a value, so a `--` inside another property's value cannot reach a later
colon.

🔴 **And `[^:;]*` is a FALSE-POSITIVE argument only.** It does not carry in the
false-negative direction: a `;` inside a comment or a string does not end a declaration, so
`--adh-paint:/*;*/linear-gradient(…)` escapes — the parser sees no `;`, the regex sees one.
Same family as `linear-gradi\65 nt(` (a CSS ident escape Chrome tokenises and paints, which
walks past the `background`-value pattern too, unchanged since EV-214). Both are the reach of
a **text denylist**, carded to EV-216, deliberately not widened here.

**How to apply:**
- In a text-over-CSS guard, match **structure** (`--`, a colon, a value naming an image
  function, inside one declaration) and never an identifier's characters.
- Check the false-positive direction **by cause**, not by a green suite: `grep -rn '\["--' src/`
  returns 0 — the only `--…` strings in `src/` are the two next/font variables, applied as a
  **className** on `<html>` and never inline, naming no image function, and there is no
  `setProperty` and no `dangerouslySetInnerHTML` anywhere in `src/`.
- **Still open and disclosed, not fixed:** a custom property declared on an ANCESTOR (the
  `<ul>` above the rows) and spent inside a row. The scan is `li` plus descendants, so no
  attribute read holds the declaration; reaching it means the ancestor chain or a real
  resolver, which is a `senior-po` decision.
- **`inspected` counts elements, not channels** — deleting the `::after` read left the suite
  260 green until a per-element `toEqual(["its own box", "::before", "::after"])` ratchet was
  added. Any list of things a guard reads needs a deletion to trip something.
- **Per-clause attribution is the standard here** (witness-rule clause 4): two clauses
  killing the same mutant shows neither is needed. If you cannot isolate a mutant by
  construction, disable that clause alone and show the flip — that counterfactual IS the
  evidence.
- Related: [[getcomputedstyle-takes-a-second-argument]],
  [[a-fixture-without-the-shape-cannot-guard-it]].
