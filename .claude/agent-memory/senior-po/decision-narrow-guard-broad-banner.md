---
name: decision-narrow-guard-broad-banner
description: EV-216 ruling — an enumerated denylist is an acceptable guard, but its narrowness must be visible; the property belongs in P-ADH, not restated in the guard
metadata:
  type: project
---

**A narrow guard is acceptable. A narrow guard wearing a broad banner is not.** Ruled on **EV-216**,
2026-09-23.

**Why:** `box-shadow: inset …vw` repainted a full bar beside *"2 / 4 sessions"* with 260 tests green
— EV-210's banner bans *"a picture that overstates"*, EV-214's predicate bans *"a background image"*,
and the escape lives in the gap. `staff-engineer`'s framing: *the mechanism named in the banner is
broader than the predicate it evaluates* — my own four-deviation rule
([[feedback-write-acs-against-the-real-surface]]) arriving from the engineering side.

**Two of my own rules pulled against each other**: *state the property, not the mechanism* argues for
a channel-independent ban; *every AC testable by QA without asking me* forbids an AC whose detector
does not exist. **The resolution is not to pick one — they are at different levels.** The property is
already stated once, in **P-ADH C2**, and does not need restating inside a guard. What a guard owes
is **not to imply it has achieved the property**.

**How to apply:** ship the enumerated ban; require the banner to state **the predicate actually
evaluated**; list covered channels in **exactly one place** so an omission is visible; and name the
**uncovered** ones with *what was tried*. Route the general detector to `architect` as a named open
question — and write that **no future row may cite the ruling as approval to build one**.

📌 **Also held here:** `<canvas>`/`<img>` stayed rejected even though two neighbouring shapes proved
real. **Neighbouring shapes being real is not evidence for a third** — that is the temptation the
no-witness rule exists to resist, and the pressure to fold them in is *higher* after a card like
this, not lower. See [[decision-reviewer-extension-does-not-block]].
