---
name: auth-system-screens-portal-facts
description: EV-337k (2026-10-02) — /login, /activate, /i/*, /clients/denied, /unavailable redesign; the root not-found lives in every page's payload, /i 404s fell to the Pro 404, how to reach /unavailable, test traps
metadata:
  type: project
---

EV-337k (`feat/pro-auth-system-screens`, base `release/coach-held-merges`) restyled the five
shell-less/system screens per plan §5.10. Facts that cost time and are not in the code:

**Why:** each one either produced a false red/green or a visible R1 violation.

**How to apply:**
- **Next 14 serialises the ROOT `not-found.tsx` into EVERY page's flight data** (EV-241 knew
  it for cost). So `/i/<token>`'s raw HTML contains the black mark's `MARK_PATH` (the root
  404 draws `Logo`/`CoachShell`) although it is never painted. "The visitor never sees the
  Pro mark" must be asserted on the painted DOM (`svg path[d=…]`, `[data-brand-mark="ink"]`)
  and the declared icons, never `page.content()`.
- **Unmatched `/i/*` URLs (`/i`, `/i/<token>/x`) rendered the ROOT 404**: black mark signed
  out, the whole coach shell in a coach's browser, Pro favicon — an R1/edge-case-4 breach no
  spec saw. Fixed inside the segment: `src/app/i/page.tsx` and `src/app/i/[token]/[...rest]/page.tsx`
  call `notFound()`, caught by `src/app/i/not-found.tsx` (trainee mark, EV-241's signed-out
  sentences, no session read). No middleware change. RESIDUAL: under `next dev` AND `next start` the FIRST HTML of
  those 404s declares the root `/icon.svg` (Pro); the DOM after hydration declares
  `/i/icon.svg` (both witnessed; that Next's not-found error shell resolves root metadata is
  my reading of `app-render.js`, not proven). Closing it needs
  a middleware rewrite with `status: 404` (the /clients/denied pattern); not done in EV-337k.
- **`/unavailable` is reachable only through a failed rotation.** Stub config: sign in,
  `clearCookies({ name: "evoli_pro_at" })`, `/__refresh-fails?status=503`, reload. For
  screenshots in fixture mode: start `next dev` with `API_BASE_URL` on a DEAD 39xx port and do
  the same — never point it at :8080 (Raed's api).
- **The fixture signs anybody in with any password.** A refused-login state needs
  `pending.trainee@` or `orphan.pending@evoli.fit`; "wrong password" cannot be drawn there.
- **`flex: 1 1 0` + padding does not give equal halves** (each grows from its padding);
  `flex: 1 1 50%` with border-box does. The login split is 50/50 with a 480 px form floor.
- **Playwright: an `extraHTTPHeaders` Accept-Language rendered French** on a document
  navigation (measured). Use the context `locale` to make Chromium send one.
- **`page.clock` + an island that schedules on mount:** after a reload, wait for the island's
  post-mount text before `runFor`, or the timer is scheduled after the clock moved.
- `/clients/denied` keeps the shell although the design draws none: `pro-roster.spec.ts`
  NB-2 pins « Clients » current there. Its h1 stays EV-183 AC5's full sentence.
- `ClientNotice` (client overview load-error branch, not EV-337k's) still nests a `<button>`
  in a `<Link>`; the denial page now uses `.auth-action`, a link drawn as a button.
- **Stopping a suite: SIGTERM to `npm exec playwright` did NOT stop `node …/playwright test`.**
  It lived on for 15 min, its tests hitting the NEXT run's server on the same COACH_PORT —
  two runners on one fixture store, and both runs' reds were artefacts. After a kill, `ps`
  for `playwright test` and the worker `workerProcessEntry.js` (check cwd), `kill -9` what is
  yours, and re-run clean. A full default run on this base is ~14 min.
- `release/coach-held-merges` MOVED during the task (08f6e90 → bce5d3d, EV-337l); fetch and
  merge it before the final suite, and delete `.next` after (stale `.next/types` broke tsc
  when a route moved into a group).

See [[activation-portal-facts]], [[not-found-page-facts]], [[coach-portal-i18n-facts]].
