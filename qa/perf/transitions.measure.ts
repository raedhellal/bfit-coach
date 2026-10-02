import { writeFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * ADR-0033 D33.11 — how long a coach waits between pages, and what a write costs.
 *
 * A MEASUREMENT, not a gate: its numbers depend on the machine, so it never asserts a
 * time. It runs only through `playwright.perf.config.ts` (the name does not match any
 * gate config's `*.spec.ts`) against a `next start` build you started yourself, in
 * either mode:
 *
 *   · fixture — `COACH_API_MODE=fixture COACH_FIXTURE_SCENARIO=populated`, with the
 *     `evoli_fixture_api_latency` hold (60 ms, ADR-0033) so a read costs a round trip.
 *     The api journal (`GET /api/fixture/calls`) gives the reads per transition and per
 *     Save draft, and every iteration starts from the seed (`DELETE /api/fixture/state`).
 *   · live — `COACH_API_MODE=live` against a LOCAL b-fit-api on a throwaway database.
 *     Never production: the credentials and ids come from the environment, and the
 *     config refuses a non-localhost base URL.
 *
 * Each of PERF_RUNS iterations is a fresh browser context (no router cache, no warm
 * prefetch), signed in, and walks the same path:
 *
 *   roster → client (first) → nutrition (first) → overview (revisit) → routine (first)
 *   → nutrition (revisit) → routine (revisit) → roster (revisit) → client (revisit)
 *   → roster (revisit) → challenges (first) → challenge (first) → challenges (revisit)
 *   → challenge (revisit) → three never-prefetched pushes (the `prefetch={false}` set:
 *   a `?nopf=` URL is a cache key nothing has prefetched) → Save draft on the routine.
 *
 * "first" is the first visit to that URL in the context, with Next's own `<Link>`
 * prefetch as production does it. "revisit" is a return within 30 s (staleTimes.dynamic).
 * Between steps the page settles: no RSC request in flight for 600 ms, so the prefetches
 * a coach's pause would allow have landed.
 *
 * Per transition: click → destination content in the DOM, plus one animation frame
 * (`paint`); the navigation's RSC request TTFB, or "none" when the router cache served
 * it; and (fixture) the api reads made while it ran. Per Save draft: click → notice,
 * click → the last RSC/action response, the requests sent, and (fixture) the reads and
 * the server renders behind them.
 */

const MODE = (process.env.PERF_MODE ?? "fixture") as "fixture" | "live";
const RUNS = Number(process.env.PERF_RUNS ?? 10);
const OUT = process.env.PERF_OUT;
const EMAIL = process.env.PERF_EMAIL ?? "coach@evoli.fit";
const PASSWORD = process.env.PERF_PASSWORD ?? "Password123!";
const CLIENT = process.env.PERF_CLIENT ?? "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001"; // fixture: Lina
const CHALLENGE = process.env.PERF_CHALLENGE ?? "c4a11e00-0000-4000-8000-000000000001";
const HOLD_MS = Number(process.env.PERF_HOLD_MS ?? 60);
/**
 * Live mode only: a URL answering the number of requests b-fit-api has received so far
 * (a counting proxy in front of the LOCAL api). Read around each Save draft, it gives
 * the api requests a save costs when there is no fixture journal to count them.
 */
const API_COUNTER = process.env.PERF_API_COUNTER;

async function apiCount(page: Page): Promise<number | null> {
  if (!API_COUNTER) return null;
  return Number(await (await page.request.get(API_COUNTER)).text());
}

/** What only the destination PAGE renders — never its `loading.tsx`, never the shell. */
interface Marker {
  path: string;
  selector: string;
  /** Optional exact text of one matching element. */
  text?: string;
}

const M = {
  roster: { path: "/", selector: `a[href="/clients/${CLIENT}"]` },
  overview: { path: `/clients/${CLIENT}`, selector: "section[aria-label]" },
  routine: { path: `/clients/${CLIENT}/routine`, selector: "#plan-name" },
  nutrition: { path: `/clients/${CLIENT}/nutrition`, selector: 'input[inputmode="numeric"]' },
  challenges: { path: "/challenges", selector: `a[href="/challenges/${CHALLENGE}"]` },
  // Set per run from the document load: the detail page's <h1> is the challenge title.
  challenge: { path: `/challenges/${CHALLENGE}`, selector: "h1" } as Marker,
} satisfies Record<string, Marker>;

interface Sample {
  label: string;
  paintMs: number;
  domMs: number;
  /** null when no RSC request was made for the navigation (router cache). */
  ttfbMs: number | null;
  /** The navigation's RSC response, start to last byte (Next flushes headers first). */
  rscEndMs: number | null;
  rscRequests: number;
  reads: string[] | null;
}

interface SaveSample {
  noticeMs: number;
  settledMs: number;
  actionPosts: number;
  rscGets: number;
  reads: string[] | null;
  renders: number | null;
  /** Live: api requests during the save, the PUT itself included. */
  apiRequests: number | null;
}

interface JournalEntry {
  op: string;
  request: string;
  start: number;
  end: number | null;
}

const samples: Sample[] = [];
const saves: SaveSample[] = [];

async function journal(page: Page): Promise<JournalEntry[] | null> {
  if (MODE !== "fixture") return null;
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls").toBe(200);
  return ((await res.json()) as { api: JournalEntry[] }).api;
}

/** Tracks RSC/action requests in flight, so "settled" means the router is idle. */
function tracker(page: Page) {
  const open = new Set<unknown>();
  let lastChange = Date.now();
  const log: { method: string; url: string; prefetch: boolean; action: boolean; at: number }[] = [];
  const isRouter = (url: string, headers: Record<string, string>) =>
    url.includes("_rsc=") || headers["next-action"] !== undefined || headers["rsc"] === "1";
  page.on("request", (req) => {
    const h = req.headers();
    if (!isRouter(req.url(), h)) return;
    open.add(req);
    lastChange = Date.now();
    log.push({
      method: req.method(),
      url: req.url(),
      prefetch: h["next-router-prefetch"] === "1",
      action: h["next-action"] !== undefined,
      at: Date.now(),
    });
  });
  const done = (req: unknown) => {
    if (!open.delete(req)) return;
    lastChange = Date.now();
  };
  // A document load aborts the previous document's fetches without a requestfailed.
  page.on("domcontentloaded", () => {
    open.clear();
    lastChange = Date.now();
  });
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  return {
    log,
    async settle(quietMs = 600) {
      const deadline = Date.now() + 20_000;
      while (Date.now() < deadline) {
        if (open.size === 0 && Date.now() - lastChange >= quietMs) return;
        await page.waitForTimeout(50);
      }
      const urls = [...open].map((r) => (r as { url(): string }).url());
      throw new Error(`router never settled: ${urls.join(", ")}`);
    },
  };
}

/**
 * Click a link (or push a URL through the app router) and time the destination's
 * content, inside the page so Playwright's own actionability checks are not counted.
 */
async function navigate(page: Page, how: "click" | "push", href: string, marker: Marker) {
  return page.evaluate(
    async ({ how, href, marker }) => {
      const matches = () =>
        location.pathname === marker.path &&
        [...document.querySelectorAll(marker.selector)].some(
          (el) => marker.text === undefined || el.textContent?.trim() === marker.text
        );
      if (matches()) throw new Error(`marker for ${marker.path} already present before navigating`);
      const t0 = performance.now();
      const result = new Promise<{ dom: number; paint: number }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for ${marker.path}`)), 20_000);
        const observer = new MutationObserver(() => {
          if (!matches()) return;
          observer.disconnect();
          clearTimeout(timer);
          const dom = performance.now();
          requestAnimationFrame(() => resolve({ dom, paint: performance.now() }));
        });
        observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
      });
      if (how === "click") {
        const link = document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
        if (!link) throw new Error(`no link to ${href}`);
        link.click();
      } else {
        (window as unknown as { next: { router: { push(h: string): void } } }).next.router.push(href);
      }
      const { dom, paint } = await result;
      const path = href.split("?")[0];
      const rsc = performance
        .getEntriesByType("resource")
        .filter((e) => e.startTime >= t0 - 1 && e.startTime <= dom && e.name.includes("_rsc="))
        .map((e) => e as PerformanceResourceTiming)
        .filter((e) => new URL(e.name).pathname === path);
      return {
        domMs: dom - t0,
        paintMs: paint - t0,
        ttfbMs: rsc.length ? rsc[0].responseStart - rsc[0].startTime : null,
        rscEndMs: rsc.length ? rsc[0].responseEnd - rsc[0].startTime : null,
        rscRequests: rsc.length,
      };
    },
    { how, href, marker }
  );
}

async function step(
  page: Page,
  settle: () => Promise<void>,
  label: string,
  how: "click" | "push",
  href: string,
  marker: Marker
) {
  const before = (await journal(page))?.length ?? 0;
  const startedAt = Date.now();
  const m = await navigate(page, how, href, marker);
  const navEnd = startedAt + m.paintMs;
  await settle();
  const entries = await journal(page);
  const reads = entries
    ? entries
        .slice(before)
        .filter((e) => e.start <= navEnd)
        .map((e) => e.op)
        .sort()
    : null;
  samples.push({ label, ...m, reads });
}

async function signIn(context: BrowserContext, baseURL: string) {
  const login = await context.request.post("/api/auth/login", {
    data: { email: EMAIL, password: PASSWORD },
    maxRedirects: 0,
  });
  expect(login.status(), "sign-in").toBe(200);
  if (MODE === "fixture") {
    const reset = await context.request.delete("/api/fixture/state", { maxRedirects: 0 });
    expect(reset.status(), "fixture reset").toBe(200);
    await context.addCookies([{ name: "evoli_fixture_api_latency", value: String(HOLD_MS), url: baseURL }]);
  }
}

async function saveDraft(page: Page, log: ReturnType<typeof tracker>["log"], settle: (quietMs?: number) => Promise<void>) {
  const sets = page.getByLabel("Sets").first();
  const current = Number(await sets.inputValue());
  await sets.fill(String(current >= 9 ? 3 : current + 1));
  await settle();
  const before = (await journal(page))?.length ?? 0;
  const countBefore = await apiCount(page);
  const logFrom = log.length;
  const t0 = Date.now();
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByText(/^Draft saved /).waitFor();
  const noticeMs = Date.now() - t0;
  await settle(800);
  const mine = log.slice(logFrom).filter((r) => !r.prefetch);
  const responses = await page.evaluate((from) => {
    return performance
      .getEntriesByType("resource")
      .map((e) => e as PerformanceResourceTiming)
      .filter((e) => e.initiatorType === "fetch" && performance.timeOrigin + e.startTime >= from)
      .map((e) => performance.timeOrigin + e.responseEnd);
  }, t0);
  const countAfter = await apiCount(page);
  const entries = await journal(page);
  const reads = entries ? entries.slice(before).filter((e) => e.op !== "saveRoutineDraft") : null;
  saves.push({
    noticeMs,
    settledMs: Math.max(noticeMs, ...responses.map((end) => end - t0)),
    actionPosts: mine.filter((r) => r.action).length,
    rscGets: mine.filter((r) => !r.action && r.method === "GET").length,
    reads: reads ? reads.map((e) => e.op).sort() : null,
    renders: reads ? new Set(reads.map((e) => e.request)).size : null,
    // The counter's own GET is not counted: it is answered by the proxy, not forwarded.
    apiRequests: countBefore === null || countAfter === null ? null : countAfter - countBefore - 1,
  });
}

test.describe.configure({ mode: "serial" });

for (let run = 1; run <= RUNS; run += 1) {
  test(`run ${run}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    try {
      await signIn(context, baseURL!);
      const page = await context.newPage();
      const t = tracker(page);
      const settle = (quietMs?: number) => t.settle(quietMs);

      await page.goto(M.challenge.path);
      const title = (await page.locator("h1").first().textContent())?.trim();
      expect(title, "challenge title").toBeTruthy();
      const challenge: Marker = { ...M.challenge, text: title! };

      await page.goto("/");
      await page.locator(M.roster.selector).first().waitFor();
      await settle();

      await step(page, settle, "roster → client (first)", "click", M.overview.path, M.overview);
      await step(page, settle, "client → nutrition (first)", "click", M.nutrition.path, M.nutrition);
      await step(page, settle, "nutrition → overview (revisit)", "click", M.overview.path, M.overview);
      await step(page, settle, "overview → routine (first)", "click", M.routine.path, M.routine);
      await step(page, settle, "routine → nutrition (revisit)", "click", M.nutrition.path, M.nutrition);
      await step(page, settle, "nutrition → routine (revisit)", "click", M.routine.path, M.routine);
      await step(page, settle, "routine → roster (revisit)", "click", "/", M.roster);
      await step(page, settle, "roster → client (revisit)", "click", M.overview.path, M.overview);
      await step(page, settle, "client → roster (revisit)", "click", "/", M.roster);
      await step(page, settle, "roster → challenges (first)", "click", M.challenges.path, M.challenges);
      await step(page, settle, "challenges → challenge (first)", "click", M.challenge.path, challenge);
      await step(page, settle, "challenge → challenges (revisit)", "click", M.challenges.path, M.challenges);
      await step(page, settle, "challenges → challenge (revisit)", "click", M.challenge.path, challenge);

      // The prefetch={false} set: a `?nopf=` URL is a cache key no <Link> has prefetched.
      const n = `${run}-${Date.now()}`;
      await step(page, settle, "challenge → client (no prefetch)", "push", `${M.overview.path}?nopf=${n}`, M.overview);
      await step(page, settle, "client → nutrition (no prefetch)", "push", `${M.nutrition.path}?nopf=${n}`, M.nutrition);
      await step(page, settle, "nutrition → client (no prefetch)", "push", `${M.overview.path}?nopf=${n}b`, M.overview);

      await page.goto(M.routine.path);
      await page.locator(M.routine.selector).waitFor();
      await settle();
      await saveDraft(page, t.log, settle);
    } finally {
      await context.close();
    }
  });
}

function pct(sorted: number[], p: number): number {
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

test.afterAll(() => {
  const labels = [...new Set(samples.map((s) => s.label))];
  const table = labels.map((label) => {
    const mine = samples.filter((s) => s.label === label);
    const paint = mine.map((s) => s.paintMs).sort((a, b) => a - b);
    const ttfb = mine.flatMap((s) => (s.ttfbMs === null ? [] : [s.ttfbMs])).sort((a, b) => a - b);
    const rscEnd = mine.flatMap((s) => (s.rscEndMs === null ? [] : [s.rscEndMs])).sort((a, b) => a - b);
    const reads = mine.map((s) => s.reads?.join("+") ?? "-");
    return {
      label,
      n: mine.length,
      paintMedian: Math.round(pct(paint, 0.5)),
      paintP90: Math.round(pct(paint, 0.9)),
      paintMax: Math.round(paint[paint.length - 1]),
      ttfbMedian: ttfb.length ? Math.round(pct(ttfb, 0.5)) : null,
      rscEndMedian: rscEnd.length ? Math.round(pct(rscEnd, 0.5)) : null,
      withRequest: ttfb.length,
      reads: [...new Set(reads)],
    };
  });
  const noticeSorted = saves.map((s) => s.noticeMs).sort((a, b) => a - b);
  const settledSorted = saves.map((s) => s.settledMs).sort((a, b) => a - b);
  const save = saves.length
    ? {
        n: saves.length,
        noticeMedian: pct(noticeSorted, 0.5),
        noticeP90: pct(noticeSorted, 0.9),
        settledMedian: pct(settledSorted, 0.5),
        settledP90: pct(settledSorted, 0.9),
        actionPosts: [...new Set(saves.map((s) => s.actionPosts))],
        rscGets: [...new Set(saves.map((s) => s.rscGets))],
        reads: [...new Set(saves.map((s) => s.reads?.join("+") ?? "-"))],
        renders: [...new Set(saves.map((s) => s.renders))],
        apiRequests: [...new Set(saves.map((s) => s.apiRequests))],
      }
    : null;
  const report = { mode: MODE, holdMs: MODE === "fixture" ? HOLD_MS : null, runs: RUNS, table, save, samples, saves };
  // The report IS the output of a measurement run.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ table, save }, null, 2));
  if (OUT) writeFileSync(OUT, JSON.stringify(report, null, 2));
});
