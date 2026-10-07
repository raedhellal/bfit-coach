import { expect, type BrowserContext, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-342k (audit A17) — the coach's name without a `GET /coach-portal/me` on every page.
 *
 * Until this slice every page started `readCoachMe()`, one `/me` read (on the api: a
 * profile query and an active-link count) per navigation and per action re-render, for
 * the header's name. The sign-in now writes the name and id into an httpOnly cookie
 * (`evoli_pro_coach`, `src/lib/session.ts`), and only the roster still reads `/me`,
 * because it needs the capacity.
 *
 * The witness is the fixture's api journal (`GET /api/fixture/calls`, `api`): one entry
 * per `CoachApi` call, which in live mode is one b-fit-api request. The per-route read
 * multisets for the populated roster are pinned in `page-read-budget.spec.ts`; this file
 * holds the cookie's own life cycle (K.1, K.4) and that the name is still on screen (K.2).
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const COACH_ID = "1a2b3c4d-0000-4000-8000-00000000c0ac";
const COACH_NAME = "Alex R.";
const IDENTITY = "evoli_pro_coach";

/** Every page but the roster: the lists, the editors' "new" pages, a trainee's three tabs, the denial page. */
const PAGES = [
  "/challenges",
  "/templates",
  "/templates/new",
  "/recipes",
  "/recipes/new",
  "/nutrition-templates",
  "/nutrition-templates/new",
  `/clients/${LINA}`,
  `/clients/${LINA}/routine`,
  `/clients/${LINA}/nutrition`,
  "/clients/denied",
];

interface Entry {
  op: string;
  document: boolean;
}

async function journal(page: Page): Promise<Entry[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  const body = (await res.json()) as { api?: Entry[] };
  expect(Array.isArray(body.api), "the calls route serves the api journal as `api`").toBe(true);
  return body.api!;
}

/** The `getMe` calls a page load made, prefetches included. */
async function meReadsDuring(page: Page, load: () => Promise<unknown>): Promise<number> {
  const before = (await journal(page)).length;
  await load();
  return (await journal(page)).slice(before).filter((e) => e.op === "getMe").length;
}

async function identityCookie(context: BrowserContext) {
  return (await context.cookies()).find((c) => c.name === IDENTITY);
}

/** The header's name, where the shell draws it at desktop width. */
function shellName(page: Page) {
  return page.locator(".shell-account-name");
}

test("K.1: the sign-in writes the coach's name and id into an httpOnly cookie, out of JavaScript's reach", async ({
  page,
  context,
}) => {
  await signInThroughForm(page);
  const cookie = await identityCookie(context);
  expect(cookie, `the ${IDENTITY} cookie exists after sign-in`).toBeTruthy();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe("Lax");
  expect(cookie!.path).toBe("/");
  const value = JSON.parse(decodeURIComponent(cookie!.value)) as { s: string; c: string; n: string };
  // Bound to the token's subject (the fixture coach's sub), and carrying `/me`'s two fields.
  expect(value).toEqual({ s: COACH_ID, c: COACH_ID, n: COACH_NAME });
  expect(await page.evaluate(() => document.cookie)).not.toContain(IDENTITY);
});

test("K.2: no page but the roster reads /coach-portal/me, and every one still shows the name", async ({ page }) => {
  await signInThroughForm(page);
  for (const path of PAGES) {
    const reads = await meReadsDuring(page, async () => {
      await page.goto(path);
      await expect(shellName(page), `${path} shows the coach's name`).toHaveText(COACH_NAME);
    });
    expect(reads, `${path}: GET /coach-portal/me reads`).toBe(0);
  }
});

test("K.3: the roster keeps its one /me read: the capacity is not on the cookie", async ({ page }) => {
  await signInThroughForm(page);
  const reads = await meReadsDuring(page, async () => {
    await page.goto("/");
    await expect(page.getByText("0 / 2 profiles · Starter", { exact: true })).toBeVisible();
    await expect(shellName(page)).toHaveText(COACH_NAME);
  });
  expect(reads).toBe(1);
});

test("K.4: signing out clears the cookie", async ({ page, context }) => {
  await signInThroughForm(page);
  expect(await identityCookie(context)).toBeTruthy();
  await page.goto("/templates");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/login");
  expect(await identityCookie(context)).toBeUndefined();
});

test("K.4: a session sent to /login by the guard loses the cookie too", async ({ page, context }) => {
  await signInThroughForm(page);
  // No access and no refresh token: middleware's `toLogin`, the session's other end.
  await context.clearCookies({ name: "evoli_pro_at" });
  await context.clearCookies({ name: "evoli_pro_rt" });
  expect(await identityCookie(context)).toBeTruthy();
  await page.goto("/templates");
  await page.waitForURL(/\/login$/);
  expect(await identityCookie(context)).toBeUndefined();
});

test("K.4: with no cookie, a page falls back to ONE /me read and still shows the name", async ({ page, context }) => {
  await signInThroughForm(page);
  await context.clearCookies({ name: IDENTITY });
  for (const path of ["/templates", `/clients/${LINA}`]) {
    const reads = await meReadsDuring(page, async () => {
      await page.goto(path);
      await expect(shellName(page), `${path} shows the coach's name`).toHaveText(COACH_NAME);
    });
    expect(reads, `${path}: one GET /coach-portal/me in place of the cookie`).toBe(1);
  }
});

test("a cookie written for another account is not believed: the name comes from /me", async ({
  page,
  context,
  baseURL,
}) => {
  await signInThroughForm(page);
  await context.addCookies([
    {
      name: IDENTITY,
      value: encodeURIComponent(JSON.stringify({ s: "someone-else", c: "someone-else", n: "Mallory" })),
      url: baseURL!,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const reads = await meReadsDuring(page, async () => {
    await page.goto("/templates");
    await expect(shellName(page)).toHaveText(COACH_NAME);
  });
  expect(reads).toBe(1);
  await expect(page.getByText("Mallory")).toHaveCount(0);
});
