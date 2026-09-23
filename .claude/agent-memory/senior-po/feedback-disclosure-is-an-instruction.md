---
name: feedback-disclosure-is-an-instruction
description: A guard's disclosure states what it DOES and how to find out anything else — never what it catches or misses, because both are totality claims
metadata:
  type: feedback
---

**A guard's disclosure states WHAT IT DOES — what it reads, when, at what configuration — and tells
the reader HOW TO FIND OUT ANYTHING ELSE. It never enumerates what it catches or what it misses.**
Both of those are **totality claims**.

The form that survived, from EV-214:

> *"it **READS** both channels of that element's own `background-image` … **once, at the default
> viewport**"* — then — *"a reader who needs to know whether a **new** mechanism is caught should
> **build it and run this limb**, not reason from a sentence here."*

**Why:** in that one file, **every** totality sentence was falsified within a sprint — four attempts,
four falsifications, by three different people (`::before` killed the first; the time and viewport
mutants killed the second *on the channel it named*). A sentence stating coverage is a liability; a
sentence stating a method is not.

**How to apply:** this **subsumes** the other AC rules rather than supplementing them — all of those
are repairs to totality claims, and a disclosure written as an instruction cannot make the error they
correct. **Write the ACs as checkable assertions
([[feedback-write-acs-against-the-real-surface]], [[feedback-mutant-independence]]); write the
DISCLOSURE as an honest description plus a method.** Different jobs.

⚠️ **The bar for a declared limit is unchanged and higher:** *"I could not construct one"* owes
**what was tried**. `senior-qa` singled out the `::before` disclosure as the one that made its card
*answerable*, because naming that `getComputedStyle(el, "::before")` closes it in one expression is
what distinguishes **a cheap gap declined** from **a true limit**.

📌 **Two smaller standards set the same day:** an **assertion message is executed code** — a diff
containing one is not "comment-only" and owes a re-run. And when a disclosure is wrong, **correct it
in every place it appears**; a half-fixed record reads as a fixed one.
