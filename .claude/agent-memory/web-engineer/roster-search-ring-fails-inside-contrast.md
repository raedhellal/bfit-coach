---
name: roster-search-ring-fails-inside-contrast
description: BUG-724 (fixed on fix/bug-724-shared-search-ring) — the shared .roster-search keyboard ring drops the --ring halo; the sweep now covers roster, /templates and /recipes searches; where the sweep lives and how the roster half runs
metadata:
  type: project
---

HISTORY: the `.roster-search:focus-within { box-shadow: var(--ring) }` halo filled the keyboard
outline's 2 px offset, so the pixel inside the ring read #D7E0FA (Chromium) / #D8E0FA (WebKit),
2.82:1. Measured on base 127b840 for the roster search too (it was never swept before), not only
/templates. EV-337j2 had patched /recipes alone with a scoped `.rcp-search` rule.

**Fix (BUG-724, 2026-10-09):** `.roster-search:has(input:focus-visible)` sets `box-shadow: none`,
like the kit Input (BUG-663). All three searches now read 3.46:1 inside and out on --bg; the
scoped `.rcp-search` override is deleted. A no-:has() browser drops the rule and keeps the halo.

**Where the sweep lives now:** `qa/focus-ring-sweep.ts` (moved verbatim out of
`field-focus-ring.spec.ts`; `sweepRoute`, `closeSweepBrowser`, `pointerFocusRoute`). The default
routes stay in `field-focus-ring.spec.ts`; the roster search is `qa/field-focus-ring-roster.spec.ts`
(roster config testMatch, default testIgnore). A spec cannot import another spec (it registers
its tests), which is why the move was needed.

**How to apply:**
- A new page that reuses `.roster-search` gets a route in the sweep (and a `POINTER_SEARCHES`
  entry: border turns --blue-500, nothing in <main> moves).
- Do not promise "halo on click, ring on keyboard": see [[text-fields-match-focus-visible-on-click]].
  After the fix a click shows ring + blue border, no halo (witnessed both engines).
- Base-vs-fix pairs differ ONLY in the 0–2 px band outside the box plus its rounded corners;
  a fractional box width moves that band half a device pixel at the right edge
  ([[screenshot-pairs-differ-by-subpixel]]).
