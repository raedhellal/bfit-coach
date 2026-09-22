---
name: coach-portal-reads-scopes-never-a-status
description: b-fit-api's coach endpoints name different scopes at the guard, so one block can 403 while the page is a 200 — render "not shared" from scopes, never from the 403
metadata:
  type: project
---

`/coach-portal/clients/{id}` requires an ACTIVE link and **no** data scope, while
`/coach-portal/clients/{id}/progress` names **PROGRESS at the guard**. So for a link that
shares only workouts or only nutrition, the trainee's page is a legitimate **200** and one
of its reads is a **403**.

**How to apply:**
- Read the monitoring endpoint through a `cache()`d reader that returns
  `{ progress, forbidden }` as a VALUE. Throwing, or reusing `[id]/layout.tsx`'s redirect,
  403s the whole client area for a trainee the coach is entitled to see.
- Decide every "not shared" sentence from `overview.scopes`, **never** from the status:
  the 403 body is undifferentiated across "no such id", "another coach's client",
  "revoked" and "scope missing" (ADR-0012 D4), so it says nothing about consent.
- A block often needs TWO scopes: the endpoint's (PROGRESS) *and* the block's own
  (WORKOUTS for adherence/sessions, WEIGH_INS for weight). Check both.
- Keep "the api did not answer" a separate sentence from "not shared". Telling a coach a
  trainee withheld something because a server was down is a claim invented out of an
  outage.
- Fail closed on fields an older api does not send: `typeof count !== "number"`, not
  `=== null` — `undefined <= 0` is false and rendered "undefined flags" in a first draft.
