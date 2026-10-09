---
name: defect-class-check-shaped-to-its-mutant
description: A spec check added to kill one surviving mutant often kills only that mutant's literal shape; re-probe with the realistic variant (EV-337j2 photo-placeholder scan)
metadata:
  type: project
---

When an engineer reports "mutant Mx survived, I added a check, now Mx is red", the new check is
usually fitted to Mx's exact DOM/shape. Probe it with the **realistic** form of the same defect,
not Mx again.

**Why:** EV-337j2 (b-fit-coach `/recipes`, tip 44ddd74, 2026-10-09). M7b (a bare 44x44 grey div in
each row) survived J2.3's "no photo placeholder" check, so the engineer added a blank-box scan —
restricted to LEAF elements (`el.children.length === 0`). The natural placeholder shape, a tinted
tile holding an aria-hidden icon, is not a leaf: it passed J2.3 and J2.1 16/16. Dropping the leaf
condition kept the unmutated baseline green and killed both the tile and M7b 4/4 — a one-line fix.
The other late fix on the same branch (M5, exact `textContent` instead of `toHaveText`, which
collapses NBSP) was sound: it binds on the literal the AC states.

**How to apply:** for each "added a check after a survivor", write one variant mutant that a real
designer/engineer would produce (icon inside the box, wrapper element, pseudo-element, different
property) and run it with the baseline first ([[review-sabotage-harness-must-self-check]]). Then
probe the proposed loosening against the baseline so the fix you recommend is not brittle.
Same family as [[defect-class-weak-controls]] and [[defect-class-assertion-on-the-wrong-node]].
