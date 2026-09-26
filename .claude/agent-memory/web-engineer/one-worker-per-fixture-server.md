---
name: one-worker-per-fixture-server
description: BUG-249 — fixture configs REFUSE >1 worker (first globalSetup + worker fixture backstop); how the refusal is proven without a second dev server, and the Playwright ordering facts it relies on
metadata:
  type: project
---

Since BUG-249 (branch `test/bug249-single-worker-fixture`), a fixture-mode run whose
RESOLVED worker count is >1 stops with a "BUG-249: refusing to run..." error:
`qa/fixture-single-worker.ts` is the FIRST `globalSetup` of both fixture configs, and a
worker-scoped auto fixture in `qa/fixture-test.ts` is the backstop for any config that
imports the resetting `test` without it.

**Why:** EV-223's per-test reset wipes the whole server's store. At `--workers=4` on
main `ea6bb8f`, QA's 4-file repro went 3 failed / 59 did not run, no failure naming
parallelism. Per-worker stores were ruled out by senior-po (more than the row is worth).

**How to apply:**
- EV-224's CI job must parallelise by SERVERS (`--shard`, one job each), never by
  `--workers`. The guard will fail the job otherwise, on purpose.
- Playwright starts `webServer` BEFORE `globalSetup`, so the refusal cannot stop the dev
  server booting — only every test and the warm-up. `globalSetup` takes an array (1.49+)
  and aborts at the first throw.
- `config.workers` in `globalSetup`/`workerInfo.config` is the resolved number (sees
  `--workers`, `-j`, percentages). `FullProject` exposes no `workers`, so a per-project cap
  is invisible to the guard.
- The spec proves it with CHILD Playwright runs of `qa/probes/single-worker.probe.config.ts`
  (derived from the real configs, `webServer` dropped, marker files as the "no test body
  ran" witness). Never start a second `next dev` in the same checkout to test this: it
  would share `.next`. Probe files are `*.probe.ts` so no suite's default testMatch and
  not `fixture-isolation.spec.ts`'s `.spec.ts` scan picks them up.
- A second run on an occupied port fails with "is already used" (`reuseExistingServer:
  false`), witnessed 2026-09-26. So two RUNS cannot share one fixture server either.

See [[every-fixture-test-starts-from-the-seed]], [[coach-portal-fixture-mode]].
