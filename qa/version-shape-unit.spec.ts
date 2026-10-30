import { execFileSync } from "child_process";
import path from "path";
import { pathToFileURL } from "url";

import { expect } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * BUG-1067 — the build stamp is shape-checked BEFORE next.config.mjs inlines it.
 *
 * At coach `main` `75b6ff8` the config inlined `VERCEL_GIT_COMMIT_SHA` / `VERCEL_ENV` raw: a canary
 * build wrote `sk-live-canary-9d41` and `staging-canary-77ab` into `.next/server` (the compiled
 * /api/version route), `.next/cache` (the server webpack pack) and `required-server-files.json`,
 * while the endpoint itself correctly answered "unknown" / "local". The config is now evaluated
 * here the way `next build` evaluates it, in a child `node` with the variables set, so the test
 * reads the exact `env` object Next would inline. A test against the ambient environment could
 * not go red: a local shell has no Vercel variables either way.
 *
 * No server and no browser are needed; the resetting `test` is imported only so
 * `qa/fixture-isolation.spec.ts` needs no exemption for this file (as the other *-unit specs do).
 */

const repoRoot = path.resolve(__dirname, "..");
const CONFIG_URL = pathToFileURL(path.join(repoRoot, "next.config.mjs")).href;
const SHAPE_URL = pathToFileURL(path.join(repoRoot, "src/lib/version-shape.js")).href;
const ROUTE = "../src/app/api/version/route";
const LIB = "../src/lib/version";

const CANARY_COMMIT = "sk-live-canary-9d41";
const CANARY_ENV = "staging-canary-77ab";
const SHA = "0123456789abcdef0123456789abcdef01234567";

/** Every variable that can feed the stamp or the endpoint, cleared per case. */
const FED_BY = [
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_ENV",
  "VERCEL_REGION",
  "COACH_BUILD_COMMIT",
  "COACH_BUILD_ENV",
  "COACH_BUILD_TIME",
];

/** next.config.mjs's `env`, as a `next build` with these variables would compute it. */
function inlinedEnv(vars: Record<string, string>): Record<string, string> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of FED_BY) delete env[key];
  Object.assign(env, vars);
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", `const c = (await import(${JSON.stringify(CONFIG_URL)})).default; process.stdout.write(JSON.stringify(c.env));`],
    { cwd: repoRoot, env, encoding: "utf8" }
  );
  return JSON.parse(out) as Record<string, string>;
}

type Route = typeof import("../src/app/api/version/route");

