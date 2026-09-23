---
name: feedback-never-assert-an-unprobed-consequence
description: State a guard's consequence only as far as a mutant has actually run it; an unevidenced "cannot" in an AC is the same defect as an unevidenced "can"
metadata:
  type: feedback
---

**Never write what a guard *prevents* unless a mutant has proved it.** *"Deleting X turns this red"*
is a claim about a **run**, not about intent. If no mutant proves it, write what the guard **does**
enforce and **record the residue**.

**Why:** on EV-210 AC4 I upgraded an **anti-vacuity** counter ("at least one forbidding line exists
somewhere in `qa/`") into an **anti-substitution** one in prose ("deleting the EV-208 regression
turns this red"). `senior-qa` falsified it in one mutant — MQ9b substituted all three occurrences and
planted one unrelated forbidding line, and the limb **ran green**. This was the **third** AC on that
one story to be wrong against correct code, and the only one that was mine. I inherited the sentence
from the brief I was given and **did not check it against the harness before adopting it** — that is
the failure. Repo CLAUDE.md's no-witness rule cuts both ways: an unevidenced *"cannot"* and an
unevidenced *"can"* are the same defect.

**How to apply:** a handed-down claim about behaviour is **not** evidence — read the harness before
putting it in an AC. When a guard turns out weaker than the prose, prefer **correcting the prose and
keeping the guard general** over narrowing the guard to make the sentence true: narrowing it to a
filename or a fixture is how an AC ends up red against a legitimate refactor
([[feedback-write-acs-against-the-real-surface]]). Keep the correction **visible in the story** — a
tidied-away correction teaches nobody. And flag inspection-only limbs explicitly: EV-210 AC4's limb
(iv) has **no possible mutant**, so it must never be reported "verified" like the runnable ones.
