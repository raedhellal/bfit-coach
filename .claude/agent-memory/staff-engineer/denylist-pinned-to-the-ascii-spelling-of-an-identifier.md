---
name: denylist-pinned-to-the-ascii-spelling-of-an-identifier
description: A regex denylist that names an identifier with [A-Za-z0-9_-]+ or anchors on (^|;)\s* is escaped by a non-ASCII name and by a CSS comment — same mechanism, same row, one character wider
metadata:
  type: feedback
---

EV-215 (`b-fit-coach`, `qa/coach-adherence-property.spec.ts`) closed EV-214's `var()` hop with
`/(^|;)\s*--[A-Za-z0-9_-]+\s*:[^;]*(gradient\(|url\(|image-set\(|element\()/i`. Its own AC3 mutant
still walks past it two ways, both constructed and run, both **total** (Ines's `1 / 0` row green on
all five reads):

- **`--é-paint`** instead of `--adh-paint`. CSS idents allow non-ASCII; Chrome paints it (verified:
  Lina's row went red on `PAINTS … on its own box`). `[A-Za-z0-9_-]+` does not match `é`, and the
  anchor forbids restarting later in the string.
- **`background-image:var(--p);/*x*/--p:linear-gradient(…)`**. The `(^|;)\s*` anchor does not admit
  a comment, and a declaration list in a `style` attribute may contain one.

Dropping both the anchor and the name charset — `/--[^:;]*:[^;]*(gradient\(|url\(|image-set\(|element\()/i` —
kills both and is **260 green on clean code** (I ran all three).

**Why:** the doc comment said *"a custom property declared in the same inline attribute"*; the
predicate said *"a custom property whose name is ASCII and is not preceded by a comment"*. The gap
between the sentence and the predicate is where the next renderer lives — the same shape as
[[paint-channel-siblings-escape-a-property-ban]] one row earlier.

**How to apply:** on any regex denylist over source or attribute TEXT, attack (1) the **charset of
any identifier it names** (non-ASCII, escaped, uppercase), (2) any **anchor** it uses (a comment, a
quoted `;`, leading junk), before (3) the value list. Ask whether the anchor buys anything: here it
bought nothing, because no honest row declares a custom property inline at all — so the simplest
pattern was also the strongest. Related: [[guard-pinned-to-one-syntactic-form]],
[[enumeration-free-detector-by-character-class]].
