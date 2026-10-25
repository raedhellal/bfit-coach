import { expect, type Locator, type Page, type Request } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { isProductionBuild } from "./production-build";

/**
 * BUG-938 — after a client-side navigation away from a client's « Messages » tab and back, the
 * thread shows at once every message it held when the coach left (sent or polled), never an
 * older list. Fixture mode; runs in the default (dev) suite AND in `playwright.start.config.ts`
 * (a production build), where the router cache behaves as shipped.
 *
 * The cause, witnessed by `RSC requests on return` below: within `staleTimes.dynamic` (30 s,
 * ADR-0033 D33.0) the return is served from the client router cache with NO page render, so the
 * remounted `MessageThread` was seeded from the payload of the FIRST visit — the list before the
 * send — and stayed that way until its first poll, 15 s after the mount.
 *
 * Requests are counted: the fix costs no request (no read on mount, no `router.refresh()`), and
 * the poll keeps AC-B3's cadence across the return: every 5 s until 60 s after the coach's send
 * (the island keeps the send's time too), none in the first second, never faster than 5 s.
 *
 * The client's half (writing from the phone) is `POST /api/fixture/messages`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const THREAD = `/clients/${LINA}/messages`;
const BFF = `/api/bff/clients/${LINA}/messages`;

test.use({ locale: "en-US", timezoneId: "Europe/Paris" });

async function traineeWrites(page: Page, body: string): Promise<number> {
  const res = await page.request.post("/api/fixture/messages", { data: { clientId: LINA, body }, maxRedirects: 0 });
  expect(res.status(), "the client's message").toBe(200);
  return ((await res.json()) as { seq: number }).seq;
}

/** A measured value, in the report (`--reporter=json`): the request counts and timings. */
function note(type: string, description: string): void {
  test.info().annotations.push({ type: `BUG-938 ${type}`, description });
}

function rows(page: Page): Locator {
  return page.locator("li.msg-item");
}

/** The page's own requests: thread GETs (polls), mark-read POSTs and RSC renders of the messages page. */
function recordRequests(page: Page): { polls: number[]; reads: number[]; rsc: number[] } {
  const polls: number[] = [];
  const reads: number[] = [];
  const rsc: number[] = [];
  page.on("request", (r: Request) => {
    const url = new URL(r.url());
    if (r.method() === "GET" && url.pathname === BFF) polls.push(Date.now());
    if (r.method() === "POST" && url.pathname === `${BFF}/read`) reads.push(Date.now());
    if (url.pathname === THREAD && r.headers()["rsc"] === "1") rsc.push(Date.now());
  });
  return { polls, reads, rsc };
}

function tabs(page: Page): Locator {
  return page.getByRole("main").getByRole("navigation", { name: "Trainee sections", exact: true });
}

async function openThread(page: Page, expected: number): Promise<void> {
  await page.goto(THREAD);
  await expect(page.locator("[data-nav-progress-ready]"), "the page hydrated").toHaveCount(1);
  await expect(rows(page)).toHaveCount(expected);
}

async function toOverview(page: Page): Promise<void> {
  await tabs(page).getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${LINA}$`));
  await expect(page.locator("section.msg")).toHaveCount(0);
}

/**
 * Back to Messages through the tab strip, once the URL is the thread's. Returns the instant just
 * before the click: the page's RSC request, when there is one, leaves before the URL changes.
 */
async function backToMessages(page: Page): Promise<number> {
  const clicked = Date.now();
  await tabs(page).getByRole("link", { name: "Messages", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${LINA}/messages$`));
  return clicked;
}

async function seqs(page: Page): Promise<number[]> {
  return rows(page).evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-message-seq"))));
}

