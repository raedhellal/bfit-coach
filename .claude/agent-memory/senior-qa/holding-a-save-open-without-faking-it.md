---
name: holding-a-save-open-without-faking-it
description: How to open a real in-flight window for race testing on a localhost stack — CDP throttling does NOT work, a forwarding proxy does
metadata:
  type: project
---

To test "the user types while a save is in flight" **without** `page.route` (which is what produced
a false green on EV-202b), you need the round trip to genuinely last a second or two.

🔴 **Chromium's CDP `Network.emulateNetworkConditions` does NOT throttle loopback.** A 1200 ms
latency emulation left a `localhost` round trip at a few milliseconds. The probe could not open a
window at all and would have reported a **vacuous green**. This cost a full debugging cycle on
2026-09-22; do not reach for it on a localhost stack.

**What works:** a ~40-line Node **forwarding proxy** between the app server and the api. It passes
every byte through to the real api and returns the real status, headers and body unchanged, adding
wall-clock delay only to the one route under test. The write really commits; nothing is synthesised.
Point the app's `API_BASE_URL` at the proxy. Kept at
`.claude/agent-memory/senior-qa/slowproxy.mjs`-shaped code — re-derive it, it is trivial.

**Killing the proxy mid-test is also the cleanest "the api is down" probe** — a real connection
failure rather than a stubbed one.

**Two locator traps in this same area, both of which looked like product defects and were not:**
- `getByRole("button", { name: "Save" })` does **not** match the button once it reads `"Saving…"`.
  Use `{ name: /Sav/ }` or the pending state looks permanently absent.
- Playwright's `click()` waits for actionability, so N rapid `click()` calls on a button that
  disables itself are **serialised**, not concurrent. For a genuine same-frame double-tap use
  `page.evaluate(() => btn.click(); btn.click())`.

**Always synchronise on the action response (`waitForResponse`), never on a success notice** — a
notice left over from a previous save returns instantly and passes against the live defect.

**And watch the probe go red.** Build the pre-fix commit in a second worktree, serve it on another
port, run the identical spec against the identical api and row. A green you did not watch fail is
not evidence. See [[seeding-a-live-coach-portal-stack]].
