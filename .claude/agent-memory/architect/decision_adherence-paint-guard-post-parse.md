---
name: decision-adherence-paint-guard-post-parse
description: ADR 0024 (ACCEPTED, corrected 2026-09-23) — the P-ADH paint guard tests computed background-image !== "none" and closes the Infinity% blind spot with Lina's [3,4,2] fixture row. (b) and (c) rejected, confirmed, not to be re-opened.
metadata:
  type: project
---

**Decision (EV-218 AC4, ADR 0024):** delete the inline `style`-attribute text denylist from
`b-fit-coach/qa/coach-adherence-property.spec.ts`; the clause becomes computed
`background-image !== "none"` on the element, `::before`, `::after` and **inspects no value text**.
Close the blind spot in the fixture: **Lina's last tuple `[2,4] → [3,4,2]` plus
`OVERVIEWS[LINA].adherenceThisWeek → {done:3, planned:4}`** — not a mid-series insert, because
`coachApi.fixture.ts:820` honours the `plannedSoFar` override **only on the last (partial) tuple**,
so a mid-series `[3,4,2]` is silently inert. **The ratchet is three assertions** (as shipped on
EV-218 `71b9e39`): `currentWeek: "3 / 4 sessions"` in the `WORLDS` loop (render path only — a
dropped or swapped third element still prints 3 / 4); a **separate test outside the loop** pinning
Lina's `WORLDS` membership and her last source tuple `[3,4,2]`; and the monitoring tile test. My
round-2 claim that one rendered assertion bound all three was wrong. A derived ratchet is
unavailable: `coachApi.fixture.ts:1` is `import "server-only"`.

**Rejected, confirmed by staff-engineer, do not re-open:**
- *A real CSS value parser over the attribute* — imports a second tokeniser; every divergence from
  Blink becomes a new evasion, so it **moves** the spelling problem into a dependency.
- *Keep the spelling list with an honest banner* — the answer that failed four times; spellings are
  unbounded, a list is finite.
- *A source lint over `src/`* — blind to stylesheet/dependency paint; different question.

**Why one row suffices (the argument that holds):** the renderer is one expression; on any row with
`plannedSoFar >= 1` and `done > plannedSoFar` it yields a finite percentage, which parses. No bound on
the ratio family is needed. 🔴 My round-2 argument — `done − plannedSoFar ≤ 1`, family
`{∞} ∪ {(n+1)/n}` — was **false**: `LogWorkoutCompletionUseCase.complete` accepts a future
`request.getDate()` with no check and `adherenceWeeks` reads Monday–Sunday, so future-dated
completions count in `done` but not `plannedSoFar`. My own reversal trigger 3 **fired on first
inspection** (traced in source, not reproduced end to end). Product question sent to senior-po.

**The pin is load-bearing:** without Lina's stated `plannedSoFar`, it is derived as
`min(planned, elapsed)` = 0 every Monday, and the paint limb goes entirely green (implementer's
clause-8 run). The guard's binding would depend on the calendar.

**Residual gap (state at `969519c`):** `content` and `::first-letter` are IN `PAINT_CHANNELS`
(EV-216); `::marker` "could not construct one"; `-webkit-box-reflect` unresolved, not absent. The
spec's `PAINT_CHANNELS` list is the authority, not the ADR.

**Still open:** the geometry limb keeps a text matcher (`not.toMatch(/NaN|Infinity/i)`) that is
redundant on its own mutant and defeated by `calc(1 / 0 * 100%)` — a separate row.
(d) also contradicts **EV-218 AC1**'s "no new fixture" Given; senior-po to amend. Ines has **no C3
test** — she keeps EV-210b AC3 coverage, which asserts C2; never write "Ines keeps C3".

**How to apply:** the reusable rule — *enforce a render invariant post-parse with a predicate that
inspects no value text, and close a post-parse blind spot by adding the input that makes the hazard
visible, never by adding a pre-parse text matcher.* See [[finding-cssom-invalid-declarations]] and
[[feedback-probe-before-believing]].
