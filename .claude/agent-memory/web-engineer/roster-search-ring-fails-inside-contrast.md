---
name: roster-search-ring-fails-inside-contrast
description: the shared .roster-search focus ring (2 px outline, 2 px offset, over the --ring halo) reads 2.82:1 against the pixel inside it; BUG-663's sweep fails it wherever the route is swept
metadata:
  type: project
---

Witnessed 2026-10-09 (EV-337j2): `qa/field-focus-ring.spec.ts`'s pixel sweep failed the new
recipe search in Chromium and WebKit, `ring #4F7CFF | out #F6F7F9 3.46:1 | in #D8E0FA 2.82:1`.
The halo (`.roster-search:focus-within { box-shadow: var(--ring) }`) fills the outline's 2 px
offset, so the "inside" pixel is tinted blue. Pointing the same route entry at /templates
(temp edit, reverted) failed the EV-337i template search identically. /templates' search and
the roster search are NOT in that sweep's route list, which is why it shipped.

**Why:** any new route that reuses `.roster-search` will go red in the full default suite.

**How to apply:** EV-337j2 scoped the fix to `.rcp-search:focus-within { box-shadow: none; }`
(3.46:1). If the roster/templates fix lands (reported to the coordinator, not filed by me),
delete the scoped rule. Roster search was not measured (it needs the roster config's
populated roster), so do not claim it fails without running the sweep there.
