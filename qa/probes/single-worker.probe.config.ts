import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
import mainConfig from "../../playwright.config";
import rosterConfig from "../../playwright.roster.config";

/**
 * BUG-249 — a child Playwright run for `qa/fixture-single-worker.spec.ts`, never run
 * on its own.
 *
 * It is DERIVED from a real fixture config (`PROBE_BASE=main|roster`) so the thing under
 * test is that config's own `globalSetup` list and `workers`, not a copy of them. Only
 * three things are replaced, each so the child cannot touch a server:
 * - no `webServer` (the refusal must not need one, and a second `next dev` in the same
 *   checkout would share `.next` with the parent's);
 * - no `baseURL` in `plain` mode, so `qa/warm-routes.ts` returns without navigating;
 * - the tests are the probes beside this file, which write a marker file and nothing
 *   else — "no marker" is the witness that no test body ran.
 *
 * `PROBE_MODE=backstop` drops the `globalSetup` entirely (a config that forgot the guard)
 * and runs a probe that imports the resetting `test` against `PROBE_BASE_URL`: a
 * request-counting listener the PARENT test owns on an OS-assigned port. Never a fixed
 * port — a fixed one in the range other sessions use for fixture servers would let this
 * probe sign in to, and reset, someone else's store (the very BUG-249 harm).
 */
const ROOT = resolve(__dirname, "../..");
const base = process.env.PROBE_BASE === "roster" ? rosterConfig : mainConfig;
const backstop = process.env.PROBE_MODE === "backstop";
const setups = [base.globalSetup ?? []].flat().map((path) => resolve(ROOT, path));

export default defineConfig({
  testDir: __dirname,
  testMatch: backstop ? /backstop\.probe\.ts$/ : /plain\.probe\.ts$/,
  workers: base.workers,
  fullyParallel: process.env.PROBE_FULLY_PARALLEL === "1" ? true : base.fullyParallel,
  globalSetup: backstop ? undefined : setups,
  outputDir: process.env.PROBE_OUTPUT_DIR,
  reporter: [["list"]],
  use: { baseURL: backstop ? process.env.PROBE_BASE_URL : undefined },
});
