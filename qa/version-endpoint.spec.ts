import { expect } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * GET /api/version — the deploy marker.
 *
 * The lesson it encodes: on 2026-09-17 the portal was deployed ahead of b-fit-api and
 * nobody could tell which commit was serving, because "the site returns 200" is
 * evidence of nothing — the OLD build returns 200 too. The api is verified by polling
 * /actuator/info for `build.commit`; this endpoint is the portal's equivalent, so the
 * three properties asserted here are the ones a refactor must never break: it is
 * reachable with NO session, it is never cached, and it leaks nothing.
 *
 * Runs in the default (fixture) config: no backend, no session, no b-fit-api.
 */

const PATH = "/api/version";

/** Every field the body is allowed to contain. A new key here is a deliberate act. */
const ALLOWED_KEYS = ["commit", "commitShort", "buildTime", "environment"];

test("answers 200 with the version shape and no session cookie", async ({ request }) => {
  const res = await request.get(PATH);

  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/json");

  const body = (await res.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual([...ALLOWED_KEYS].sort());

  // Either a real git SHA or an honest "unknown" — never a placeholder, never a
  // fabricated or truncated-to-look-real value. The gate suite has no Vercel
  // environment, so here it is "unknown", and that is the correct answer.
  expect(body.commit).toMatch(/^(unknown|[0-9a-f]{7,40})$/);
  if (body.commit === "unknown") {
    expect(body.commitShort).toBe("unknown");
  } else {
    expect(body.commitShort).toBe(String(body.commit).slice(0, 7));
  }
  expect(body.buildTime).toMatch(/^(unknown|\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/);
  expect(["production", "preview", "development", "local"]).toContain(body.environment);

  // No Vercel environment locally: the honest answers, not a stale SHA from git.
  expect(body.commit).toBe("unknown");
  expect(body.environment).toBe("local");
});

test("middleware does not bounce it to /login", async ({ page, context }) => {
  await context.clearCookies();
  const res = await page.goto(PATH);

  expect(res?.status()).toBe(200);
  expect(page.url()).toContain(PATH);
  // A guarded route would have redirected; prove the guard is awake by contrast.
  const guarded = await page.goto("/");
  expect(guarded?.url()).toContain("/login");
});

test("is never cached — a cached marker would report the previous deploy", async ({
  request,
}) => {
  const res = await request.get(PATH);
  expect(res.status()).toBe(200);
  // /login also answers no-store, so pin the content type too: this test must fail if
  // the endpoint is ever guarded away and the body becomes the login page.
  expect(res.headers()["content-type"]).toContain("application/json");
  const cacheControl = res.headers()["cache-control"] || "";

  expect(cacheControl).toContain("no-store");
  expect(cacheControl).not.toContain("max-age=3");
  // Two reads in a row must both be served fresh, not from Next's route cache.
  const again = await request.get(PATH);
  expect(again.status()).toBe(200);
  expect((again.headers()["cache-control"] || "")).toContain("no-store");
});

test("leaks nothing: no env, no api base url, no config, no paths", async ({ request }) => {
  const res = await request.get(PATH);
  const raw = await res.text();

  for (const secret of [
    "localhost:8080",
    "API_BASE_URL",
    "COACH_API_MODE",
    "INVITE_BASE_URL",
    "JWT",
    "SECRET",
    "TOKEN",
    "node_modules",
    "/Users/",
    "next",
  ]) {
    expect(raw.toLowerCase()).not.toContain(secret.toLowerCase());
  }
  // Belt and braces on the shape: no nesting, only strings.
  const body = (await res.json()) as Record<string, unknown>;
  for (const value of Object.values(body)) expect(typeof value).toBe("string");
});

test("refuses a write: POST is 405 with Allow, and never renders a page", async ({
  request,
}) => {
  const res = await request.post(PATH, { data: {} });

  expect(res.status()).toBe(405);
  expect(res.headers()["allow"]).toBe("GET, HEAD");
  expect(await res.text()).toBe("");
});
