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
 *
 * BUG-1089: option arguments (each starting with `-`) after the script pass through to
 * Playwright, to the `--list` AND to each file's run. A positional argument is REFUSED: a
 * file name would be appended to every run and silently change what "alone" means — use
 * ONLY=<substring> instead. With `-- --project=chromium`, the TAGGED WebKit legs (@webkit,
 * `webkit` project, qa/webkit-leg.ts) are neither listed nor run, so a missing WebKit cannot
 * turn field-focus-ring, focus-clear-of-bars, field-focus-ring-roster or
 * modal-focus-ring-roster red here. EXCEPTION: specs not yet tagged (README « WebKit legs »,
 * 28 files at BUG-1089) still launch WebKit inside `chromium` and are red here without it.
 * With no argument both projects run, as before.
 */
import { spawnSync } from "node:child_process";

const PASS_THROUGH = process.argv.slice(2);
const positional = PASS_THROUGH.filter((a) => !a.startsWith("-"));
if (positional.length > 0) {
  process.stderr.write(
    `each-spec-alone: refusing positional argument(s) ${positional.map((a) => JSON.stringify(a)).join(", ")}: ` +
      `only options (starting with "-") pass through to Playwright. ` +
      `A file here would run in every "alone" run; restrict the file list with ONLY=<substring>.\n`
  );
  process.exit(2);
}
const CONFIGS = ["playwright.config.ts", "playwright.roster.config.ts"];

function filesFor(config) {
  const listed = spawnSync("npx", ["playwright", "test", "--list", "--config", config, ...PASS_THROUGH], {
    encoding: "utf8",
  });
  if (listed.status !== 0) {
    process.stderr.write(listed.stdout + listed.stderr);
    throw new Error(`could not list ${config}`);
  }
  const files = new Set();
  for (const line of listed.stdout.split("\n")) {
    // The path is relative to testDir and may contain a subfolder (testDir is recursive).
    const m = /(?:^|\s)([\w./-]+\.spec\.ts):\d+:\d+/.exec(line);
    if (m) files.add(`qa/${m[1]}`);
  }
  if (files.size === 0) throw new Error(`${config} listed no spec files — refusing to report green on nothing`);
  return [...files].sort();
}

const results = [];
for (const config of CONFIGS) {
  for (const file of filesFor(config)) {
    if (process.env.ONLY && !file.includes(process.env.ONLY)) continue;
    process.stdout.write(`\n━━ ${file}  (${config}${PASS_THROUGH.length ? ` ${PASS_THROUGH.join(" ")}` : ""}) ━━\n`);
    const started = Date.now();
    const run = spawnSync("npx", ["playwright", "test", file, "--config", config, ...PASS_THROUGH], {
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
