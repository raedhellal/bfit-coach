---
name: coach-portal-node-modules-and-spec-sync
description: In a b-fit-coach worktree there is no local node_modules (resolution walks up to the main checkout) and spec:sync resolves b-fit-api relative to the checkout, not the repo
metadata:
  type: project
---

Two things about building `b-fit-coach` **inside a `git worktree`** that cost time before
any code was written:

1. **There is no `node_modules` in the worktree.** Node walks up and finds
   `/Users/raedhelal/Desktop/b-fit/b-fit-coach/node_modules`, so `npm run build`,
   `next lint` and `npx playwright` all work — but `ls node_modules` fails, and anything
   that copies the tree elsewhere (a base-commit export to prove a spec is red before a
   fix) must symlink that absolute path or `npx` silently downloads a *different*
   Playwright and dies on `MODULE_NOT_FOUND` for the config's own imports.
   **A worktree OUTSIDE the repo** (the session scratchpad under `/private/tmp`, which is
   where orchestrators now ask for them) has nothing to walk up to: symlink
   `ln -s /Users/raedhelal/Desktop/b-fit/b-fit-coach/node_modules node_modules`. The
   `.gitignore` entry is `node_modules/`, and a trailing-slash pattern does **not** match a
   symlink, so it shows as `?? node_modules`. Stage by explicit path, never `git add -A`.
2. **`npm run spec:sync`** used to resolve the api as `resolve(repo, "..")`, which in a
   worktree is `<repo>/.claude/worktrees/b-fit-api` → ENOENT. Fixed on
   `feat/ev187b-portal-monitoring` to use `--git-common-dir`, the way
   `qa/api-merge-condition.spec.ts` already did. `B_FIT_API_DIR` also overrides it.

**How to apply:** vendor the spec first thing on any story that consumes a new api
operation (`npm run spec:sync`, then raise `SCHEMAS_EXPECTED` in
`qa/contract-drift.spec.ts` by the number of new `@wire` interfaces — it is pinned so a
guard cannot pass by checking nothing). See [[coach-portal-fixture-mode]].
