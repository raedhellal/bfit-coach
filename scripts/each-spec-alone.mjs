#!/usr/bin/env node
/**
 * EV-223 AC1/AC4 — run every fixture-mode spec file ON ITS OWN, one fresh dev server
 * each, and fail if any of them is red.
 *
 * The full gate runs every file against ONE `next dev` process whose fixture store is
 * shared memory. A file that passes only because an earlier file (or test) left state
 * behind is green there and red here; that is the class of defect this loop exists to
 * make visible (the Publish-modal test in `qa/coach-routine.spec.ts` was it, red 3/3
 * alone). `qa/fixture-test.ts` now resets the store per test; this loop is the check
 * that no state escapes the reset, because each run starts a NEW server process.
 *
 * Scope: the two fixture configs — `playwright.config.ts` and
 * `playwright.roster.config.ts`. Each file is enumerated by Playwright itself
 * (`--list`), so a new spec file is picked up without editing this script. The legacy
 * and refresh configs hold one file each (alone IS their full run); the live config
 * needs a real api and is out of scope (EV-225).
 *
 * Its verdict is "every file is green alone". It equals AC1's "same result as in the
 * full run" only while the full run is itself green — which is the other gate job.
 *
 * Env passes through: COACH_PORT / COACH_ROSTER_PORT choose the ports. Use
 * `ONLY=<substring>` to restrict the file list while debugging.
 */
import { spawnSync } from "node:child_process";

const CONFIGS = ["playwright.config.ts", "playwright.roster.config.ts"];

function filesFor(config) {
  const listed = spawnSync("npx", ["playwright", "test", "--list", "--config", config], {
    encoding: "utf8",
  });
  if (listed.status !== 0) {
    process.stderr.write(listed.stdout + listed.stderr);
    throw new Error(`could not list ${config}`);
  }
  const files = new Set();
  for (const line of listed.stdout.split("\n")) {
    const m = /(?:^|\s)([\w.-]+\.spec\.ts):\d+:\d+/.exec(line);
    if (m) files.add(`qa/${m[1]}`);
  }
  if (files.size === 0) throw new Error(`${config} listed no spec files — refusing to report green on nothing`);
  return [...files].sort();
}

const results = [];
for (const config of CONFIGS) {
  for (const file of filesFor(config)) {
    if (process.env.ONLY && !file.includes(process.env.ONLY)) continue;
    process.stdout.write(`\n━━ ${file}  (${config}) ━━\n`);
    const started = Date.now();
    const run = spawnSync("npx", ["playwright", "test", file, "--config", config], {
      stdio: "inherit",
    });
    results.push({ config, file, status: run.status, seconds: Math.round((Date.now() - started) / 1000) });
  }
}

process.stdout.write("\n━━ each spec file, alone ━━\n");
for (const r of results) {
  process.stdout.write(`${r.status === 0 ? "PASS" : "FAIL"}  ${r.file}  (${r.config}, ${r.seconds}s)\n`);
}
const failed = results.filter((r) => r.status !== 0);
process.stdout.write(`\n${results.length - failed.length} passed alone, ${failed.length} failed alone\n`);
if (results.length === 0) {
  process.stdout.write("no spec file ran — refusing to report green on nothing\n");
  process.exit(1);
}
process.exit(failed.length > 0 ? 1 : 0);
