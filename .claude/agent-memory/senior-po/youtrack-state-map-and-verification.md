---
name: youtrack-state-map-and-verification
description: The board's only route to the À vérifier column is the To Verify key; always re-read the card via the API after a sync, the plan printing "update" does not prove a field landed
metadata:
  type: reference
---

`tools/youtrack/import.mjs` maps its own `state` keys onto project EVO's State bundle
(`Open | In Progress | To Verify | Done | Duplicate | Blocked`). **After a sync, re-read the card
through the API and check the State actually landed** — the dry-run plan prints `update EVO-nn` even
when a field silently falls back.

**Why:** an unrecognised `state` value used to fall through to `['Open']`, so a typo'd or unmapped key
**demoted** a card that had progressed, while the plan looked normal. That happened on `EVO-36`
(EV-210b) on 2026-09-23 — it went In Progress → Open. I patched `STATE_MAP` to add a `To Verify` key
and made an unknown state **throw** instead of guessing.

**How to apply:** use `To Verify` for *built, handed to the gates, not merged and not yet QA-passed*;
`Ready to merge` claims the gates are **cleared** and also adds a `ready-to-merge` tag, so it
overstates a row still under review. `Done` still needs a merge SHA. Verify with:
`node -e "import('./tools/youtrack/yt.mjs').then(m=>(m.yt||m.default)('GET','/issues/EVO-36?fields=idReadable,customFields(name,value(name))').then(r=>console.log(JSON.stringify(r))))"`
