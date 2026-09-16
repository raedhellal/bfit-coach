---
name: client-islands-go-stale-after-a-server-write
description: router.refresh() updates a client island's props but not its useState, so an editor keeps showing what was submitted rather than what the server stored
metadata:
  type: project
---

A client component that seeds `useState` from props and then calls a server action plus
`router.refresh()` will **keep showing its own state**. The refresh re-renders the server
component and hands down new props; the island is not remounted, so nothing changes on
screen.

**Why it matters here:** the routine editor submits a draft and the server publishes a
*repaired* plan (the guardrail replaces contraindicated exercises). EV-184 AC3 requires
the repaired exercise to be verifiably absent — but the editor went on showing the
submitted draft until a manual reload, so the coach could not see what the trainee
actually received.

**How to apply:** re-seed local state from props when the server's *identity* for the
data changes — e.g. a `useEffect` comparing the previous `planId` to the incoming one.
Key it on identity, not on the whole prop: an ordinary autosave also refreshes the route,
and resetting on every refresh throws away the cursor mid-edit. Remounting via `key=` is
the blunter alternative and loses any success notice the island is holding. Related:
[[next-module-state-duplicated-across-layers]].
