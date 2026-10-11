---
name: browser-unit-harness-for-client-modules
description: qa/unit-harness.ts — unit-test a client module/hook in a real browser with Next's compiled React (no jsdom/RTL in coach, no npm install allowed); stubs by specifier, reads src from disk so mutants apply
metadata:
  type: reference
---

b-fit-coach has no jsdom, Testing Library or vitest, and worktrees share a symlinked node_modules, so
nothing can be installed. `qa/unit-harness.ts` (BUG-745) is a ~100-line CommonJS bundler: it runs
`typescript.transpileModule` with CJS output and `react-jsx`, follows `require`s, and pins
`react`/`react-dom`/`scheduler` to `next/dist/compiled/*` FILES. The package subpaths do not resolve.
That is the React `next start` ships (18.3 canary), development build. `loadUnitPage` serves it
on a routed `https://unit.evoli.test/` origin (cookies work there) with `<html>` attributes set
before the bundle evaluates.

**How to apply:**
- Stub by the import SPECIFIER (`"@/lib/clientSession"`, `"./portalEvents"`, `"next/navigation"`),
  as JS source. Drive `usePathname` from a React context the test sets inside `startTransition`.
  `useSyncExternalStore` would force sync commits.
- To test "within the commit's layout phase", log from the guard's PARENT's `useLayoutEffect`. A
  parent's layout effect runs after its children's, before passive effects. That kills a
  `useEffect` mutant even though RTL's `act()` could not.
- It reads `src/` at each call, so a mutant written to disk is what runs. No rebuild is needed.
- Spec: `qa/session-epoch-unit.spec.ts` (default config; uses the resetting `test`, so it needs a server).
