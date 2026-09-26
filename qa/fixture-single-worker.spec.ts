import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect } from "@playwright/test";
import mainConfig from "../playwright.config";
import rosterConfig from "../playwright.roster.config";
import { parallelFixtureRefusal } from "./fixture-single-worker";
import { test } from "./fixture-test";

/**
 * BUG-249 — a fixture-mode run with more than one worker on one fixture server STOPS,
 * naming the cause, instead of producing clobbered-store failures that read like product
 * defects. See `qa/fixture-single-worker.ts` for the why.
 *
 * The end-to-end cases run a CHILD Playwright (`qa/probes/single-worker.probe.config.ts`,
 * derived from the real fixture configs, no server) and read its exit code, its output
 * and the marker files its probe tests write. "No marker" is the witness that no test
 * body ran — i.e. the run stopped BEFORE any test (card AC1), not after some.
 *
 * What this file does NOT show: the clobbering itself. That needs two workers on a real
 * dev server and is measured in the BUG-249 evidence (QA's repro, with and without the
 * guard), not re-run here on every gate.
 */

const ROOT = resolve(__dirname, "..");
const PROBE_CONFIG = join(__dirname, "probes", "single-worker.probe.config.ts");
const PLAYWRIGHT_CLI = require.resolve("@playwright/test/cli");
/** Nothing listens here (BUG-249 port range); only the backstop probe points at it. */
const DEAD_PORT = "3689";
const REFUSED = /BUG-249: refusing to run fixture-mode tests with (\d+) workers against one fixture server/;

type Probe = { base: "main" | "roster"; mode: "plain" | "backstop"; args: string[]; fullyParallel?: boolean };

function runProbe({ base, mode, args, fullyParallel }: Probe) {
  const scratch = mkdtempSync(join(tmpdir(), "bug249-probe-"));
  const markers = join(scratch, "markers");
  mkdirSync(markers);
  // The parent worker's TEST_* / PW_* variables describe THIS run; a child must not inherit them.
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("TEST_") && !k.startsWith("PW_"))
  ) as NodeJS.ProcessEnv;
  const child = spawnSync(process.execPath, [PLAYWRIGHT_CLI, "test", "--config", PROBE_CONFIG, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 45_000,
    env: {
      ...env,
      PROBE_BASE: base,
      PROBE_MODE: mode,
      PROBE_FULLY_PARALLEL: fullyParallel ? "1" : "0",
      PROBE_MARKER_DIR: markers,
      PROBE_OUTPUT_DIR: join(scratch, "results"),
      PROBE_DEAD_PORT: DEAD_PORT,
    },
  });
  const ran = readdirSync(markers);
  rmSync(scratch, { recursive: true, force: true });
  return { status: child.status, output: `${child.stdout}\n${child.stderr}`, ran };
}

test.describe("BUG-249 — one worker per fixture server", () => {
  test.describe.configure({ timeout: 60_000 });

  test("the refusal names the worker count, the cause and the fix; one worker is let through", () => {
    expect(parallelFixtureRefusal(1)).toBeNull();
    const message = parallelFixtureRefusal(4);
    expect(message).toMatch(REFUSED);
    expect(message).toContain("4 workers");
    expect(message).toContain("resets\nthe WHOLE store before every test");
    expect(message).toContain("--workers=1");
    expect(parallelFixtureRefusal(2), "the threshold is 2, not some larger number").toMatch(REFUSED);
  });

  test("both fixture configs pin one worker and refuse first, before the warm-up", () => {
    for (const [name, config] of [
      ["playwright.config.ts", mainConfig],
      ["playwright.roster.config.ts", rosterConfig],
    ] as const) {
      expect(config.workers, name).toBe(1);
      expect(config.globalSetup, name).toEqual(["./qa/fixture-single-worker.ts", "./qa/warm-routes.ts"]);
    }
  });

  for (const base of ["main", "roster"] as const) {
    test(`${base} config: --workers=4 stops before any test, naming the cause (AC1)`, () => {
      const run = runProbe({ base, mode: "plain", args: ["--workers=4"] });
      expect(run.status, run.output).not.toBe(0);
      expect(run.output).toMatch(REFUSED);
      expect(run.output).toContain("with 4 workers");
      expect(run.ran, "no probe test body ran").toEqual([]);
    });

    test(`${base} config: fullyParallel: true with --workers=4 stops the same way (AC2)`, () => {
      const run = runProbe({ base, mode: "plain", args: ["--workers=4"], fullyParallel: true });
      expect(run.status, run.output).not.toBe(0);
      expect(run.output).toMatch(REFUSED);
      expect(run.ran, "no probe test body ran").toEqual([]);
    });

    test(`${base} config: the configured one worker runs every test (control)`, () => {
      const run = runProbe({ base, mode: "plain", args: [] });
      expect(run.status, run.output).toBe(0);
      expect(run.output).not.toMatch(REFUSED);
      expect(run.ran.sort()).toEqual(["probe-one-w0", "probe-two-w0"]);
    });
  }

  test("fullyParallel: true with ONE worker is serial, so it is let through (stated, not refused)", () => {
    const run = runProbe({ base: "main", mode: "plain", args: [], fullyParallel: true });
    expect(run.status, run.output).toBe(0);
    expect(run.ran).toHaveLength(2);
  });

  test("a config WITHOUT the guarded globalSetup is still refused by qa/fixture-test.ts, before any reset", () => {
    const run = runProbe({ base: "main", mode: "backstop", args: ["--workers=2"] });
    expect(run.status, run.output).not.toBe(0);
    expect(run.output).toMatch(REFUSED);
    expect(run.output, "the per-test reset was never attempted").not.toContain("ECONNREFUSED");
    expect(run.ran, "no probe test body ran").toEqual([]);
  });

  test("backstop control: at one worker the same probe reaches the per-test reset (and fails there, no server)", () => {
    const run = runProbe({ base: "main", mode: "backstop", args: ["--workers=1"] });
    expect(run.status, run.output).not.toBe(0);
    expect(run.output).not.toMatch(REFUSED);
    expect(run.output).toContain("ECONNREFUSED");
    expect(run.ran).toEqual([]);
  });
});
