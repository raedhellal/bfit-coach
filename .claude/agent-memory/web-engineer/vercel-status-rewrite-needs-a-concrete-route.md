---
name: vercel-status-rewrite-needs-a-concrete-route
description: b-fit-coach BUG-678 (2026-10-02) — a middleware rewrite-with-status onto a path only a DYNAMIC route serves gave Vercel's global /_not-found while next start drew the right page; rewrite to a concrete static page instead
metadata:
  type: feedback
---

On Vercel, `NextResponse.rewrite(req.nextUrl, { status: 404 })` for `/i/tok/extra` (servable
only by the dynamic `/i/[token]/[...rest]`) answered `x-matched-path: /_not-found`: the ROOT
404, Evoli Pro title and icons (production `46eb8b7`, curl). The same rewrite on the concrete
`/i` and `/clients/denied` matched themselves. `next start` and `next dev` resolved the dynamic
route, so QA, staff and every Playwright spec saw the right page while production was wrong.

**Why:** a whole review cycle (QA PASS, staff APPROVE) passed a defect that existed only on the
platform. The exact proxy rule is not established: the witness is "concrete matched, dynamic
did not", not "status breaks dynamic routes".

**How to apply:**
- A middleware rewrite that carries a status must target a CONCRETE (static-segment) page.
  BUG-678's fix: deep `/i` paths go to `/i/no-invitation` (13 chars, cannot be a 43-char
  base64url invite token), and a direct visit to it is refused as an invitation too.
- `next start` exposes `x-middleware-rewrite: <target>` on the response, so a local spec can pin
  the rewrite TARGET (red on the base, where it was the path itself) even though it cannot
  reproduce the platform's routing. `qa/invite-not-found.spec.ts` does that.
- For the platform itself: `qa/probes/invite-404-deployment.mjs <url>` (status, `x-matched-path`,
  title, icons, h1, body, no link, headers). 51 failures on production `46eb8b7`.
- Any status-rewrite or routing change on the coach portal: read `x-matched-path` on a Vercel
  deployment before calling it done. Reaching a preview: [[coach-previews-are-behind-vercel-auth]].
- Status at write time: the fix's own Vercel witness was still PENDING (previews behind Vercel
  Authentication). Update this line once a deployment of `4d36b2c` or later is curled.
