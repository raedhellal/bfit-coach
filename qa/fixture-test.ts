import { expect, test as base } from "@playwright/test";
import { refuseParallelFixtureRun } from "./fixture-single-worker";

/**
 * EV-223 — every fixture-mode test starts from the fixture's SEED.
 *
 * Import `test` from here, not from `@playwright/test`. An auto fixture signs in, resets
 * the dev server's in-memory store (`DELETE /api/fixture/state`) and then asserts, with
 * a separate read, that the store equals its seed — before the test body runs.
 *
 * Why it exists: the store is one object in one `next dev` process, and until this
 * helper a test could pass because an EARLIER test had written to it.
 * `qa/coach-routine.spec.ts`'s Publish-modal test was red 3/3 run alone and green in
 * the full run only because the AC2 test before it left a draft behind. With the reset,
 * a spec file's result cannot depend on which files or tests ran before it in the same
 * server.
 *
 * What it does NOT reset, stated: the BROWSER is already fresh per test (Playwright's
 * default context), and `next dev`'s compile cache is not state the product reads. A
 * mutable thing added OUTSIDE `FixtureState` in `coachApi.fixture.ts` would escape this
 * reset — that is what `qa/fixture-isolation.spec.ts`'s write-then-read pair and the
 * each-spec-alone loop (`npm run test:e2e:alone`) exist to catch.
 *
 * `maxRedirects: 0`: the route sits behind the session middleware, and an
 * unauthenticated call is a 307 to /login — which, followed, is a 200 page. Without it
 * the reset's status check would pass on the login screen and the failure would only
 * surface one step later, as a JSON parse error on the seed check.
 */
export const test = base.extend<{ fixtureAtSeed: void }, { oneWorkerPerFixtureServer: void }>({
  /**
   * BUG-249 — the reset below wipes the WHOLE server's store, so it is only sound with one
   * worker per fixture server. Both fixture configs already refuse a parallel run in their
   * first `globalSetup` (`qa/fixture-single-worker.ts`); this worker-scoped auto fixture is
   * the backstop for any config that imports this `test` without that setup. Worker
   * fixtures are set up before test fixtures, so a parallel run fails HERE, naming the
   * cause, before any reset is sent.
   */
  oneWorkerPerFixtureServer: [
    async ({}, use, workerInfo) => {
      refuseParallelFixtureRun(workerInfo.config);
      await use();
    },
    { scope: "worker", auto: true },
  ],
  fixtureAtSeed: [
    async ({ playwright, baseURL, oneWorkerPerFixtureServer: _ }, use) => {
      const api = await playwright.request.newContext({ baseURL });
      try {
        const login = await api.post("/api/auth/login", {
          data: { email: "coach@evoli.fit", password: "Password123!" },
          maxRedirects: 0,
        });
        expect(login.status(), "fixture sign-in for the reset").toBe(200);

        const reset = await api.delete("/api/fixture/state", { maxRedirects: 0 });
        expect(
          reset.status(),
          "DELETE /api/fixture/state — 404 means the server is not in COACH_API_MODE=fixture"
        ).toBe(200);

        const check = await api.get("/api/fixture/state", { maxRedirects: 0 });
        expect(check.status()).toBe(200);
        expect(await check.json(), "the fixture store equals its seed at the start of the test").toEqual({
          pristine: true,
        });
      } finally {
        await api.dispose();
      }
      await use();
    },
    { auto: true },
  ],
});
