---
name: decision-adherence-paint-guard-post-parse
description: ADR 0024 (round 2, 2026-09-23) — the P-ADH paint guard tests computed background-image !== "none" and closes the Infinity% blind spot with Lina's [3,4,2] fixture row. (b) and (c) rejected, confirmed, not to be re-opened.
metadata:
  type: project
---

**Decision (EV-218 AC4, ADR 0024):** delete the inline `style`-attribute text denylist from
`b-fit-coach/qa/coach-adherence-property.spec.ts`; the clause becomes computed
`background-image !== "none"` on the element, `::before`, `::after` and **inspects no value text**.
Close the blind spot in the fixture: **Lina's last tuple `[2,4] → [3,4,2]` plus
`OVERVIEWS[LINA].adherenceThisWeek → {done:3, planned:4}`** — not a mid-series insert, because
`coachApi.fixture.ts:820` honours the `plannedSoFar` override **only on the last (partial) tuple**,
so a mid-series `[3,4,2]` is silently inert. Ratchet it with a **rendered** assertion
(`expect(rows.at(-1).rowText).toContain("3 / 4 sessions")`), not a source pin — a source pin does
not catch the world being dropped from the `WORLDS` table. A derived ratchet is unavailable:
`coachApi.fixture.ts:1` is `import "server-only"`.

**Rejected, confirmed by staff-engineer, do not re-open:**
- *A real CSS value parser over the attribute* — imports a second tokeniser; every divergence from
  Blink becomes a new evasion, so it **moves** the spelling problem into a dependency.
- *Keep the spelling list with an honest banner* — the answer that failed four times; spellings are
  unbounded, a list is finite.
- *A source lint over `src/`* — blind to stylesheet/dependency paint; different question.

**Why one row suffices:** `TraineeAdherenceWeeks.java:179-186` makes the day the unit, so
`done − plannedSoFar ≤ 1` and the reachable hazard ratios are exactly `{∞} ∪ {(n+1)/n}`. The family
is **bounded**; one paintable member covers it. If that API invariant changes, the argument
collapses — the cheapest of the three reversal triggers to trip, and it lives in `b-fit-api`.

**Named residual gap, handed to EV-216:** `content`, `::first-letter`, `::marker` each defeat the
post-decision guard in one line. `-webkit-box-reflect` is **unresolved, not absent**.

**Still open:** the geometry limb keeps a text matcher (`not.toMatch(/NaN|Infinity/i)`) that is
redundant on its own mutant and defeated by `calc(1 / 0 * 100%)` — a separate row.
(d) also contradicts **EV-218 AC1**'s "no new fixture" Given; senior-po to amend.

**How to apply:** the reusable rule — *enforce a render invariant post-parse with a predicate that
inspects no value text, and close a post-parse blind spot by adding the input that makes the hazard
visible, never by adding a pre-parse text matcher.* See [[finding-cssom-invalid-declarations]] and
[[feedback-probe-before-believing]].
