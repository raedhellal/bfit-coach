---
name: a-shared-transition-labels-every-action
description: One useTransition shared by several actions makes a pending label lie (Apply said « Application… » during a regenerate); tag the running kind in the click; hold the action POST to test it
metadata:
  type: feedback
---

A `pending` from one `useTransition` that several controls share cannot label any one of
them. `NutritionWeekCard` (d717e57) rendered `pending ? « Application… » : …` on the
Apply-week button, so a day regenerate, a swap's options load and a swap's apply all
announced a week apply nobody started. Shipped for months, unnoticed until staff read it.

**Why:** a label is a claim about what the server is doing; "disabled" is shared state,
"which action" is not. The same trap hid on TemplateLibrary: a refused « Use » arms
« Replace the draft » while `pending` is still true, so `pending ? applying : …` there
would label a button nobody pressed.

**How to apply:**
- Keep one transition if every control must disable while anything runs, and set a tag
  (`{kind, index}`, or `pressed`) synchronously in the click; read it only as
  `pending && tag…`. A finished tag is inert, so it never needs clearing.
- Test pending UI by HOLDING the server-action POST in the browser (`qa/hold-action.ts`:
  `page.route`, method POST + `next-action` header, released by the test). No latency
  cookie guess; every assertion is made while the action is provably in flight.
- "Never shows X" = a MutationObserver from before the click, not a sample.
- Shared pending across sibling server-rendered parts (sort toggle vs rows) needs a
  no-element client provider above both (`RosterSortPending`).
- Do not start `NavigationProgress` before a write's success: it has no cancel, a
  refused write leaves it up 20 s (staff, fluidity round 1).

Since fluidity batch 1 no route has a `loading.tsx`; a test's "navigation pending" sync
point is `[data-nav-progress="visible"]`, and a skeleton is `[style*="shimmer"]`. See
[[a-notice-already-on-screen-is-not-a-sync-point]], [[a-visible-dialog-is-not-a-loaded-one]].