test.describe("BUG-938: Messages after navigating away and back", () => {
  test("the coach's just-sent message is there within 1 s of returning, with no extra request", async ({ page }) => {
    test.setTimeout(150_000);
    await signInThroughForm(page, { lang: "en" });
    await traineeWrites(page, "seed one");
    await openThread(page, 1);
    const prod = await isProductionBuild(page);
    const req = recordRequests(page);

    await page.locator("form.msg-composer textarea").fill("coach sent now");
    await page.locator("form.msg-composer button").last().click();
    await expect(rows(page)).toHaveCount(2);
    await expect(page.locator("form.msg-composer textarea")).toHaveValue("");
    const sentAt = Date.now();
    await toOverview(page);
    const pollsBefore = req.polls.length;

    const back = await backToMessages(page);
    // Soft, so a red run still measures the requests below (the before/after counts).
    await expect.soft(rows(page), "2 rows within 1 s of the Messages URL").toHaveCount(2, { timeout: 1_000 });
    expect.soft(await seqs(page), "each message once, in order").toEqual([1, 2]);
    note("sent", `${prod ? "prod" : "dev"}: ${await rows(page).count()} rows ${Date.now() - back} ms after the click; RSC requests on return: ${req.rsc.filter((t) => t >= back).length}`);

    // No request storm: nothing on the return itself, and the poll keeps AC-B3's cadence.
    await page.waitForTimeout(1_000);
    expect(req.polls.length - pollsBefore, "thread GETs in the 1 s after returning").toBe(0);
    // The client's message was marked read on the first visit: the return does not mark it again.
    note("mark-read", `${prod ? "prod" : "dev"}: POST /read on return: ${req.reads.filter((t) => t >= back).length}`);
    expect.soft(req.reads.filter((t) => t >= back).length, "mark-read POSTs on return").toBe(0);
    // AC-B3: the return is inside the 60 s after the send, so 5 s from the remount, then every 5 s
    // until 60 s after the send, then 15 s again. Watched until 85 s after the send.
    await page.waitForTimeout(Math.max(0, sentAt + 85_000 - Date.now()));
    const after = req.polls.filter((t) => t >= back);
    note(
      "cadence",
      `${prod ? "prod" : "dev"}: thread GETs after returning (ms from the return click; the send was ${back - sentAt} ms before it): ${after.map((t) => t - back).join(", ")}`
    );
    expect(after.length, "a poll after returning").toBeGreaterThanOrEqual(1);
    expect(after[0] - back, "the first poll ~5 s after returning (not at once, not 15 s)").toBeGreaterThanOrEqual(4_500);
    expect(after[0] - back, "the first poll ~5 s after returning (not at once, not 15 s)").toBeLessThan(7_000);
    const gaps = after.slice(1).map((t, i) => ({ at: after[i], gap: t - after[i] }));
    for (const { gap } of gaps) expect(gap, "never faster than 5 s").toBeGreaterThanOrEqual(4_500);
    // Inside the window every gap is ~5 s; a poll started after it is 15 s from the one before.
    for (const { at, gap } of gaps) {
      if (at < sentAt + 59_000) expect(gap, "5 s while inside the 60 s after the send").toBeLessThan(6_500);
      if (at >= sentAt + 61_000) expect(gap, "15 s again after the window").toBeGreaterThanOrEqual(14_000);
    }
    const fast = after.filter((t) => t < sentAt + 58_000).length;
    const expected = Math.floor((sentAt + 58_000 - back) / 5_000);
    expect(fast, `GETs from the return to 58 s after the send (~${expected})`).toBeGreaterThanOrEqual(expected - 2);
    expect(fast, `GETs from the return to 58 s after the send (~${expected})`).toBeLessThanOrEqual(expected + 1);
    expect(after.filter((t) => t >= sentAt + 66_000).length, "GETs from 66 s to 85 s after the send").toBeLessThanOrEqual(2);
    expect(await seqs(page), "each message once after the polls").toEqual([1, 2]);
  });

  test("a message the poll had already fetched is there within 1 s of returning", async ({ page }) => {
    test.setTimeout(90_000);
    await signInThroughForm(page, { lang: "en" });
    await traineeWrites(page, "seed one");
    await openThread(page, 1);
    const req = recordRequests(page);

    await traineeWrites(page, "polled while on Messages");
    // The idle poll (15 s) fetches it.
    await expect(rows(page)).toHaveCount(2, { timeout: 20_000 });
    expect(req.polls.length, "it came by the poll").toBeGreaterThanOrEqual(1);
    await toOverview(page);

    const back = await backToMessages(page);
    await expect(rows(page), "2 rows within 1 s of the Messages URL").toHaveCount(2, { timeout: 1_000 });
    expect(await seqs(page)).toEqual([1, 2]);
    await expect(rows(page).last()).toContainText("polled while on Messages");
    note("polled", `2 rows ${Date.now() - back} ms after the click`);
  });

  test("a message written while the coach is on Overview shows within one poll, and nothing held is lost", async ({ page }) => {
    test.setTimeout(90_000);
    await signInThroughForm(page, { lang: "en" });
    await traineeWrites(page, "seed one");
    await openThread(page, 1);
    await page.locator("form.msg-composer textarea").fill("coach sent now");
    await page.locator("form.msg-composer button").last().click();
    await expect(rows(page)).toHaveCount(2);
    await toOverview(page);
    await traineeWrites(page, "written while on Overview");

    const back = await backToMessages(page);
    // What the coach left is there at once; the unseen one comes with the first poll (15 s).
    await expect(rows(page), "the 2 held rows within 1 s").toHaveCount(2, { timeout: 1_000 });
    await expect(rows(page)).toHaveCount(3, { timeout: 17_000 });
    expect(Date.now() - back, "within one 15 s poll").toBeLessThan(17_000);
    expect(await seqs(page)).toEqual([1, 2, 3]);
  });

  test("returning after the router cache expired (a fresh page render) shows the thread once, with what arrived", async ({ page }) => {
    test.setTimeout(90_000);
    await signInThroughForm(page, { lang: "en" });
    await traineeWrites(page, "seed one");
    await openThread(page, 1);
    const req = recordRequests(page);
    await page.locator("form.msg-composer textarea").fill("coach sent now");
    await page.locator("form.msg-composer button").last().click();
    await expect(rows(page)).toHaveCount(2);
    await toOverview(page);
    await traineeWrites(page, "written while away");
    // Past `staleTimes.dynamic` (30 s): the return asks the server for the page.
    await page.waitForTimeout(32_000);

    const back = await backToMessages(page);
    if (await isProductionBuild(page)) {
      // `next start`: an expired entry is a full navigation fetch, so the page's own read is fresh.
      await expect(rows(page), "the server's fresh read, at once").toHaveCount(3, { timeout: 5_000 });
      expect(req.rsc.filter((t) => t >= back).length, "the return rendered the page on the server").toBeGreaterThanOrEqual(1);
    } else {
      // `next dev` makes every navigation an AUTO prefetch (prefetch-cache-utils.js), whose partial
      // answer re-uses the router's OLD node for the page, whatever its age: the island's held list
      // is what keeps the return from going back in time; the unseen message comes by the poll.
      await expect(rows(page), "the 2 held rows within 1 s").toHaveCount(2, { timeout: 1_000 });
      await expect(rows(page)).toHaveCount(3, { timeout: 17_000 });
    }
    expect(await seqs(page), "each message once").toEqual([1, 2, 3]);
  });
});
