import { expect, type Page, type Request } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * perf/coach-parallel-page-reads — what each main route costs b-fit-api, and how many
 * of those reads wait for another one.
 *
 * Every page is `force-dynamic` and reads the api on the server. Since main 8d72e4c the
 * functions are pinned to cdg1, and each read is a round trip from cdg1 to b-fit-api in
 * EU West. That trip is short, but reads made one after another still add up. The
 * witness is the fixture's api journal
 * (`src/lib/fixtureApiJournal.ts`, read from `GET /api/fixture/calls` as `api`). It holds
 * one entry per `CoachApi` call, which in live mode is one b-fit-api request, with its
 * start, end, render tag and whether it came from a document load or an RSC fetch.
 *
 * The `evoli_fixture_api_latency` cookie holds every call for that long, so a read that
 * waits for another one shows up in the timestamps. The 120 ms hold here (80 ms in the
 * branch's measurements) is a deliberately EXAGGERATED stand-in for the round trip,
 * chosen so a waterfall step is far larger than timer noise. It is not a prediction of
 * production latency. "Depth" below is the longest chain
 * of calls where each one starts after the previous one has ENDED. With a 120 ms hold, a
 * concurrent call starts within a few ms of its siblings, so the count does not depend
 * on machine speed.
 *
 * Measured on `next start` with an 80 ms hold, before → after this branch:
 *   · a prefetch of `/clients/{id}` (one per roster row and per challenge participant):
 *     2 reads → 1. The roster with six rows made 12 background reads; now it makes 6.
 *     perf/coach-fast-routes-no-skeleton (no loading.tsx under `[id]`): 1 → 0, so the
 *     roster's background reads went 6 → 0.
 *
 * The routine tab with a draft stays sequential BY RULING (staff, 2026-10-01): the draft
 * is read only after `hasDraft`, and the template library only after the draft names a
 * template. Reading the library alongside the draft saved one short cdg1 round trip, and
 * it cost two unused `GET /coach-portal/templates` per Save draft on every non-template
 * draft, because a save re-rendered the page twice (revalidatePath + router.refresh).
 * Both draft rows are pinned below, so that ordering is a decision a test holds.
 *
 * ADR-0033 branch 2a removed that second render: a write whose action revalidates is
 * re-rendered ONCE, inside the action's own response, and the island no longer calls
 * `router.refresh()` after it. "What one write costs" below pins it: a Save draft and a
 * publish each make exactly one render's reads, and no RSC GET follows the action POST.
 * Every other main route was already one round trip, or two where a consent check must
 * come first, and had no read made twice in one render. Those rows are pinned here so a
 * later change cannot add a waterfall or a duplicate without a red test.
 *
 * Populated scenario: the roster prefetch needs rows, and the challenge needs
 * participants. So this file runs in `playwright.roster.config.ts`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
/** No meal week in the seed: the first Apply writes one. */
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
/** A shoulder injury: publishing her plan repairs two exercises. */
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
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
  { route: "/", reads: ["getMe", "listClients", "listInvited"], depth: 1 }, // EV-204b: the Invited read, in the same round trip
  { route: "/challenges", reads: ["getMe", "listChallenges", "listClients"], depth: 1 },
  { route: `/challenges/${ACTIVE_CHALLENGE}`, reads: ["getChallenge", "getMe"], depth: 1 },
  {
    // EV-337e (plan §5.2, G11/G12): the programme and nutrition summary cards cost one read
    // each, made only after the overview's `scopes` show WORKOUTS / NUTRITION (ADR-0015 D5),
    // in parallel: one more round trip, the « 2 where a consent check must come first » shape.
    route: `/clients/${LINA}`,
    reads: ["getClient", "getClientProgress", "getMe", "getNutrition", "getRoutine"],
    depth: 2,
    why: "the summary reads wait for the overview's `scopes`; the monitoring read and the name do not",
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

test.describe("the routine tab with a draft", () => {
  test("applied from a template: reads the library only after the draft names it", async ({ page, baseURL }) => {
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
    await expect(page.getByText(/^Started from /)).toHaveText(line!);
    expect(ops(entries)).toEqual(["getClient", "getMe", "getRoutine", "getRoutineDraft", "listTemplates"]);
    // overview → routine → draft → library: each read is decided by the one before it.
    expect(depth(entries)).toBe(4);
  });

  test("written by hand: never reads the template library", async ({ page, baseURL }) => {
    await signIn(page);
    // From the seed (EV-223): Lina has a published plan and no draft. One edit and a
    // save make a draft with no `sourceTemplateId`.
    await page.goto(`/clients/${LINA}/routine`);
    await page.getByLabel("Sets").first().fill("5");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();

    await hold(page, baseURL, HOLD_MS);
    const entries = await documentLoad(page, `/clients/${LINA}/routine`);
    await expect(page.getByText("Draft — not yet published")).toBeVisible();
    await expect(page.getByText(/^Started from /)).toHaveCount(0);
    expect(ops(entries)).toEqual(["getClient", "getMe", "getRoutine", "getRoutineDraft"]);
    // overview → routine → draft.
    expect(depth(entries)).toBe(3);
  });
});

test.describe("what one write costs (ADR-0033 branch 2a)", () => {
  /**
   * A write is a server action that calls `revalidatePath`. On Next 14.2 that makes the
   * action's own response carry the page rendered after the write, and the router
   * applies it. Until branch 2a the island then called `router.refresh()`, which
   * rendered the whole page AGAIN: every read twice, and an RSC GET after the POST.
   * Each row below was red on 294e5fec with exactly that: 2 renders, 1 RSC GET.
   *
   * `rscGets` counts navigation/refresh RSC requests, not prefetches (`next dev` sends
   * none anyway). "Settled" is the journal quiet for 500 ms, never `networkidle`
   * (ADR-0033 D33.11).
   *
   * The page's OWN prefetches are settled first. On a `next start` build the client
   * tabs prefetch the overview in full after hydration, and a write clicked straight
   * after the load counted that render as the write's (measured: 2 renders, the second
   * `getClient + getClientProgress + getMe`).
   */
  async function journalQuiet(page: Page) {
    let seen = -1;
    await expect
      .poll(
        async () => {
          const n = (await journal(page)).length;
          const quiet = n === seen;
          seen = n;
          return quiet;
        },
        { intervals: [500], timeout: 15_000, message: "the api journal settles" }
      )
      .toBe(true);
  }

  async function writeCost(page: Page, write: () => Promise<void>, writeOps: string[]) {
    await page.waitForLoadState("networkidle");
    await journalQuiet(page);
    const before = (await journal(page)).length;
    let actionPosts = 0;
    let rscGets = 0;
    const onRequest = (req: Request) => {
      const h = req.headers();
      if (h["next-action"]) actionPosts += 1;
      else if (req.method() === "GET" && h["rsc"] === "1" && h["next-router-prefetch"] !== "1") rscGets += 1;
    };
    page.on("request", onRequest);
    await write();
    await journalQuiet(page);
    page.off("request", onRequest);
    const reads = (await journal(page)).slice(before).filter((e) => !writeOps.includes(e.op));
    return { actionPosts, rscGets, reads: ops(reads), renders: new Set(reads.map((e) => e.request)).size };
  }

  test("Save draft: one action, one render, no refresh", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);
    await page.getByLabel("Sets").first().fill("5");
    const cost = await writeCost(
      page,
      async () => {
        await page.getByRole("button", { name: "Save draft" }).click();
        await expect(page.getByText(/^Draft saved /)).toBeVisible();
      },
      ["saveRoutineDraft"]
    );
    expect(cost).toEqual({
      actionPosts: 1,
      rscGets: 0,
      reads: ["getClient", "getMe", "getRoutine", "getRoutineDraft"],
      renders: 1,
    });
  });

  test("Publish with these changes: one action, one render, no refresh", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${DANA}/routine`);
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const confirm = page.getByRole("dialog").getByRole("button", { name: "Publish with these changes" });
    await expect(confirm).toBeVisible();
    const cost = await writeCost(
      page,
      async () => {
        await confirm.click();
        await expect(page.getByText("Published. The trainee sees it next time they open the app.")).toBeVisible();
      },
      ["publishRoutine"]
    );
    // The publish deleted the draft, so the render reads no draft.
    expect(cost).toEqual({ actionPosts: 1, rscGets: 0, reads: ["getClient", "getMe", "getRoutine"], renders: 1 });
  });

  test("Save targets: one action, one render, no refresh", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/nutrition`);
    await page.getByLabel("Calories").fill("2300");
    await page.getByRole("button", { name: "Save targets" }).click();
    const cost = await writeCost(
      page,
      async () => {
        await page.getByRole("dialog").getByRole("button", { name: "Save targets" }).click();
        await expect(page.getByText("Targets saved.")).toBeVisible();
      },
      ["saveNutritionTargets"]
    );
    expect(cost).toEqual({
      actionPosts: 1,
      rscGets: 0,
      reads: ["getClient", "getFoodLog", "getMe", "getNutrition"],
      renders: 1,
    });
  });

  test("Apply a meal week: one action, one render, and the card shows the action's week", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/nutrition`);
    await page.getByRole("button", { name: "Apply to Nils K." }).click();
    const cost = await writeCost(
      page,
      async () => {
        await page.getByRole("dialog").getByRole("button", { name: "Apply", exact: true }).click();
        await expect(page.getByRole("button", { name: /^Regenerate day: / })).toHaveCount(7);
      },
      ["applyMealWeek"]
    );
    expect(cost).toEqual({
      actionPosts: 1,
      rscGets: 0,
      reads: ["getClient", "getFoodLog", "getMe", "getNutrition"],
      renders: 1,
    });
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

  /**
   * perf/coach-fast-routes-no-skeleton: no segment under `[id]` has a `loading.tsx`, and
   * Next 14.2 renders a prefetch only down to the first loading boundary — with none,
   * it sends the route tree and renders nothing. Until then this read the overview
   * (`getClient`, BUG-139's status read) once per prefetch; the click now renders the
   * layout and the page together (the overview read was always repeated by the click
   * anyway, so a navigation's reads are unchanged).
   */
  test("a prefetch of /clients/{id} reads nothing", async ({ page }) => {
    await signIn(page);
    const before = (await journal(page)).length;
    const res = await page.request.get(`/clients/${LINA}`, {
      headers: { RSC: "1", "Next-Router-Prefetch": "1", "Next-Router-State-Tree": ROSTER_TREE, "Next-Url": "/" },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/x-component");
    const entries = (await journal(page)).slice(before);
    expect(ops(entries)).toEqual([]);
  });

  test("the roster's row prefetches cost no read (production build)", async ({ page }) => {
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
    ).toEqual({ reads: 0, ops: [] });
    // The rows were prefetched (the route tree), so the count above is not vacuous.
    expect(prefetched.size).toBeGreaterThan(0);
  });
});
