---
name: a-path-segment-change-always-remounts
description: BUG-739 - Next 14.2 re-mounts a page whenever a path segment (or a dynamic segment's value) changes; only search params keep the instance. Telling Next the URL only moves the remount.
metadata:
  type: project
---

Next 14.2.35 keys each child of a layout router by `createRouterCacheKey(segment, true)`
(`layout-router.js:447`). A dynamic segment's key includes its VALUE (`id|<value>|d`). Only a page
segment's search params are dropped from the React key. So `/x/new` → `/x/[id]` (and `[id]=new` → `[id]=<uuid>`)
re-mounts the editor at whatever moment Next's tree switches, whether that is a router.replace,
a server action's revalidating render, or a popstate restore.

**Why:** BUG-739. The create corrected the URL with a raw `replaceState(history.state, …)`. That state
carries `__NA`, so Next's patched replaceState passes it through and Next stays on `/new`. The next
update's action renders `/x/{id}` (any `revalidatePath` sets `pathWasRevalidated`, so the action always
renders), and the segment swap re-mounts the editor. Witness W1 (2026-10-10): `replaceState(null, …)`
(Next agrees on the URL) is still red 4/4. Making Next agree only moves the remount.

**How to apply:**
- Only one shape measured green: one page segment for both URLs, with search-param identity (a
  rewrite `/x/:id` → `/x/editor?id=:id`) and `replaceState(null, …)` at the create. Both halves are
  needed (W3: the raw one alone let Next write `/new` back).
- `beforeFiles` rewrites CHAIN: `/x/new` → `/x/editor` was matched again by `/x/:id`. Add a
  `(?!new$|editor$)` lookahead.
- With search-param identity, editor → editor soft navigations keep stale island state. Re-seed on an
  id prop change.
- On macOS, `press("End")` does not move a text field's caret (Chromium and WebKit). Set the selection
  in a spec instead. Related: [[an-island-must-re-seed-from-props-not-from-its-own-save]],
  [[a-back-after-a-guarded-leave-can-hard-reload]].
- Status 2026-10-10: options sent to architect/staff (scratchpad `bug739-options.md`). B is
  recommended, nothing is decided yet, and the branch holds only the spec.
