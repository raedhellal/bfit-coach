import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * perf/coach-parallel-page-reads — what each main route costs b-fit-api, and how many
 * of those reads wait for another one.
 *
 * Every page is `force-dynamic` and reads the api on the server. The functions run in
 * iad1 and the api is in EU West, so each read is a ~85 ms round trip, and reads made
 * one after another add up. The witness is the fixture's api journal
 * (`src/lib/fixtureApiJournal.ts`, read from `GET /api/fixture/calls` as `api`). It holds
 * one entry per `CoachApi` call, which in live mode is one b-fit-api request, with its
 * start, end, render tag and whether it came from a document load or an RSC fetch.
 *
 * The `evoli_fixture_api_latency` cookie holds every call for that long, so a read that
 * waits for another one shows up in the timestamps. "Depth" below is the longest chain
 * of calls where each one starts after the previous one has ENDED. With a 120 ms hold, a
 * concurrent call starts within a few ms of its siblings, so the count does not depend
 * on machine speed.
 *
 * Measured on `next start` with an 80 ms hold, before → after this branch:
 *   · the routine tab with a template-applied draft: depth 4 → 3, api path 329 → ~245 ms;
 *   · a prefetch of `/clients/{id}` (one per roster row and per challenge participant):
 *     2 reads → 1. The roster with six rows made 12 background reads; now it makes 6.
 * Every other main route was already one round trip, or two where a consent check must
 * come first, and had no read made twice in one render. Those rows are pinned here so a
 * later change cannot add a waterfall or a duplicate without a red test.
 *
 * Populated scenario: the roster prefetch needs rows, and the challenge needs
 * participants. So this file runs in `playwright.roster.config.ts`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const ACTIVE_CHALLENGE = "c4a11e00-0000-4000-8000-000000000001";
const HOLD_MS = 120;

interface Entry {
  op: string;
  arg: string | null;
  document: boolean;
  request: string;
  start: number;
  end: number | null;
}

async function journal(page: Page): Promise<Entry[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  const body = (await res.json()) as { api?: Entry[] };
  expect(Array.isArray(body.api), "the calls route serves the api journal as `api`").toBe(true);
  return body.api!;
}

/** Sorted op names: a multiset, so a read made twice shows up twice. */
function ops(entries: Entry[]): string[] {
  return entries.map((e) => e.op).sort();
}

/** The longest chain of calls in which each one started after the previous one ENDED. */
function depth(entries: Entry[]): number {
  const sorted = [...entries].sort((a, b) => a.start - b.start);
  const chain: number[] = [];
  sorted.forEach((entry, i) => {
    let best = 1;
    for (let j = 0; j < i; j += 1) {
      const end = sorted[j].end;
      if (end !== null && end <= entry.start) best = Math.max(best, chain[j] + 1);
    }
    chain.push(best);
  });
  return Math.max(0, ...chain);
}

async function signIn(page: Page): Promise<void> {
  const login = await page.request.post("/api/auth/login", {
    data: { email: "coach@evoli.fit", password: "Password123!" },
    maxRedirects: 0,
  });
  expect(login.status()).toBe(200);
}

async function hold(page: Page, baseURL: string | undefined, ms: number): Promise<void> {
  await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: String(ms), url: baseURL! }]);
}

/** The document render's calls for one page load, and nothing a prefetch added. */
async function documentLoad(page: Page, route: string): Promise<Entry[]> {
  const before = (await journal(page)).length;
  const response = await page.goto(route, { waitUntil: "load" });
  expect(response?.status(), `${route} loads`).toBe(200);
  const mine = (await journal(page)).slice(before).filter((e) => e.document);
  // One render, not two: a second document request would hide a duplicate behind a tag.
  expect(new Set(mine.map((e) => e.request)).size, `${route}: one document render`).toBe(1);
  return mine;
}

/** Each main route, the reads its document render makes, and its depth. */
const ROUTES: { route: string; reads: string[]; depth: number; why?: string }[] = [
  { route: "/", reads: ["getMe", "listClients"], depth: 1 },
  { route: "/challenges", reads: ["getMe", "listChallenges", "listClients"], depth: 1 },
  { route: `/challenges/${ACTIVE_CHALLENGE}`, reads: ["getChallenge", "getMe"], depth: 1 },
  {
    route: `/clients/${LINA}`,
    reads: ["getClient", "getClientProgress", "getMe"],
    depth: 1,
    why: "the layout's overview and the page's reads run concurrently",
  },
  {
    route: `/clients/${LINA}/routine`,
    reads: ["getClient", "getMe", "getRoutine"],
    depth: 2,
    why: "the routine is read only after the overview's `scopes` show WORKOUTS (ADR-0015 D5)",
  },
  {
    route: `/clients/${LINA}/nutrition`,
    reads: ["getClient", "getFoodLog", "getMe", "getNutrition"],
    depth: 2,
    why: "the two nutrition reads wait for NUTRITION in the overview's `scopes`",
  },
  { route: "/templates", reads: ["getMe", "listClients", "listTemplates"], depth: 1 },
  { route: "/recipes", reads: ["getMe", "listRecipes"], depth: 1 },
  { route: "/nutrition-templates", reads: ["getMe", "listClients", "listNutritionTemplates"], depth: 1 },
];

