import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * BUG-1103 slice 2, closes-when 2 — the fixture api journal's `request` tag is unique across
 * Next's module instances.
 *
 * The journal (`src/lib/fixtureApiJournal.ts`) is one list on `globalThis`, read through
 * `GET /api/fixture/calls` as `api`. Its `request` tag came from a MODULE-scoped counter, and
 * Next gives the RSC layer, a route handler and a server action separate module instances, so
 * each counted `r1, r2, …` on its own and their tags collided in the one journal. That made
 * `qa/coach-routine-ai-keep-reconcile.spec.ts:196` read 0 panel reads (it counts a read only
 * when its tag appears once) whenever the bell's unread-count poll or a page render happened to
 * carry the same number as the panel's proposal read.
 *
 * One journal, three sources, in one test:
 *   · ONE page render: a document load of Lina's routine tab (its reads, including the page's
 *     own `getRoutineAiProposal`, are the entries with `document: true` after the `goto`);
 *   · at least 3 server-action proposal reads: the panel's `readRoutineAiAction` poll, every
 *     2 s while a run is RUNNING (`evoli_fixture_ai_delay_ms` keeps it RUNNING ~7 s). These are
 *     the `getRoutineAiProposal` entries between the Generate click and READY: neither the start
 *     nor the read action revalidates, so no render happens in that window;
 *   · at least 3 `getNotificationsUnreadCount` entries: its only call site is the unread-count
 *     route (`src/app/api/bff/notifications/unread-count/route.ts`). The shell's poll adds one on
 *     mount, and the test calls the route 3 more times itself.
 *
 * Then: (a) every unread-count tag and every server-action read tag appears EXACTLY ONCE in the
 * journal; (b) the page render's entries still share ONE tag, and no entry outside that render
 * carries it — the property `qa/page-read-budget.spec.ts:121` counts renders by.
 *
 * Red on the old counter when the server is fresh (each instance's counter starts near 1, so the
 * route's and the action's tags overlap); green on the global counter at any server age.
 *
 * Failure messages print `op` and `request` only, never `arg`: an unread-count entry's `arg` is
 * the session's bearer token.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const ROUTE = `/clients/${LINA}/routine`;
const UNREAD = "/api/bff/notifications/unread-count";

type Entry = { op: string; arg: string | null; document: boolean; request: string };

async function journal(page: Page): Promise<Entry[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  return ((await res.json()) as { api: Entry[] }).api;
}

/** `op@request` for every entry whose tag is not on exactly one entry of the journal. */
function sharedTags(entries: Entry[], all: Entry[]): string[] {
  const perTag = new Map<string, string[]>();
  for (const e of all) perTag.set(e.request, [...(perTag.get(e.request) ?? []), e.op]);
  return entries
    .filter((e) => perTag.get(e.request)!.length !== 1)
    .map((e) => `${e.op}@${e.request} shares its tag with [${perTag.get(e.request)!.join(", ")}]`);
}

test("BUG-1103: unread-count and server-action tags are each unique; one page render keeps one tag", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const login = await page.request.post("/api/auth/login", {
    data: { email: "coach@evoli.fit", password: "Password123!" },
    maxRedirects: 0,
  });
  expect(login.status()).toBe(200);
  await page.context().addCookies([
    { name: "evoli_fixture_ai_caps", value: "on", url: baseURL! },
    { name: "evoli_fixture_ai_delay_ms", value: "7000", url: baseURL! },
  ]);

  // ── the one page render ────────────────────────────────────────────────────────────────
  const beforeRender = (await journal(page)).length;
  const loaded = await page.goto(ROUTE, { waitUntil: "load" });
  expect(loaded?.status(), `${ROUTE} loads`).toBe(200);
  // Indices into the journal, which only grows between resets: the render's entries are the
  // document-load entries after the `goto`.
  const renderAt = (await journal(page))
    .map((e, i) => ({ e, i }))
    .filter(({ e, i }) => i >= beforeRender && e.document)
    .map(({ i }) => i);
  const panel = page.getByTestId("routine-ai-panel");
  await page.getByRole("button", { name: "Regenerate with AI", exact: true }).click();
  const all0 = await journal(page);
  const render = renderAt.map((i) => all0[i]);
  expect(render.map((e) => e.op), "the routine tab's document render read the proposal").toContain(
    "getRoutineAiProposal"
  );

  // ── at least 3 server-action proposal reads (the panel's RUNNING poll) ────────────────
  const beforeGenerate = (await journal(page)).length;
  await panel.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(panel).toHaveAttribute("data-ai-state", "ready", { timeout: 30_000 });
  const generated = (await journal(page)).slice(beforeGenerate);
  expect(generated.map((e) => e.op), "the panel's start reached the fixture").toContain("startRoutineAiProposal");
  const actionReads = generated.filter((e) => e.op === "getRoutineAiProposal" && e.arg === LINA);
  expect(actionReads.length, "at least 3 server-action proposal reads").toBeGreaterThanOrEqual(3);
  expect(actionReads.every((e) => !e.document), "a server action is never a document load").toBe(true);

  // ── at least 3 unread-count reads from the route ──────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const res = await page.request.get(UNREAD, { maxRedirects: 0 });
    expect(res.status(), `GET ${UNREAD} #${i + 1}`).toBe(200);
  }

  const all = await journal(page);
  const unread = all.filter((e) => e.op === "getNotificationsUnreadCount");
  expect(unread.length, "at least 3 unread-count reads in the journal").toBeGreaterThanOrEqual(3);

  // (a) every unread-count tag and every server-action read tag appears exactly once.
  expect(sharedTags(unread, all), "(a) an unread-count read's tag is on another entry too").toEqual([]);
  expect(sharedTags(actionReads, all), "(a) a server-action proposal read's tag is on another entry too").toEqual(
    []
  );

  // (b) the one page render keeps one tag, and that tag is the render's alone.
  const renderTags = [...new Set(render.map((e) => e.request))];
  expect(renderTags.length, "(b) the page render's entries share one tag").toBe(1);
  const outside = all
    .map((e, i) => ({ e, i }))
    .filter(({ e, i }) => e.request === renderTags[0] && !renderAt.includes(i))
    .map(({ e }) => `${e.op}@${e.request}`);
  expect(outside, `(b) no entry outside the page render carries its tag ${renderTags[0]}`).toEqual([]);
});
