---
name: feedback-never-justify-scope-with-a-capability
description: State exclusions as cost/ownership/risk/priority decisions — never as what the system can or cannot do; a false "cannot" suppresses the experiment that would expose it
metadata:
  type: feedback
---

**A scope decision needs no justification beyond being a decision.** State why something is out of
scope in terms of **cost, ownership, risk or priority** — **never** in terms of what the system *can*
or *cannot* do, unless that claim has a witness. **An exclusion justified by a capability is two
claims, and only one of them is mine to make.**

**Why:** EV-214 excluded `background-color` — **rightly**, because banning colour would fail against
honest styling. I added *"a flat colour cannot encode a ratio positionally; only an image can."*
`staff-engineer` falsified it: put the ratio in the **box** (`padding-right: var(--ratio-vw)` on a
`::first-letter`) and a flat colour fills it — **`1.000` beside "2 / 4 sessions", no image function
anywhere, guard green.** The boundary was fine; the invented reason was false.

🔴 **The harm is specific, not cosmetic: a reader who trusts the sentence never tries the
construction.** A false *"cannot"* does not merely sit there being wrong — **it suppresses the
experiment that would expose it.** That is why this one survived longest: **eighth falsified
capability claim in that file, and the first inherited across three rows without being re-read** — it
shipped in EV-214 and survived EV-215, EV-216's implementation and two review rounds. The seven before
it died within a sprint.

**How to apply:** ✅ *"Out of scope: banning colour would fail against honest styling."* ❌ *"Out of
scope: a colour cannot draw a ratio."* And: **when a disclosure is INHERITED into a new row, re-read
it against [[feedback-disclosure-is-an-instruction]] before relying on it — inheritance is not
review.** A disclosure written as an *instruction* has no capability claim to be wrong about.
