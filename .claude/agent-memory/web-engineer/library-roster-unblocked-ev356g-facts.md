---
name: library-roster-unblocked-ev356g-facts
description: EV-356g — unresolved roster promise into the library islands; WebKit hydrates a streamed document only at its end; response.finished() never settles on a streamed RSC fetch; evoli_fixture_roster_delay
metadata:
  type: project
---

EV-356g (2026-10-11, `perf/ev356g-library-roster-unblocked`): `/templates`, `/nutrition-templates`
and `/challenges` start `listClients` beside their other reads and pass the UNRESOLVED promise
(filtered on the server, `.catch(() => null)`) to the island. `src/lib/useRosterRead.ts` reads it
with `then(ok, err)` in an effect: `loading | failed | ready`. Spec: `qa/library-roster-unblocked.spec.ts`
(start config, both engines), unit: `qa/roster-read-unit.spec.ts` (default config).

**Why each fact matters:**
- **WebKit runs async scripts only once a streamed document has ENDED.** Witnessed on a bare node
  server: an async `<script>` in `<head>` had not run 800 ms into a held document in WebKit; it ran
  at 10 ms in Chromium. On the portal, with the roster held 2 s, WebKit painted the list at ~80 ms
  and hydrated at ~2.1 s (DCL); Chromium hydrated at ~50 ms. So ANY streamed server read (an
  unresolved promise prop or a Suspense boundary) leaves a Safari document load painted but
  inert until the stream ends. A client navigation has no such wait (the app is hydrated).
  Real Safari not checked.
- **Why not `use()`:** a rejected Flight thenable (a cut stream) throws to `error.tsx`; and every
  library write revalidates, so the island gets a NEW promise. `use()` on it inside the router's
  transition would hold the rename until the roster answers whenever the picker is mounted. The
  action's Flight root resolves before the promise chunk, so with the hook a rename settles at
  ~0.1 s while the action's body is still streaming for 2 s.
- **Playwright `response.finished()` never settles for a streamed RSC fetch in Chromium**
  (still pending 6 s after the stream ended; `body()` then throws). Use the page's Resource Timing
  `responseEnd` (entry added when the body ends) or the navigation entry for a document.
- `evoli_fixture_roster_delay=<ms>` holds `listClients` alone (5 s cap, per page read, before the
  fail switch, so `evoli_fixture_roster=fail` + delay = a slow failure).
- The nutrition picker's failure sentence says « Fermez cette fenêtre et réessayez. »; closing the
  dialog re-reads nothing (before or after EV-356g). Flagged to senior-po, not changed.

**How to apply:** before streaming any read on a coach page, say what WebKit does on a document
load; time paints in the page (`performance.now()` + a rAF after a MutationObserver), and pair each
timing with a witness that the hold was real. See [[intent-prefetch-ev356d-facts]] for the
next-start-only and WebKit Secure-cookie traps, [[a-hand-made-context-inherits-the-runners-language]].
