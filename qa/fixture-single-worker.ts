import type { FullConfig } from "@playwright/test";

/**
 * BUG-249 — ONE worker per fixture server, or the run does not start.
 *
 * `COACH_API_MODE=fixture` keeps every draft, plan, target and meal week in ONE
 * in-memory store inside ONE `next dev` process, and `qa/fixture-test.ts` resets that
 * WHOLE store (`DELETE /api/fixture/state`) before every test (EV-223). With a second
 * worker on the same server, worker B's reset throws away the state worker A's test is
 * in the middle of building. `senior-qa` measured it at `--workers=4`: 4 failed, 62 did
 * not run — and not one failure said "parallelism". They read like product defects.
 *
 * So the helper REFUSES the configuration rather than letting it produce noise. Two
 * places call `refuseParallelFixtureRun`:
 *
 * 1. This file's default export, the FIRST `globalSetup` of both fixture configs
 *    (`playwright.config.ts`, `playwright.roster.config.ts`). It throws before any test
 *    — and before `qa/warm-routes.ts` — so the run stops with this message and nothing
 *    else. (Playwright starts `webServer` BEFORE `globalSetup`; the dev server boots and
 *    is torn down. No test, no warm-up navigation, no fixture write.)
 * 2. A worker-scoped auto fixture in `qa/fixture-test.ts`, the backstop for a config that
 *    imports the resetting `test` without this setup (a new config, a CI job's own
 *    config). It runs before the per-test reset, so every test fails with THIS message
 *    rather than with a clobbered store.
 *
 * What it reads, stated: `config.workers` — Playwright's RESOLVED count, so it sees
 * `--workers=4`, `-j 4`, `--workers=50%` and a config edit alike. `fullyParallel: true`
 * is refused only through the worker count: with one worker it still runs one test at
 * a time, which is safe, and is let through on purpose. A per-project `workers` limit is
 * NOT consulted (`FullProject` does not expose it); a config asking for >1 total workers
 * is refused even if a project would cap itself at 1. None of the fixture configs has
 * more than one project.
 *
 * What it does NOT stop: two SEPARATE Playwright runs pointed at one server. Both
 * fixture configs start their own server with `reuseExistingServer: false`, so a second
 * run on the same port fails to bind instead. Parallelism belongs in more SERVERS
 * (`--shard` across CI jobs, each booting its own), not more workers on one.
 */

export function parallelFixtureRefusal(workers: number): string | null {
  if (workers <= 1) return null;
  return [
    `BUG-249: refusing to run fixture-mode tests with ${workers} workers against one fixture server.`,
    "The fixture store is one in-memory object in one `next dev` process, and qa/fixture-test.ts resets",
    "the WHOLE store before every test — so parallel workers wipe each other's state mid-test and the",
    "failures look like product defects.",
    "Fix: run with --workers=1 (playwright.config.ts and playwright.roster.config.ts pin workers: 1).",
    "For parallelism, shard across separate servers (e.g. --shard in separate CI jobs), not workers.",
  ].join("\n");
}

export function refuseParallelFixtureRun(config: Pick<FullConfig, "workers">): void {
  const refusal = parallelFixtureRefusal(config.workers);
  if (refusal) throw new Error(refusal);
}

export default async function oneWorkerPerFixtureServer(config: FullConfig): Promise<void> {
  refuseParallelFixtureRun(config);
}
