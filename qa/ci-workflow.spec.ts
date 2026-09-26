import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * EV-224 — the CI workflow keeps the promises its own header makes.
 *
 * Reads `.github/workflows/ci.yml` as text (no browser, no server, no YAML dependency).
 * It proves what the FILE says, not what GitHub does with it: whether a run actually
 * goes red on a type error is AC2, and only a GitHub run can witness that.
 *
 * Checks are PINNED (anchored lines, literal blocks) rather than "contains": a
 * `contains("npm run lint")` is satisfied by `npm run lint || true`, which is a check
 * that can never be red. staff-engineer's mutation pass on the first version proved
 * that 16 of 21 edits to ci.yml survived it; every one of those is now killed here,
 * except two accepted: `if: false` on a job (the `ci` aggregate turns a skipped job red
 * at run time) and a constant concurrency group.
 *
 *  · AC1 — every push and every pull request, unfiltered; the six steps, each able to
 *    fail; one aggregate `ci` check that is red if any job is not green.
 *  · AC3 — no secret, no token, no URL, no seeded credential (BUG-215); read-only token.
 *  · BUG-249 — parallelism is shards on separate servers, never `--workers`/`-j`.
 *  · EV-235 boundary — exactly one test excluded, and it cannot silently grow.
 */

const ROOT = join(__dirname, "..");
const WORKFLOW = join(ROOT, ".github", "workflows", "ci.yml");
const text = readFileSync(WORKFLOW, "utf8");
/** Lines that are not YAML comments — what GitHub actually executes. */
const code = text
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");

const EXCLUDED_TITLE = "the vendored api commit's merge state";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** One step line, whole: nothing may follow the command (no `|| true`, no `; exit 0`). */
const stepLine = (cmd: string) => new RegExp(`^ {6}- run: ${escape(cmd)}$`, "m");

/** The text of one job, from its key to the next job key (or end of file). */
function jobBlock(name: string): string {
  const jobs = code.slice(code.indexOf("\njobs:\n"));
  const start = jobs.indexOf(`\n  ${name}:\n`);
  expect(start, `job ${name} not found`).toBeGreaterThanOrEqual(0);
  const rest = jobs.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[\w-]+:\n/);
  return next < 0 ? rest : rest.slice(0, next + 2);
}

function shardCount(): number {
  const shards = [...code.matchAll(/^ {10}- shard:\s*(\d+)\s*$/gm)].map((m) => Number(m[1]));
  expect(shards.length).toBeGreaterThan(0);
  expect(shards).toEqual(Array.from({ length: shards.length }, (_, i) => i + 1));
  return shards.length;
}

const E2E_LINE = (n: number) =>
  `      - run: npm run test:e2e -- --shard=\${{ matrix.shard }}/${n} --grep-invert "${EXCLUDED_TITLE}"`;

