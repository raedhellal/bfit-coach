---
name: a-false-reason-for-a-boundary-is-worse-than-none
description: When a guard says what it does not cover, the REASON is a capability claim and gets checked like one — a wrong reason stops the next person from ever trying the construction
metadata:
  type: feedback
---

A disclosure that names a scope boundary must give the **true** reason for it. Stating a
boundary is free; explaining it with a claim about what is *impossible* is a capability
claim, and it owes a witness exactly like any other.

**Why:** EV-216. `qa/coach-adherence-property.spec.ts` had carried, since EV-214, *"a
flat `background-color` is untouched (a colour cannot encode a ratio positionally; only
an image can)"*. The boundary was a fine scope call. The parenthetical was false — **the
ratio can live in the BOX rather than the paint**:
`::first-letter { padding-right: <ratio>vw; background-color: … }` paints a proportional
bar with no image function anywhere, 1.000 of the row width beside "2 / 4 sessions", and
the guard is green on it. Eight capability sentences in that one file have now been
falsified by the next person to try one. The cost of the wrong reason is specific: **a
reader who trusts it never attempts the construction**, so the sentence protects the gap
it describes.

**How to apply:**
- Write boundaries as *"not covered — scope decision, owned by X"*, never as *"not
  covered because it is impossible"*, unless the impossibility has a trace.
- If you do give a mechanism-level reason, construct the counterexample first and fail to
  build it. *"I could not construct one"* is the honest third answer.
- Replay a reported escape yourself before writing prose about it, even when the numbers
  arrive from a reviewer who ran it — the sentence carries your name once it is in the
  file.
- The boundary itself usually survives the correction. Fix the reason, keep the scope,
  card the mechanism.

Related: [[a-paint-probe-must-sample-where-the-channel-paints]],
[[a-paint-channel-list-is-data-not-three-reads]], [[copy-for-a-capability-that-does-not-exist]].
