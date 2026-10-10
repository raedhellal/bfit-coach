---
name: boot-commit-reload-flag-needs-same-commit-error
description: A "reload once if the error arrives after the document's first commit" flag (EV-356d R1-H BootMark) is loop-free only while a document-load error renders in that first commit; a loading.tsx or Suspense above the page makes it an endless reload. Also the wrapper/lint holes of invariant N
metadata:
  type: feedback
---

**Rule.** When a fix tells "the document's own first render" apart from "a later commit" with a module flag set in
an effect (EV-356d R1-H: `BootMark` + `useState(isBooted)` in `error.tsx`, reload when booted), the claim "no loop
by construction" has a hidden precondition. On a document load, the error must render in the SAME commit as the
flag's host. That holds only while the page's throw happens before the shell flush (a 500 document, rendered by
`createRoot` in one commit). A `loading.tsx` or a `<Suspense>` between the root and the page streams the error after
a 200 shell. React then client-renders that boundary in a LATER commit, the flag already reads true, the page reloads,
and the same thing happens again on every reload.
- In b-fit-coach the guard that exists is BUG-629's `qa/client-overview-load-error-status.spec.ts` (default dev suite,
  EN+FR). It asserts that the document load is a 5xx, which a loading.tsx would break.
- I asked for the precondition and that guard to be written into BootMark's header (EV-356d review, nit N4, @4fc8f2e).

**Invariant N holes, probed with temp files at 4fc8f2e:**
- `no-restricted-imports` with `paths: ["next/link"]` flags `import` and `export … from "next/link"`, but a deep import of
  `next/dist/client/link` lints clean.
- `Omit<ComponentProps<typeof NextLink>, "prefetch">` keeps `ref` in the type. The wrapper is a plain function component,
  so `<Link ref={r}>` typechecks and the ref is silently dropped.
- `router.prefetch(` elsewhere lints clean. That is a FULL prefetch, not AUTO, but D33.13 makes any other host an
  amendment.

**Why:** a loop on this path reloads a failing page forever: ~4 api reads plus a middleware pass each time, from every
open tab, behind one egress IP that shares the refresh budget. The flag looked trivially safe because its comment said
"by construction".

**How to apply:**
- For any reload-once, retry-once or show-once decision keyed on "first commit vs later", ask what makes the error
  render in which commit. Name the test that fails if a Suspense or streaming boundary is added.
- For any import-ban guard, probe a deep `dist/` path and the `ref` prop of the wrapper.

Related: [[defect-pattern-bound-that-does-not-bound]], [[defect-class-check-shaped-to-its-mutant]]
