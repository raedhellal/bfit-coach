import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test as plainTest } from "@playwright/test";
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
 * derived from the real fixture configs, no dev server) and read its exit code, its output
 * and the marker files its probe tests write. "No marker" is the witness that no test
 * body ran — i.e. the run stopped BEFORE any test (card AC1), not after some.
 *
 * The backstop cases also need "the reset was never SENT", and the absence of an error
 * cannot show that. So the parent owns a listener on port 0 (never a fixed port: see the
 * probe config) that answers every request like a pristine fixture server and RECORDS it.
 * Refused: zero requests. Control at one worker: the sign-in and the DELETE arrive.
 * The child is spawned ASYNC — `spawnSync` would block this process's event loop, and
 * with it the listener, so the child's requests would hang instead of being counted.
 *
 * What this file does NOT show: the clobbering itself. That needs two workers on a real
 * dev server and is measured in the BUG-249 evidence (QA's repro, with and without the
 * guard), not re-run here on every gate.
 */

const ROOT = resolve(__dirname, "..");
const PROBE_CONFIG = join(__dirname, "probes", "single-worker.probe.config.ts");
const PLAYWRIGHT_CLI = require.resolve("@playwright/test/cli");
const REFUSED = /BUG-249: refusing to run fixture-mode tests with (\d+) workers against one fixture server/;

type Probe = { base: "main" | "roster"; mode: "plain" | "backstop"; args: string[]; fullyParallel?: boolean };

/** A stand-in fixture server that answers like a pristine store and records every request. */
async function countingServer(): Promise<{ server: Server; baseURL: string; requests: string[] }> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(`${req.method} ${req.url}`);
    req.resume();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ pristine: true }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  return { server, baseURL: `http://127.0.0.1:${port}`, requests };
}

async function runProbe({ base, mode, args, fullyParallel }: Probe) {
  const scratch = mkdtempSync(join(tmpdir(), "bug249-probe-"));
  const markers = join(scratch, "markers");
  mkdirSync(markers);
  const listener = await countingServer();
  // The parent worker's TEST_* / PW_* variables describe THIS run; a child must not inherit them.
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !k.startsWith("TEST_") && !k.startsWith("PW_"))
  ) as NodeJS.ProcessEnv;
  try {
    const { status, output } = await new Promise<{ status: number | null; output: string }>((done, fail) => {
      const child = spawn(process.execPath, [PLAYWRIGHT_CLI, "test", "--config", PROBE_CONFIG, ...args], {
        cwd: ROOT,
        env: {
          ...env,
          PROBE_BASE: base,
          PROBE_MODE: mode,
          PROBE_FULLY_PARALLEL: fullyParallel ? "1" : "0",
          PROBE_MARKER_DIR: markers,
          PROBE_OUTPUT_DIR: join(scratch, "results"),
          PROBE_BASE_URL: listener.baseURL,
        },
      });
      let output = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      const timer = setTimeout(() => child.kill("SIGKILL"), 45_000);
      child.on("error", fail);
      child.on("close", (status) => {
        clearTimeout(timer);
        done({ status, output });
      });
    });
    return { status, output, ran: readdirSync(markers), requests: [...listener.requests] };
  } finally {
    await new Promise((done) => listener.server.close(done));
    rmSync(scratch, { recursive: true, force: true });
  }
}

test.describe("BUG-249 — one worker per fixture server", () => {
  test.describe.configure({ timeout: 60_000 });

  plainTest("the refusal names the worker count, the cause and the fix; one worker is let through", () => {
    expect(parallelFixtureRefusal(1)).toBeNull();
    const message = parallelFixtureRefusal(4);
    expect(message).toMatch(REFUSED);
    expect(message).toContain("4 workers");
    expect(message).toContain("resets\nthe WHOLE store before every test");
    expect(message).toContain("--workers=1");
    expect(parallelFixtureRefusal(2), "the threshold is 2, not some larger number").toMatch(REFUSED);
  });

  plainTest("both fixture configs pin one worker and refuse first, before the warm-up", () => {
    for (const [name, config] of [
      ["playwright.config.ts", mainConfig],
      ["playwright.roster.config.ts", rosterConfig],
    ] as const) {
      expect(config.workers, name).toBe(1);
      const setups = [config.globalSetup ?? []].flat();
      expect(setups[0], `${name}: the refusal is the FIRST globalSetup`).toBe("./qa/fixture-single-worker.ts");
      expect(setups.indexOf("./qa/warm-routes.ts"), `${name}: the warm-up runs after the refusal`).toBeGreaterThan(0);
    }
  });

  for (const base of ["main", "roster"] as const) {
    test(`${base} config: --workers=4 stops before any test, naming the cause (AC1)`, async () => {
      const run = await runProbe({ base, mode: "plain", args: ["--workers=4"] });
      expect(run.status, run.output).not.toBe(0);
      expect(run.output).toMatch(REFUSED);
      expect(run.output).toContain("with 4 workers");
      expect(run.ran, "no probe test body ran").toEqual([]);
    });

    test(`${base} config: fullyParallel: true with --workers=4 stops the same way (AC2)`, async () => {
      const run = await runProbe({ base, mode: "plain", args: ["--workers=4"], fullyParallel: true });
      expect(run.status, run.output).not.toBe(0);
      expect(run.output).toMatch(REFUSED);
      expect(run.ran, "no probe test body ran").toEqual([]);
    });

    test(`${base} config: the configured one worker runs every test (control)`, async () => {
      const run = await runProbe({ base, mode: "plain", args: [] });
      expect(run.status, run.output).toBe(0);
      expect(run.output).not.toMatch(REFUSED);
      expect(run.ran.sort()).toEqual(["probe-one-w0", "probe-two-w0"]);
    });
  }

  test("fullyParallel: true with ONE worker is serial, so it is let through (stated, not refused)", async () => {
    const run = await runProbe({ base: "main", mode: "plain", args: [], fullyParallel: true });
    expect(run.status, run.output).toBe(0);
    expect(run.ran).toHaveLength(2);
  });

  test("a config WITHOUT the guarded globalSetup is still refused by qa/fixture-test.ts, before any request", async () => {
    const run = await runProbe({ base: "main", mode: "backstop", args: ["--workers=2"] });
    expect(run.status, run.output).not.toBe(0);
    expect(run.output).toMatch(REFUSED);
    expect(run.requests, "no sign-in and no DELETE /api/fixture/state reached the server").toEqual([]);
    expect(run.ran, "no probe test body ran").toEqual([]);
  });

  test("backstop control: at one worker the same probe signs in and resets, then runs every test", async () => {
    const run = await runProbe({ base: "main", mode: "backstop", args: ["--workers=1"] });
    expect(run.status, run.output).toBe(0);
    expect(run.output).not.toMatch(REFUSED);
    expect(run.requests, "the listener is what the probe's reset talks to").toContain("DELETE /api/fixture/state");
    expect(run.requests).toContain("POST /api/auth/login");
    expect(run.ran).toHaveLength(2);
  });
});
