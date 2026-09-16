---
name: coach-portal-surface
description: b-fit-coach is a fourth Next.js surface (Evoli Pro, port 3300) that web-engineer owns alongside b-fit-admin and evoli-landing
metadata:
  type: project
---

`b-fit-coach` — "Evoli Pro", the coach back-office — is a **fourth** standalone Next.js
14 App Router surface at `/Users/raedhelal/Desktop/b-fit/b-fit-coach`, port **3300**. It
is not listed in the hub `CLAUDE.md`'s four-surface table (that table predates it) but it
is mine to implement, the same as the admin and the landing site.

**Why:** it was cut for the EV-183 / MVE-1 coach demo and has kept growing (EV-184b
routine management, EV-185b nutrition management). Stories for it live in the hub,
`b-fit-mobile/docs/product/stories/`, like every other surface's.

**How to apply:** when a task says "the dashboard" check which one is meant — `b-fit-admin`
(:3100) and `b-fit-coach` (:3300) are different repos with different auth and different
users. The coach portal has its own Playwright suite in its own `qa/` directory, not in
the hub's. See [[coach-portal-fixture-mode]] for how it runs without the api.
