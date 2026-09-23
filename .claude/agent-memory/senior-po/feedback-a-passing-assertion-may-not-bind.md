---
name: feedback-a-passing-assertion-may-not-bind
description: asText() is a coercion not a read — assert shape before value, and treat a green assertion as evidence of nothing until a mutant kills it
metadata:
  type: feedback
---

**A green assertion is evidence of nothing until a mutant has killed it.** The sharpest instance, from
BUG-211's QA round: `assertThat(stored.path("summary").asText()).isNotBlank()` **passed when the datum
was absent**, because **`NullNode.asText()` returns the four-character string `"null"`**, which is not
blank. It read as protection for years and never bound.

**Why:** `asText()` is a **coercion, not a read** — an assertion over a coercing accessor tests **the
coercion**, not the datum. `path(…).asText()` has a value for *absent* that is indistinguishable from
a value for *present*. This is [[feedback-write-acs-against-the-real-surface]]'s clause 1 one layer
in: the "surface" is the **accessor**.

**How to apply:** assert the **shape** first (`isMissingNode`, `isNull`, `hasNonNull`), then the
value. And copy the follow-through, which is the part that matters: QA did not stop at restoring the
assertion — it asked how the **replacement** could be decorative in a **second** way and killed four
more mutants, including a **non-null placeholder** and a **different positive integer** where the old
assertion was `isPositive()`. **Fixing the assertion that failed is not the job; the job is asking how
the NEW assertion could fail to bind.**

⚠️ **This is the same defect as the nine guards, one layer further in** — a thing that looks like a
check, inside a test that looks complete. Second appearance at a new depth in one sprint, which is
why it is structural and not bad luck.