/** GET /api/version, called as a handler with exactly these variables set. */
async function versionWith(vars: Record<string, string>) {
  const saved = Object.fromEntries(FED_BY.map((k) => [k, process.env[k]]));
  for (const key of FED_BY) delete process.env[key];
  Object.assign(process.env, vars);
  delete require.cache[require.resolve(ROUTE)];
  delete require.cache[require.resolve(LIB)];
  try {
    const route = require(ROUTE) as Route;
    const res = await route.GET();
    return (await res.json()) as Record<string, string>;
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test.describe("BUG-1067 — next.config.mjs inlines only a validated stamp", () => {
  test("the canary values are never inlined: they become the empty, not-stamped value", () => {
    const env = inlinedEnv({ VERCEL_GIT_COMMIT_SHA: CANARY_COMMIT, VERCEL_ENV: CANARY_ENV });

    expect(env.COACH_BUILD_COMMIT).toBe("");
    expect(env.COACH_BUILD_ENV).toBe("");
    const all = JSON.stringify(env);
    expect(all).not.toContain(CANARY_COMMIT);
    expect(all).not.toContain(CANARY_ENV);
    // The build time is generated, not read from the environment, and still stamps.
    expect(env.COACH_BUILD_TIME).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test("a valid SHA in upper case, padded with whitespace, stamps lower-cased and trimmed", () => {
    const env = inlinedEnv({ VERCEL_GIT_COMMIT_SHA: `  ${SHA.toUpperCase()}\n`, VERCEL_ENV: "production" });
    expect(env.COACH_BUILD_COMMIT).toBe(SHA);
  });

  for (const environment of ["production", "preview", "development"]) {
    test(`VERCEL_ENV=${environment} passes through unchanged`, () => {
      const env = inlinedEnv({ VERCEL_GIT_COMMIT_SHA: SHA, VERCEL_ENV: environment });
      expect(env.COACH_BUILD_ENV).toBe(environment);
      expect(env.COACH_BUILD_COMMIT).toBe(SHA);
    });
  }
});

test.describe("BUG-1067 — /api/version for a canary build", () => {
  test('answers commit "unknown" and environment "local" when the build stamp was refused', async () => {
    const stamp = inlinedEnv({ VERCEL_GIT_COMMIT_SHA: CANARY_COMMIT, VERCEL_ENV: CANARY_ENV });
    const body = await versionWith(stamp);
    expect(body.commit).toBe("unknown");
    expect(body.commitShort).toBe("unknown");
    expect(body.environment).toBe("local");
    expect(body.buildTime).toBe(stamp.COACH_BUILD_TIME);
  });

  test("a mis-set RUNTIME variable is not echoed either", async () => {
    const body = await versionWith({ VERCEL_GIT_COMMIT_SHA: CANARY_COMMIT, VERCEL_ENV: CANARY_ENV, VERCEL_REGION: "x" });
    expect(JSON.stringify(body)).not.toMatch(/canary|"x"/);
    expect(body).toMatchObject({ commit: "unknown", environment: "local", region: "unknown" });
  });

  test("a valid stamp is served as stamped", async () => {
    const stamp = inlinedEnv({ VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase(), VERCEL_ENV: "preview" });
    const body = await versionWith({ ...stamp, VERCEL_REGION: "cdg1" });
    expect(body).toEqual({
      commit: SHA,
      commitShort: SHA.slice(0, 7),
      buildTime: stamp.COACH_BUILD_TIME,
      environment: "preview",
      region: "cdg1",
    });
  });
});

test.describe("BUG-1067 — src/lib/version-shape.js, the one definition of each shape", () => {
  type Shape = typeof import("../src/lib/version-shape");
  const load = async () => (await import(SHAPE_URL)) as Shape;

  test("shapedCommit: 7 to 40 hex, trimmed and lower-cased, anything else is empty", async () => {
    const { shapedCommit } = await load();
    expect(shapedCommit(SHA)).toBe(SHA);
    expect(shapedCommit(` ${SHA.toUpperCase()} `)).toBe(SHA);
    expect(shapedCommit("ABCDEF1")).toBe("abcdef1");
    for (const bad of [undefined, "", "   ", "abcdef", `${SHA}0`, CANARY_COMMIT, "g123456", "0123456 789"]) {
      expect(shapedCommit(bad), String(bad)).toBe("");
    }
  });

  test("shapedEnvironment: the three Vercel values only", async () => {
    const { shapedEnvironment, ENVIRONMENTS } = await load();
    expect([...ENVIRONMENTS]).toEqual(["production", "preview", "development"]);
    for (const ok of ENVIRONMENTS) expect(shapedEnvironment(ok)).toBe(ok);
    expect(shapedEnvironment(" preview ")).toBe("preview");
    for (const bad of [undefined, "", "local", "Production", CANARY_ENV]) {
      expect(shapedEnvironment(bad), String(bad)).toBe("");
    }
  });

  test("shapedBuildTime and shapedRegion", async () => {
    const { shapedBuildTime, shapedRegion } = await load();
    expect(shapedBuildTime("2026-10-30T12:00:00.000Z")).toBe("2026-10-30T12:00:00.000Z");
    for (const bad of [undefined, "", "yesterday", "1730000000000", "2026-13-45T99:99"]) {
      expect(shapedBuildTime(bad), String(bad)).toBe("");
    }
    expect(shapedRegion("cdg1")).toBe("cdg1");
    for (const bad of [undefined, "", "CDG1", "cdg", "cdg12", "x"]) {
      expect(shapedRegion(bad), String(bad)).toBe("");
    }
  });
});
