---
name: text-fields-match-focus-visible-on-click
description: a mouse click into a text input matches :focus-visible in Chromium and WebKit, so :has(input:focus-visible) cannot tell pointer from keyboard focus on a search field
metadata:
  type: reference
---

EV-337j2 round 2 (staff N1) asked to key the recipe search's halo removal on
`.rcp-search:has(input:focus-visible)` instead of `:focus-within`, "so a mouse click keeps the
halo like /templates". Probe, 2026-10-09, Chromium and WebKit, a real `page.mouse.click`
into the field: `input.matches(":focus-visible")` was **true** on /recipes and /templates,
so the halo was gone on /recipes under BOTH selectors. /templates shows outline + halo after
a click too: its outline is also keyed on `:has(input:focus-visible)`.

**Why:** browsers' focus-visible heuristic always matches fields that take keyboard input.
A rule written to separate pointer focus from keyboard focus there changes nothing, and a
review can believe it did.

**How to apply:** for text fields, treat `:focus-visible` and `:focus-within` as the same
moment. A pointer-only style needs another signal (none is clean). State the witness, not the
intent, when you answer a nit like this. See [[roster-search-ring-fails-inside-contrast]].