test.describe("EV-224 CI workflow", () => {
  test("AC1 — runs on every push to any branch and on every pull request, with no filter", () => {
    // `(?! )` after pull_request: nothing may be nested under it (no `paths:`, no `branches:`).
    expect(code).toMatch(/^on:\n {2}push:\n {4}branches: \["\*\*"\]\n {2}pull_request:\n(?! )/m);
    expect(code.match(/^on:/gm)).toHaveLength(1);
    expect(code).not.toMatch(/paths(-ignore)?:|branches-ignore:|tags(-ignore)?:|types:/);
  });

  test("AC1 — every step is pinned whole, and nothing may swallow a failure", () => {
    for (const cmd of [
      "npm ci",
      "npm run lint",
      "npm run typecheck",
      "npm run build",
      "npm run test:contract",
      "npx playwright install --with-deps chromium",
      "npm run test:e2e:roster",
    ]) {
      expect(code, `missing or altered step: ${cmd}`).toMatch(stepLine(cmd));
    }
    expect(code.split("\n")).toContain(E2E_LINE(shardCount()));

    const block = (job: string) => jobBlock(job);
    for (const cmd of ["npm run lint", "npm run typecheck", "npm run build"]) {
      expect(block("static")).toMatch(stepLine(cmd));
    }
    expect(block("contract-drift")).toMatch(stepLine("npm run test:contract"));
    expect(block("e2e-roster")).toMatch(stepLine("npm run test:e2e:roster"));

    // Any form of "fail but carry on": the key at job or step level (literal or
    // expression), a shell `||`, or `set +e`.
    expect(code).not.toMatch(/continue-on-error/i);
    expect(code).not.toMatch(/\|\|/);
    expect(code).not.toMatch(/set\s+\+e/);
  });

  test("AC1 — the aggregate `ci` job is exactly this, and needs every other job", () => {
    expect(jobBlock("ci")).toBe(
      [
        "  ci:",
        "    name: ci",
        "    if: always()",
        "    needs: [static, contract-drift, e2e-fixture, e2e-roster]",
        "    runs-on: ubuntu-latest",
        "    timeout-minutes: 5",
        "    steps:",
        "      - name: every job succeeded",
        "        env:",
        "          RESULTS: ${{ join(needs.*.result, ' ') }}",
        "        run: |",
        '          echo "job results: $RESULTS"',
        "          for r in $RESULTS; do",
        '            if [ "$r" != "success" ]; then',
        "              echo \"::error::a CI job ended '$r' — this commit is red (advisory until R10)\"",
        "              exit 1",
        "            fi",
        "          done",
        "",
      ].join("\n")
    );
    // `ci` must be the last job and its needs list must name every other job.
    const jobs = [...code.slice(code.indexOf("\njobs:\n")).matchAll(/^ {2}([\w-]+):$/gm)].map((m) => m[1]);
    expect(jobs.at(-1)).toBe("ci");
    expect(jobs.slice(0, -1).sort()).toEqual(["contract-drift", "e2e-fixture", "e2e-roster", "static"]);
    // `always()` belongs to the aggregate alone.
    expect(code.match(/always\(\)/g)).toHaveLength(1);
  });

  test("AC3 — no secret, no token, no URL and no seeded credential; the token is read-only", () => {
    expect(code).not.toMatch(/\bsecrets\b/i);
    expect(code).not.toMatch(/\btoken\b/i);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/API_BASE_URL|COACH_API_MODE\s*:\s*live/);
    expect(text).not.toMatch(/Password123|@evoli\.fit/);

    expect(code).toMatch(/^permissions:\n {2}contents: read\n(?! )/m);
    expect(code.match(/permissions/g)).toHaveLength(1);
  });

  test("main — every production commit gets its own verdict (no cancel on main)", () => {
    expect(code).toContain(
      [
        "concurrency:",
        "  group: ${{ github.workflow }}-${{ github.ref }}",
        "  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}",
      ].join("\n")
    );
  });

  test("EV-235 boundary — exactly one excluded test, the one that needs the private b-fit-api", () => {
    expect(code.match(/--grep-invert/g)).toHaveLength(1);

    // AC1a: the comment block directly above the exclusion names the row that removes it.
    const all = text.split("\n");
    const at = all.findIndex((l) => l.includes("--grep-invert"));
    let first = at;
    while (first > 0 && /^\s*#/.test(all[first - 1])) first--;
    expect(first, "no comment directly above the --grep-invert line").toBeLessThan(at);
    expect(all.slice(first, at).join("\n")).toContain("EV-235");
    expect(code.match(/--grep(?!-invert)|--test-ignore|--last-failed|--only-changed/g)).toBeNull();

    /**
     * Playwright builds `--grep-invert` into a case-insensitive regex over the whole title
     * path (file, describe, test). So count the phrase, case-insensitive, in every spec
     * file but this one: exactly one occurrence, in the test it was written for. A second
     * test or describe block containing it would be silently excluded from CI.
     */
    const specs: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".spec.ts") && p !== __filename) specs.push(p);
      }
    };
    walk(join(ROOT, "qa"));
    const hits = specs.flatMap((file) =>
      (readFileSync(file, "utf8").match(new RegExp(escape(EXCLUDED_TITLE), "gi")) ?? []).map(() =>
        file.slice(ROOT.length + 1)
      )
    );
    expect(hits).toEqual(["qa/api-merge-condition.spec.ts"]);

    // Without full history there is no origin/main and the main-line limb fails.
    expect(jobBlock("e2e-fixture")).toMatch(/^ {10}fetch-depth: 0$/m);
  });

  test("BUG-249 — shards on separate servers, never more workers", () => {
    expect(code).not.toMatch(/--workers|\s-j\s*\d|fully-?parallel/i);
    const n = shardCount();
    expect(code.split("\n")).toContain(E2E_LINE(n));
    expect(code).toContain(`shard \${{ matrix.shard }}/${n})`);

    const ports = [...code.matchAll(/^\s+(?:port|COACH_PORT|COACH_ROSTER_PORT):\s*"(\d+)"\s*$/gm)].map((m) => m[1]);
    expect(ports.length).toBe(n + 1); // each shard + the roster job
    expect(new Set(ports).size).toBe(ports.length);
    // The surfaces' own ports are never used (3100 admin, 3200 landing, 3300 coach, 8080 api).
    for (const p of ports) expect(["3100", "3200", "3300", "8080"]).not.toContain(p);
  });
});
