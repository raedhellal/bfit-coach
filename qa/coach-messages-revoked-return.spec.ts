import { expect, type Page, type Request } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { isProductionBuild } from "./production-build";

/**
 * BUG-942 — after the link ends, a return to « Messages » through the client router cache shows
 * the ended-link state (`/clients/denied`, no composer) within 1 s, whatever the unread count.
 *
 * A return inside `staleTimes.dynamic` (30 s, ADR-0033 D33.0) is drawn from the router cache with
 * no server render, so the layout's 403 decision is not made again; since BUG-938 the remounted
 * island made no request either, so nothing found out about the revoke until the first poll's 403
 * (15 s idle, 5 s inside a send window). On `b678a5b` a redundant mark-read 403'd at once, but only
 * when the page's read had `unread > 0`; the two cases are both here.
 *
 * Fixture mode; runs in the default (dev) suite AND in `playwright.start.config.ts` (a production
 * build), where the router cache behaves as shipped. `evoli_fixture_link=ended` (this browser
 * context only) is the revoke: every read and write about the trainee is the guard's 403.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const THREAD = `/clients/${LINA}/messages`;
const BFF = `/api/bff/clients/${LINA}/messages`;
const DENIED = "This trainee is not on your roster. They may have revoked access.";

test.use({ locale: "en-US", timezoneId: "Europe/Paris" });

function note(type: string, description: string): void {
  test.info().annotations.push({ type: `BUG-942 ${type}`, description });
}

async function traineeWrites(page: Page, body: string): Promise<void> {
  const res = await page.request.post("/api/fixture/messages", { data: { clientId: LINA, body }, maxRedirects: 0 });
  expect(res.status(), "the client's message").toBe(200);
}

function tabs(page: Page) {
  return page.getByRole("main").getByRole("navigation", { name: "Trainee sections", exact: true });
}

async function openThread(page: Page): Promise<void> {
  await page.goto(THREAD);
  await expect(page.locator("[data-nav-progress-ready]"), "the page hydrated").toHaveCount(1);
  await expect(page.locator("form.msg-composer textarea")).toBeEditable();
}

/** The page's requests from the click on: thread GETs, mark-read POSTs, and a timeline of what led to the denial. */
function count(page: Page) {
  const gets: number[] = [];
  const reads: number[] = [];
  const timeline: Array<{ at: number; what: string }> = [];
  page.on("request", (r: Request) => {
    const url = new URL(r.url());
    if (r.method() === "GET" && url.pathname === BFF) gets.push(Date.now());
    if (r.method() === "POST" && url.pathname === `${BFF}/read`) reads.push(Date.now());
    if (url.pathname === BFF || r.headers()["rsc"] === "1") timeline.push({ at: Date.now(), what: `${r.method()} ${url.pathname}${r.headers()["rsc"] === "1" ? " (RSC)" : ""}` });
  });
  page.on("response", (res) => {
    const url = new URL(res.url());
    if (url.pathname === BFF || res.request().headers()["rsc"] === "1") timeline.push({ at: Date.now(), what: `${res.status()} ${url.pathname}` });
  });
  return { gets, reads, timeline };
}

/**
 * Runs in every document (an init script) and once in the page already shown: while armed, notes in
 * sessionStorage the last frame a composer was drawn and the first frame on /clients/denied with a
 * heading and no composer. Self-contained: it is serialised into the page.
 */
