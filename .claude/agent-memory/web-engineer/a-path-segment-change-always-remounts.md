---
name: a-path-segment-change-always-remounts
description: BUG-739 - Next 14.2 re-mounts a page whenever a path segment or dynamic value changes; only search params keep it. Fix = rewrites to one editor route + identity rule; rewrite pitfalls
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
- Shipped shape (B′, 2026-10-11, `d0e43a1`): `beforeFiles` rewrites `/x/new` → `/x/editor?id=`
  and `/x/:id((?!new$|editor$)[^/]+)` → `/x/editor?id=:id`. `editor/page.tsx` renders the old
  `new/` and `[id]/` modules as JSX; those modules are kept and not served. The create corrects
  the URL with `replaceState(null, …)`. Both halves are needed: W3 showed that with the raw
  `replaceState` alone, Next wrote `/new` back.
- Rewrite pitfalls, both measured:
  - `beforeFiles` rules CHAIN, so the id rule needs the lookahead.
  - The request query merges into the destination's, and only a key the destination names wins.
    Pin `id=` on the `new` rule, or `/x/new?id=<A>` serves A.
- Search-param identity means editor → editor soft navigations keep the instance.
  `src/lib/useEditorIdentity.ts` re-keys the inner editor by `gen` unless the new id is the one
  the editor `adopt`ed at its create. Mutants: with no bump, Q4 goes red; ignoring adopt makes
  the create → update spec red.
- On macOS, `press("End")` does not move a text field's caret (Chromium and WebKit). Set the
  selection instead.
- WebKit on `next start` over http cannot sign in: the session cookie is `Secure` in production.
  It needs an HTTPS front. Through my scratch node https proxy, WebKit logs "Failed to fetch RSC
  payload" for the nav-link prefetches on EVERY page (rig artefact; Chromium is clean through the
  same front).
- `form-leave-guard`'s two BUG-730 "inside the create's step" tests fail in WebKit on base
  `50f31f7` too: the final Back lands on `/x/{id}`. The spec is written for Chromium's
  Navigation API.

Related: [[an-island-must-re-seed-from-props-not-from-its-own-save]],
[[a-back-after-a-guarded-leave-can-hard-reload]].
