import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * EV-224 — the CI workflow keeps the promises its own header makes.
 *
 * Reads `.github/workflows/ci.yml` as text (no browser, no server, no YAML dependency).
 * It proves what the FILE says, not what GitHub does with it: whether a run actually
 * goes red on a type error is AC2, and only a GitHub run can witness that.
 *
 *  · AC1 — every push and every pull request, and the six steps are all present.
 *  · AC3 — no secret, no token expression, no URL, no seeded credential (BUG-215).
 *  · BUG-249 — parallelism is shards on separate servers, never `--workers`/`-j`; each
 *    shard job has its own port, and the matrix really has as many shards as the
 *    `--shard=i/N` denominator claims (a mismatch silently skips or doubles tests).
 */

const WORKFLOW = join(__dirname, "..", ".github", "workflows", "ci.yml");
const text = readFileSync(WORKFLOW, "utf8");
/** Lines that are not YAML comments — what GitHub actually executes. */
const code = text
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");

test.describe("EV-224 CI workflow", () => {
  test("AC1 — runs on every push to any branch and on every pull request", () => {
    expect(code).toMatch(/^on:\s*\n\s+push:\s*\n\s+branches:\s*\["\*\*"\]\s*\n\s+pull_request:/m);
  });

  test("AC1 — runs npm ci, lint, typecheck, build, the fixture e2e suite and contract drift", () => {
    for (const step of [
      "npm ci",
      "npm run lint",
      "npm run typecheck",
      "npm run build",
      "npm run test:e2e ",
      "npm run test:e2e:roster",
      "npm run test:contract",
    ]) {
      expect(code, `missing step: ${step}`).toContain(`- run: ${step}`);
    }
    // No step may be allowed to fail without turning the job red.
    expect(code).not.toMatch(/continue-on-error:\s*true/);
  });

  test("AC1 — one aggregate `ci` check needs every other job and fails on any non-success", () => {
    const jobsBlock = code.slice(code.indexOf("\njobs:"));
    const jobs = [...jobsBlock.matchAll(/^ {2}([\w-]+):\s*$/gm)].map((m) => m[1]).filter((j) => j !== "ci");
    const needs = /^ {4}needs:\s*\[([^\]]*)\]/m.exec(jobsBlock.slice(jobsBlock.indexOf("\n  ci:")));
    expect(needs, "the ci job has no needs list").not.toBeNull();
    expect(new Set(needs![1].split(",").map((s) => s.trim()))).toEqual(new Set(jobs));
    expect(code).toContain("if: always()");
    expect(code).toContain('if [ "$r" != "success" ]');
  });

  test("AC3 — references no secret, no token, no URL and no seeded credential", () => {
    // Executed lines only for the context names: Actions expressions are case-insensitive,
    // and the header comment says "NO SECRETS." in prose.
    expect(code).not.toMatch(/secrets\s*[.[]/i);
    expect(code).not.toMatch(/github\.token|GITHUB_TOKEN/i);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/API_BASE_URL|COACH_API_MODE\s*:\s*live/);
    expect(text).not.toMatch(/Password123|@evoli\.fit/);
  });

  test("BUG-249 — shards on separate servers, never more workers", () => {
    expect(code).not.toMatch(/--workers|\s-j\s*\d|fully-?parallel/i);

    const denominators = [...code.matchAll(/--shard=\$\{\{ matrix\.shard \}\}\/(\d+)/g)].map((m) => Number(m[1]));
    expect(denominators).toHaveLength(1);
    const shards = [...code.matchAll(/^\s+- shard:\s*(\d+)\s*$/gm)].map((m) => Number(m[1]));
    expect(shards).toEqual(Array.from({ length: denominators[0] }, (_, i) => i + 1));
    expect(code).toContain(`shard \${{ matrix.shard }}/${denominators[0]})`);

    const ports = [...code.matchAll(/^\s+(?:port|COACH_PORT|COACH_ROSTER_PORT):\s*"(\d+)"\s*$/gm)].map((m) => m[1]);
    expect(ports.length).toBe(shards.length + 1); // each shard + the roster job
    expect(new Set(ports).size).toBe(ports.length);
    // The surfaces' own ports are never used (3100 admin, 3200 landing, 3300 coach, 8080 api).
    for (const p of ports) expect(["3100", "3200", "3300", "8080"]).not.toContain(p);
  });
});