function watchForTheDenial(): void {
  if (sessionStorage.getItem("bug942.armed") !== "1") return;
  const frame = () => {
    if (sessionStorage.getItem("bug942.endedAt")) return;
    if (location.pathname === "/clients/denied" && document.querySelector("h1") && !document.querySelector("form.msg-composer")) {
      sessionStorage.setItem("bug942.endedAt", String(Date.now()));
      return;
    }
    if (sessionStorage.getItem("bug942.clickAt") && document.querySelector("form.msg-composer textarea")) {
      sessionStorage.setItem("bug942.composerAt", String(Date.now()));
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const CASES = [
  {
    name: "unread > 0 in the page's read",
    // The trainee's message is unread when the page reads it; the island marks it on the first visit,
    // and the coach stays until that is answered (a mark-read still out when the island unmounts is
    // not carried, and would be posted again on the return: a redundant request, not this bug).
    setup: async (page: Page) => {
      await traineeWrites(page, "unread when the page read it");
      const marked = page.waitForResponse((r) => new URL(r.url()).pathname === `${BFF}/read`);
      await openThread(page);
      expect((await marked).status(), "marked read on the visit").toBe(204);
    },
  },
  {
    name: "unread = 0 in the page's read",
    // Marked on a first load; the second document load's read has unread = 0.
    setup: async (page: Page) => {
      await traineeWrites(page, "already read");
      const marked = page.waitForResponse((r) => new URL(r.url()).pathname === `${BFF}/read`);
      await openThread(page);
      expect((await marked).status(), "marked read on the first load").toBe(204);
      await openThread(page);
    },
  },
] as const;

test.describe("BUG-942: a router-cached return to Messages after the link ended", () => {
  for (const c of CASES) {
    test(`${c.name}: the ended-link state within 1 s, no editable composer`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.addInitScript(watchForTheDenial);
      await signInThroughForm(page, { lang: "en" });
      // `next dev` compiles a route (and the page's client chunks) on its first request: not the 1 s
      // under test. So the denial page is loaded once as a document, and the thread GET route asked once.
      expect((await page.goto("/clients/denied"))?.status()).toBe(403);
      await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
      expect((await page.request.get(BFF, { maxRedirects: 0 })).status()).toBe(200);
      await c.setup(page);
      const prod = await isProductionBuild(page);

      await tabs(page).getByRole("link", { name: "Overview", exact: true }).click();
      // Long: `next dev` may compile the overview on this first visit.
      await expect(page).toHaveURL(new RegExp(`/clients/${LINA}$`), { timeout: 30_000 });
      await expect(page.locator("section.msg")).toHaveCount(0);

      // The link ends while the coach is on Overview. At the ROOT path (see client-tab-after-link-ended).
      await page.context().addCookies([{ name: "evoli_fixture_link", value: "ended", url: new URL("/", page.url()).href }]);
      const req = count(page);
      // Timed IN the page, every frame, from the click's own event to the first frame on the denial
      // page with no composer: Playwright's polling (100 / 250 / 500 / 1000 ms) is too coarse for 1 s.
      // In sessionStorage, because the denial is reached by a DOCUMENT load (the RSC answer for
      // /clients/denied is a 403, and the router turns a non-ok RSC answer into one).
      await page.evaluate(() => {
        sessionStorage.setItem("bug942.armed", "1");
        document.addEventListener("click", () => sessionStorage.setItem("bug942.clickAt", String(Date.now())), { capture: true, once: true });
      });
      await page.evaluate(watchForTheDenial);
      const clicked = Date.now();
      await tabs(page).getByRole("link", { name: "Messages", exact: true }).click();

      // Soft, so a red run still measures how long the stale thread stayed.
      await expect.soft(page, "on /clients/denied within 1 s of the click").toHaveURL(/\/clients\/denied$/, { timeout: 1_000 });
      await expect.soft(page.locator("form.msg-composer textarea"), "no composer within 1 s").toHaveCount(0, { timeout: 1 });
      await page.waitForURL("**/clients/denied", { timeout: 20_000 });
      const timing = await page.waitForFunction(() =>
        sessionStorage.getItem("bug942.endedAt") && sessionStorage.getItem("bug942.clickAt")
          ? {
              clickAt: Number(sessionStorage.getItem("bug942.clickAt")),
              endedAt: Number(sessionStorage.getItem("bug942.endedAt")),
              composerAt: sessionStorage.getItem("bug942.composerAt") === null ? undefined : Number(sessionStorage.getItem("bug942.composerAt")),
            }
          : null
      );
      const { clickAt, endedAt, composerAt } = (await timing.jsonValue()) as { clickAt: number; endedAt: number; composerAt?: number };
      const ms = Math.round(endedAt - clickAt);
      const composerMs = composerAt === undefined ? "never drawn" : `last drawn ${Math.round(composerAt - clickAt)} ms`;
      await expect(page.getByRole("heading", { level: 1 })).toHaveText([DENIED]);
      await expect(page.locator("form.msg-composer")).toHaveCount(0);
      const inFirst = (ts: number[]) => ts.filter((t) => t - clicked < 1_000).length;
      note(
        c.name,
        `${prod ? "prod" : "dev"}: /clients/denied, no composer, ${ms} ms after the click (composer ${composerMs}); thread GETs in the first 1 s: ${inFirst(req.gets)}, mark-read POSTs: ${inFirst(req.reads)}`
      );
      note(`${c.name} timeline`, req.timeline.map((e) => `${e.at - clicked} ms ${e.what}`).join("; "));
      expect(ms, "the ended-link state within 1 s").toBeLessThan(1_000);
    });
  }
});
