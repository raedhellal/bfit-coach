---
name: an-invalid-css-value-computes-to-none
description: A divide-by-zero gradient renders `Infinity%`, Chrome drops the declaration and computed reads say `none` — close it with a fixture row that parses, not an inline text read (ADR-0024)
metadata:
  type: project
---

Witnessed on EV-214 (b-fit-coach, `AdherenceSeries.tsx`, week rows of the adherence block):

- Lina — `background: linear-gradient(90deg, var(--blue-500) 100%, transparent 0%)` →
  computed `linear-gradient(90deg, rgb(79, 124, 255) 100%, rgba(0, 0, 0, 0) 0%)`.
- Ines — the same expression with `done / plannedSoFar = 1 / 0` →
  inline `…var(--blue-500) Infinity%…`, computed **`none`**.

`Infinity%` is not a valid `<length-percentage>`, so the `background` shorthand is
discarded at parse time and the element paints nothing.

**Why it matters:** a guard phrased as *"computed `background-image` is `none`"* is
**green** on the divide-by-zero shape and red only on the shape that happens to be valid
— i.e. it is weakest exactly where the renderer is most broken. The 1/0 case is not
benign either: the same renderer paints a flattering 100 % as soon as `plannedSoFar`
is 1 instead of 0, so the day of the week decides whether the guard binds.

**How to apply (SUPERSEDED 2026-09-23 by ADR-0024 / EV-218):** do NOT answer this with a
text read of the inline `style` attribute — that denylist was walked past four times by
re-spelling (`var()` hop, `--é-paint`, `linear-gradi\65 nt(`, `/*;*/`) and EV-218 deleted it.
Read only post-parse, test presence (`!== initial`) never value text, and close the blind spot
in the FIXTURE: give a world a row where the hazard expression yields a value that parses
(Lina `[3, 4, 2]` → 150 %). Related: [[a-picture-with-no-text-is-unassertable]],
[[a-rendered-ratchet-cannot-hold-an-unprinted-field]].
