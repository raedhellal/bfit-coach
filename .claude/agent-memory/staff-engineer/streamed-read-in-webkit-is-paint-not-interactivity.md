---
name: streamed-read-in-webkit-is-paint-not-interactivity
description: Streaming a slow server read (unresolved prop promise or Suspense) moves WebKit's PAINT earlier but not its hydration; WebKit runs async scripts only at document end, so early clicks are dropped (EV-356g, 2026-10-11)
metadata:
  type: project
---

On a DOCUMENT load in Playwright WebKit, Next 14's async chunk scripts run only when the streamed document ENDS.
- Bare-node witness: an async `<script>` in `<head>` with the tail held 2 s had not run at 829 ms and ran at 2006 ms. Chromium ran it at 18 ms.
- Portal witness (EV-356g @ b-fit-coach 5071beb, roster held 3 s): WebKit painted at 71–119 ms and hydrated at ~3050 ms (base cf50637 hydrated at ~3110 ms). A real click at 59–107 ms was DROPPED, so no dialog opened.
- Client navigations are not affected. Real Safari has not been checked.

**Why:** a "paints in X ms" claim for any streamed read is half the story in WebKit. Time-to-interactive does not move, and a painted-but-inert window adds dead clicks.

**How to apply:**
- Judge any streaming or unresolved-promise proposal (EV-356g, a Suspense boundary) by TTI per engine, not by paint.
- Require a dropped-click probe in WebKit.
- The EV-356g ruling: accept it while the read is ~120 ms. Re-open with lazy-on-open if a read over ~1 s is measured again.
- Probe scripts were in the session scratchpad (probe/bare-stream.cjs, probe/probe.spec.ts) and are not kept.