test.describe("each main route's document render", () => {
  for (const { route, reads } of ROUTES) {
    test(`${route} makes each read once: ${reads.join(", ")}`, async ({ page }) => {
      await signIn(page);
      expect(ops(await documentLoad(page, route))).toEqual(reads);
    });
  }

  test("no main route waits on a read it could have started with the others", async ({ page, baseURL }) => {
    await signIn(page);
    await hold(page, baseURL, HOLD_MS);
    const measured: Record<string, number> = {};
    const expected: Record<string, number> = {};
    for (const { route, depth: want } of ROUTES) {
      measured[route] = depth(await documentLoad(page, route));
      expected[route] = want;
    }
    expect(measured).toEqual(expected);
  });
});

test.describe("the routine tab with a draft applied from a template", () => {
  test("reads the library alongside the draft: three round trips, not four", async ({ page, baseURL }) => {
    await signIn(page);
    // Through the dialog a coach uses, from the seed (EV-223): Yusuf has no draft.
    await page.goto("/templates");
    await page.getByRole("button", { name: "Use on a trainee" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("select").selectOption({ label: "Yusuf A." });
    await dialog.getByRole("button", { name: "Use this template" }).click();
    await page.waitForURL(`/clients/${YUSUF}/routine`);
    const startedFrom = page.getByText(/^Started from /);
    await expect(startedFrom).toBeVisible();
    const line = await startedFrom.textContent();

    await hold(page, baseURL, HOLD_MS);
    const entries = await documentLoad(page, `/clients/${YUSUF}/routine`);
    // What the coach sees is unchanged: the same line, from the same library read.
    await expect(page.getByText(/^Started from /)).toHaveText(line!);
    expect(ops(entries)).toEqual(["getClient", "getMe", "getRoutine", "getRoutineDraft", "listTemplates"]);
    // overview → routine → (draft ∥ library). Was overview → routine → draft → library.
    expect(depth(entries)).toBe(3);
  });
});

test.describe("prefetching a client page", () => {
  /**
   * The router state tree a `<Link>` on `/` sends with its prefetch, captured from a
   * production build. Sent by hand here so the count does not depend on `next start`:
   * `next dev` does not prefetch, but it renders a prefetch request the same way.
   */
  const ROSTER_TREE = encodeURIComponent(
    JSON.stringify(["", { children: ["(roster)", { children: ["__PAGE__", {}, null, null] }, null, null] }, null, null, true])
  );

  test("a prefetch of /clients/{id} reads the overview and nothing else", async ({ page }) => {
    await signIn(page);
    const before = (await journal(page)).length;
    const res = await page.request.get(`/clients/${LINA}`, {
      headers: { RSC: "1", "Next-Router-Prefetch": "1", "Next-Router-State-Tree": ROSTER_TREE, "Next-Url": "/" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/x-component");
    const entries = (await journal(page)).slice(before);
    // The overview decides the status (BUG-139) and stays. The coach's name was read
    // too and never used: a prefetch stops at `[id]/loading.tsx`, above the header.
    expect(ops(entries)).toEqual(["getClient"]);
  });

  test("the roster's row prefetches cost one read per row (production build)", async ({ page }) => {
    await signIn(page);
    const prefetched = new Set<string>();
    page.on("request", (req) => {
      const h = req.headers();
      const path = new URL(req.url()).pathname;
      if (h["next-router-prefetch"] === "1" && path.startsWith("/clients/")) prefetched.add(path);
    });
    const before = (await journal(page)).length;
    await page.goto("/", { waitUntil: "networkidle" });
    // A prefetch is fired when a link enters the viewport, after hydration, and its
    // render finishes after `networkidle` can already have fired.
    await page.waitForTimeout(1_000);
    await page.waitForLoadState("networkidle");
    test.skip(prefetched.size === 0, "next dev does not prefetch <Link>s; the hand-sent prefetch above covers it there");

    const entries = (await journal(page)).slice(before);
    const background = entries.filter((e) => !e.document);
    expect(ops(entries.filter((e) => e.document))).toEqual(["getMe", "listClients"]);
    expect(
      { reads: background.length, ops: [...new Set(background.map((e) => e.op))] },
      `${prefetched.size} client links were prefetched`
    ).toEqual({ reads: prefetched.size, ops: ["getClient"] });
  });
});
