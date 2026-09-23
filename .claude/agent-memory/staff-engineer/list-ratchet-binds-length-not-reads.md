---
name: list-ratchet-binds-length-not-reads
description: "A pinned-count ratchet over a table of checks binds the table's LENGTH and its display NAMES, never what each entry actually reads — repoint one entry's property field and the guard is hollow while the count test stays green"
metadata:
  type: feedback
---

When a guard's coverage is a data table iterated by the read (`PAINT_CHANNELS`,
`SCHEMAS_EXPECTED`, any `X_EXPECTED = n`), the ratchet only proves the table still has `n`
rows with `n` distinct **labels**. It proves nothing about the `property` / `selector` /
`pseudo` field each row actually queries.

**Why:** measured on EV-216 (`qa/coach-adherence-property.spec.ts`, 2026-09-23). With the
`box-shadow: inset <pct>vw` bypass planted and **probed to be painting** (row "21 Sept 2026
| 2 / 4 sessions", blue 1.000 on every scanline), I changed ONE token — the entry named
`"box-shadow on its own box"` kept its name and had its `property` repointed to
`"background-image"`. Result: **17 passed, exit 0**, count test green, channel-name equality
green, empty-value check green, box-shadow no longer read at all. Deleting the entry and
lowering the count is the *disclosed* limit; this variant leaves the list looking complete to
the reader the disclosure is written for, which is strictly worse.
Corrupting an entry's `initial` instead fails **closed** (4 failed on clean code), so only
the name/property divergence is cheap.

**How to apply:** when reviewing any table-driven guard with a pinned count, run clause 8 on
the ratchet itself: delete an entry + lower the pin, then repoint an entry's read field while
keeping its name. Ask for two cheap assertions in the same test — each entry's `name` starts
with its `property`, and the `(property, pseudo)` pairs are unique — before accepting "the
covered channels are listed in exactly one place".
Related: [[defect-pattern-bound-that-does-not-bound]],
[[non-vacuity-counter-does-not-bind-a-second-picture]], [[self-confirming-enumeration]].
