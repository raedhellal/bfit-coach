---
name: a-paint-channel-list-is-data-not-three-reads
description: The adherence guard's covered CSS paint channels are one table (PAINT_CHANNELS) read with getPropertyValue, ratcheted by a count — hand-written reads shrink silently
metadata:
  type: project
---

`qa/coach-adherence-property.spec.ts` guards P-ADH C2 by reading CSS channels a
proportional bar can be painted through **with no layout box** — the geometric limbs
above it cannot see those at all. EV-214 hand-wrote three `backgroundImage` reads;
EV-216 turned the set into **data**, and `senior-po` named the model: the guard reads a
**(box × property) matrix**, and EV-215 extended the box axis while EV-216 extended the
property axis — *one enumeration, short on both*. `PAINT_CHANNELS` is
`{name, property, pseudo, initial}` over (`background-image`, `box-shadow`,
`border-image-source`, `mask-image`, `content`) × (own box, `::before`, `::after`), plus
`background-image` on `::first-letter`.

**It is SPARSE on purpose.** A cell is present when the property can paint on that box
**and somebody showed it**, never on symmetry: on `::first-letter`, `box-shadow` and
`border-image-source` compute a non-initial value and paint nothing, and `mask-image` is
dropped entirely — entries for those would ban a declaration that cannot paint. And
`content` is the reason per-entry `initial` exists: it computes to `normal` on the own
box and `none` on the pseudos.

Three things that make it a guard rather than a list:

- 🔴 **When a property has a prefixed and an unprefixed spelling, read BOTH and
  enumerate the one that returns a value.** `getPropertyValue("mask-border-source")` is
  `""` in this Chromium — an entry naming it would be listed and never read — while
  `-webkit-mask-box-image-source` returns the gradient and is a live paint channel
  (a flat background colour revealed to the ratio: no image function anywhere, whole
  suite green). This is *not* the adversarial-spelling question: a prefix is the
  platform's two names for one implementation, so the set is bounded by reading it.
- **Read with `getPropertyValue("kebab-case")`, not the camelCase accessor.** An
  accessor a browser does not implement is `undefined` and reads as a channel that
  silently stopped checking; `getPropertyValue` returns `""`, and `""` is asserted
  against, so a channel that is not a real read goes **red**. (Verified in this repo's
  Chromium: `box-shadow`, `border-image-source` and `mask-image` all report `none`
  unprefixed, on the own box and on both pseudos.)
- **Compare to a per-entry `initial`, not to the literal `"none"`.** That is what lets
  a channel with a different initial be added in one line.
- **Pin the count** (`PAINT_CHANNELS_EXPECTED`). Once the loop iterates the table, the
  old per-element ratchet no longer catches a deletion — deleting an entry deletes it
  from both sides. Same reason `SCHEMAS_EXPECTED` is pinned in `contract-drift.spec.ts`.

`getComputedStyle(el, channel.pseudo)` with `pseudo: null` is the own box, so one call
site covers all three boxes. Pass the table into `evaluateAll(fn, PAINT_CHANNELS)` — it
serialises fine.

Related: [[a-picture-with-no-text-is-unassertable]],
[[a-fixture-without-the-shape-cannot-guard-it]].
