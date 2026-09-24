---
name: decision-missed-flags-late-not-early
description: EV-252 rulings — a missed flag may be late but never early; the store-nothing interim was rejected because it degrades France; storing a trainee's zone is Raed's personal-data call
metadata:
  type: project
---

**A missed-session flag may fire late, but never early.** An early flag is a false statement about a
person (P-ADH). Ruled 2026-09-24 on EV-252 (ADR-0025 D25.6).

**Why the store-nothing interim was rejected:** "a day is over once it has ended everywhere" never
fires early, but the ADR measured it at ~14 h late for France against 2 h today. It would fix the
west-of-UTC minority (including the French Antilles) by making the main market much worse. A safe-
looking interim still has to be checked for who it makes worse off.

**Storing new personal data goes to Raed**, even when I think it's clearly proportionate. For
`users.time_zone` I recommended yes: coarse, already sent on every request, never shown to the coach,
erased with the account. If he says no, the fallback ships with France's delay recorded as a known cost.

**How to apply:** when a fix trades timeliness against a false statement, prefer late-and-true. When
a fix adds data about a person, name the data, give a recommendation, and put the decision in Raed's
column (`Blocked / needs decision`). The board's tags don't work on this instance (every tag call
fails silently), so that sprint column **is** his queue; lead the card's description with
"DECISION NEEDED FROM RAED: …".

**While an ADR is under challenge:** give product answers to its product questions as input (EV-250:
a session belongs to the day it **started**), but don't reword ACs that depend on decisions still
being tested. See [[feedback-decision-acs-must-not-bind-other-acs]].

**Refined 2026-09-24 (ADR-0025 round 2), option (a):** the rule is now **"never early by the clock the
trainee last gave us; with no current word from them (zone refused, or unseen 72 h), wait until the day
has ended everywhere."** "Never early" was too absolute; I hadn't considered travel. Accepted residual:
a trainee who flies west and doesn't open the app can be flagged early by up to the move (6 h
Paris to New York). It's disclosed and tested (AC2b). The strict option costs every French trainee ~12 h
every day.

**The general lesson:** when my own rule turns out to be stated as a universal I can't guarantee,
**refine the rule openly** rather than quietly accepting an exception. Distinguish "early because we
used a clock we knew was wrong" (a defect) from "early because reality changed and the person hasn't
told us" (a bounded, disclosed limit).
