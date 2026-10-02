---
name: not-found-page-facts
description: EV-241 app/not-found.tsx on b-fit-coach — which URLs reach it (and which do not), why its 404 is real, and how it picks the signed-in vs signed-out version
metadata:
  type: project
---

EV-241 (`fix/challenges-roster-and-source`, 2026-10-01) added `src/app/not-found.tsx`.

**Why:** the story's own example (`/clients/does-not-exist-route`) does NOT reach it, and a
future edit that "fixes" that would merge the 404 with BUG-139's 403.

**How to apply:**
- An UNMATCHED path renders the root layout + `not-found.tsx` only, above every segment
  `loading.tsx`, so the status is a real 404 in `next dev` (witnessed in Playwright). See
  [[next-app-router-response-status]] in the hub memory for why a `notFound()` thrown under a
  `loading.tsx` would not be.
- `/clients/<anything>` matches `/clients/[id]`: the api 403s an id that is not the coach's
  and the layout sends it to `/clients/denied` (403). `qa/coach-not-found.spec.ts` pins that.
- A signed-out visitor only reaches the page on a path middleware does not guard: an unknown
  `/api/auth/…` (the matcher excludes that prefix). Every other guarded path goes to /login
  first, and since EV-337k / BUG-678 every non-invitation `/i` path draws the TRAINEE 404
  (`InviteNotFound.tsx`, no link) — on Vercel too. `coach-not-found.spec.ts` AC2 uses
  `/api/auth/does-not-exist-route`.
- **Next 14 renders the root not-found into EVERY page's RSC payload** (the root segment's
  notFound boundary is built eagerly): "Page not found" is in /challenges' HTML under
  `next start`. So `not-found.tsx` runs on every request — it must await nothing and call no
  api (a `readCoachMe()` there was an extra `/coach-portal/me` per roster load; a guard test
  in `qa/coach-not-found.spec.ts` reads its imports). Cost: ~4–5 kB uncompressed HTML/page.
- Signed-in = `hasCoachRole(access cookie)`, the same read middleware does; it chooses the
  frame (CoachShell + "Back to your clients" → `/`) vs bare (link → `/login`). Never an
  authorization decision.
