---
name: the-error-boundary-is-a-client-component
description: BUG-689/672 — why error.tsx draws ShellFrame (not CoachShell), how its retry recovers a server error, and the evoli_fixture_render_error switch that reaches it
metadata:
  type: project
---

`src/app/error.tsx` must be `"use client"`, and `CoachShell` is a server component
(`getCopy()`/`getLocale()`), so the boundary cannot render it. Since BUG-689 the shell's
markup is `ShellFrame` (copy + locale as props, no server import); `CoachShell` wraps it on
the server and `error.tsx` renders it with `useCopy()` / `useLocale()` (added to
`i18n/client.tsx`). `sectionFor(pathname)` picks the nav entry. `/login`, `/activate`,
`/unavailable` and `/i/*` get no shell.

**Why:** in Next 14.2 `reset()` alone re-renders the SAME server payload, so a server throw
throws again. `startTransition(() => { router.refresh(); reset(); })` is the recovery.

**How to apply:**
- Every page read is caught into its own load-error state, so the boundary is unreachable by
  failing a read. `evoli_fixture_render_error=<once|always>` makes `getMe` answer a Proxy whose
  fields throw; every signed-in page reads `me?.displayName` outside its `try`. The Proxy must
  answer `then` (and symbols) as undefined, or `await` sees a throwing thenable and the read's
  own `catch` swallows it. `once` is counted in `FixtureState.renderErrorsServed`.
- Do not import anything `server-only` into `ShellFrame`: the boundary would stop building.
- The roster's own load-error card (`(roster)/page.tsx`) is a different state from the
  boundary on `/`: same sentence, but there it is not the `h1`.

See [[a-mutant-can-fail-the-gate-through-the-dev-overlay]].
