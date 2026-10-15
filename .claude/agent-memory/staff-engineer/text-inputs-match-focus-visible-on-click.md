---
name: text-inputs-match-focus-visible-on-click
description: A text/search input matches :focus-visible on a MOUSE click in Chromium and WebKit, so `:has(input:focus-visible)` cannot separate keyboard from pointer focus on a text field
metadata:
  type: feedback
---

Do not recommend `:focus-visible` (or `:has(input:focus-visible)`) as a way to style only KEYBOARD focus
on a text-like input. Browsers' heuristic matches `:focus-visible` for any input that accepts typing,
however it was focused.

**Why:** in the EV-337j2 review (b-fit-coach, 2026-10-09) my round-1 nit N1 told the engineer to swap
`.rcp-search:focus-within { box-shadow: none }` for `.rcp-search:has(input:focus-visible)` "so pointer
focus keeps its halo". The engineer measured it, and my own probe at ab96099 confirmed: a mouse click on
the search gave `input.matches(':focus-visible') === true` in both engines, the halo was gone either
way. The nit cost a round-trip and changed nothing.

**How to apply:** before suggesting a CSS selector change as a nit, run a 20-line Playwright probe
(click, then read `matches(':focus-visible')` and the computed style) in both engines. The
keyboard/pointer split only exists for buttons, links and checkboxes.
Related: [[defect-class-check-shaped-to-its-mutant]].
