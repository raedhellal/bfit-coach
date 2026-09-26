import { defineConfig } from "@playwright/test";

/**
 * EV-224 — the contract-drift guard on its own, for CI's `contract-drift` job.
 *
 * `qa/contract-drift.spec.ts` reads two files (`spec/b-fit-api.openapi.yaml` and
 * `src/lib/coachApi.ts`) and needs no browser, no dev server and no api. It also runs in
 * the default config, but there it waits for `next dev` to boot and for
 * `qa/warm-routes.ts` to compile every route before its first line executes. This config
 * gives the guard its own named check that answers in seconds and cannot be masked by a
 * slow or red browser shard.
 *
 * No `webServer`, no `globalSetup`: nothing here talks to a fixture server, so BUG-249's
 * one-worker rule has nothing to protect (the spec does not import `qa/fixture-test.ts`).
 * `workers: 1` anyway, so the file reads the same as its neighbours.
 */
export default defineConfig({
  testDir: "./qa",
  testMatch: /contract-drift\.spec\.ts/,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"]],
});
