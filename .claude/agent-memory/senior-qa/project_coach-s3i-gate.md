---
name: project_coach-s3i-gate
description: 2026-10-10 coach train/coach-s3i f303bc0 (EV-356d intent prefetch + R1-H reload + invariant N, BUG-740) gate; next-start rig facts — DOM vs frame busy, MPA denial wipes router memory, proxy for 3G, census per context, D.12 wording
metadata:
  type: project
---

**2026-10-10, b-fit-coach `train/coach-s3i` @ f303bc0** = 50f31f7 (s3h, local main) + EV-356d `perf/ev356d-intent-prefetch` @ f1fa4b0.
Session log: scratchpad `coach-s3i-qa.md`; artefacts scratchpad `s3i/`. Verdict and numbers live in the session log. Previous:
[[project_coach-s3h-gate]].

**Why:** a coach merge is a production deploy ([[coach-portal-merge-is-release]]). EV-356d widens a privacy window by ruling (A), so the
bound had to be measured, not read from the ADR.

**How to apply (reusable):**
- **Prefetch work is `next start` only** (`router.prefetch` is a no-op in dev). WebKit + `next start` over http drops Secure session
  cookies, so re-add them without Secure in WebKit ONLY. Keep Chromium on the real Secure path (localhost is secure there), and journal
  every response's Set-Cookie: 0 seen means the strip hid nothing in that run.
- **R1-H's busy shell is often never painted.** In Chromium it is inserted and the document unloads before a rAF frame. A frame-level
  "busy was drawn" check is a false red. Use a DOM-level MutationObserver record as the reach check, and the DOC request as the proof
  the reload happened.
- **A click past the window that lands on `/clients/denied` is a 403 DOCUMENT (MPA) load**, which wipes the router's memory, so later
  Back/Forward cannot replay anything. To observe the Back/Forward exposure, stay in the same document (go back to the roster by the
  side menu, never click past the window). It replays her overview at +66 s on the train AND on d717e57 (pre-existing).
- **The bound's edge is witnessable:** take t0 at the prefetch's answer; first use at +29 s, still cached at +57 s, denied at +62 s.
- **3G-like latency on localhost = a node forwarding proxy in front of `next start`** (rig/slowproxy.mjs, +300 ms per response head,
  `writeHead(status, rawHeaders)` + pipe), started as a second `webServer` entry. CDP throttling ignores loopback.
- **The census line is written on `context.on("close")`.** It covers requests after `recorder()` was attached, so it still reports
  when a test fails early. That is how the d717e57 AUTO count (233) survived D1 failing at its positive control.
- **The EN side menu says "Roster", the FR one « Clients ».** WebKit has no `Touch` constructor, so dispatch a plain bubbling
  `touchstart`. CDP `synthesizeScrollGesture` needs an in-viewport point.
- **Playwright `hover()` dwells longer than 80 ms**, so a "hover every link" walk prefetches every roster row it crosses (103 FULL on
  a 100-row roster). That is not a sweep. Use `mouse.move` with a measured in-page dwell for anything that must stay under the dwell.
- **Mutant builds fail `next build` on lint for unused bindings** (`isBooted`, `event`). Use `--no-lint` and say so. Only M-TabNext's
  refusal (`no-restricted-imports`) is the guard working.
- **D.12 as worded cannot reach the server** (the second click is inside the reusable window). The engineer's Q6 shape is the testable one.
- **Sign-out cannot be tested in WebKit over http.** The logout's clearing Set-Cookie is Secure, WebKit drops it, and the tab stays
  signed in. Clear the session cookies by hand after the click, and say so. Chromium signs out for real.
- **A cache window ruled for one trigger (a revoke) also serves other ways access ends.** Probe the coach's own sign-out in a second
  tab: here a rested row painted in the signed-out tab at +5 s (QA-S3I-3). Always run the d717e57 control too: the revisit path
  already paints there, so only the first-open part is new.
- **BUG-740 had only a trace on production.** This gate witnessed it on a `next start` of d717e57 (8/8 red). Build the production
  SHA when a row says "by trace, not run".
