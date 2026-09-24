---
name: re-rooting-a-scan-can-narrow-it
description: Moving a guard's scan root from the rows to their container is not a pure widening; a row rendered outside the container drops out unless you pin "every row is inside it"
metadata:
  type: feedback
---

EV-253 moved the P-ADH C2 limbs in `qa/coach-adherence-property.spec.ts` from
`region.locator("li")` to the adherence `<ul>`. That catches anything between the rows
(BUG-231, BUG-218). It also LOSES something. An `li` rendered in the block after `</ul>`
was read by the old root as a ninth row (12 failed at `7bddb7a`). Under the new root it is
under no list and is read by nothing: the file was 27 passed with that bar painting 0.706.
The fix is one assertion in `expectOneListHoldingEveryRow`: the count of `li` in the BLOCK
equals the count in the list, plus exactly one list.

**Why:** "the new root contains the old one" holds only for the elements the old root
found INSIDE the new one. Reviewers ask whether re-rooting widened the scan. The honest
answer needs a construction the old root saw and the new one does not.

**How to apply:** when you change the root of any scan, build one construction that sits
under the OLD root but outside the NEW one. Run it against the new code with and without
a pin that restores it. Also, `BUG-218`'s `ul::after` is caught by `[content on ::after]`
on the `<ul>`. That entry reads the property that generates the box, not the box's colour
or width, so it also fires on a 0 px box.

Related: [[a-witness-does-not-choose-between-two-checks]],
[[a-fixture-without-the-shape-cannot-guard-it]].
