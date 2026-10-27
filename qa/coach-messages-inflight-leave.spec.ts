import { expect, type Page, type Request, type Route } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { isProductionBuild } from "./production-build";

/**
 * BUG-943 — a send or a mark-read still out when the coach leaves « Messages » is not lost by the
 * leave. The island keeps its thread when it unmounts (BUG-938, `src/lib/heldThreads.ts`), and a
 * result that resolves AFTER that is now written into what it kept, or handed to the island that
 * is mounted again by then:
 *
 *   · a send that resolves while the coach is away is in the list in the remount's FIRST frame,
 *     with AC-B3's 5 s period running from it (on `dc5a160` it came only with BUG-942's return
 *     read, a round trip later, and the next poll was 15 s away; on `e70f795` not for 15 s);
 *   · a send still out when the coach is back shows as sending, with its text (so it cannot be
 *     typed and sent a second time), and its row is there within 1 s of its answer;
 *   · a send that failed while the coach was away shows as failed, with its text and « Retry »,
 *     and the retry keeps its `clientMessageId` (AC-B7: a replay, never a second message);
 *   · a mark-read out when the coach left is not posted again on the return, whether it resolved
 *     while away or after the return (one POST /read in all).
 *
 * The request is held in the BROWSER (`page.route`), before it reaches the server, so a held send
 * is not in the thread the return read gets: the late answer is the only way the row can arrive
 * before the next poll. Frames are recorded in the page (like `coach-messages-navback.spec.ts`'s
 * `watchRows`), because the return read lands faster than Playwright polls.
 *
 * Fixture mode; runs in the default (dev) suite AND in `playwright.start.config.ts` (production).
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const THREAD = `/clients/${LINA}/messages`;
const BFF = `/api/bff/clients/${LINA}/messages`;
const READ = `${BFF}/read`;

test.use({ locale: "en-US", timezoneId: "Europe/Paris" });

function note(type: string, description: string): void {
  test.info().annotations.push({ type: `BUG-943 ${type}`, description });
}

async function traineeWrites(page: Page, body: string): Promise<void> {
  const res = await page.request.post("/api/fixture/messages", { data: { clientId: LINA, body }, maxRedirects: 0 });
  expect(res.status(), "the client's message").toBe(200);
}

/** Every thread GET, send POST (with its body) and mark-read POST the page makes. */
function recordRequests(page: Page) {
  const gets: number[] = [];
  const sends: Array<{ at: number; clientMessageId: string; body: string }> = [];
  const reads: number[] = [];
  page.on("request", (r: Request) => {
    const url = new URL(r.url());
    if (r.method() === "GET" && url.pathname === BFF) gets.push(Date.now());
    if (r.method() === "POST" && url.pathname === BFF) sends.push({ at: Date.now(), ...(r.postDataJSON() as { clientMessageId: string; body: string }) });
    if (r.method() === "POST" && url.pathname === READ) reads.push(Date.now());
  });
  return { gets, sends, reads };
}

/**
 * Holds the FIRST POST to `path` in the browser until `release` (then it goes to the server, or is
 * answered with `fail`); every later one goes through at once. `answered` resolves when the page
 * has the held request's answer.
 */
async function holdFirstPost(page: Page, path: string) {
  let release!: (how?: { status: number; body: string }) => void;
  const go = new Promise<{ status: number; body: string } | undefined>((r) => (release = r));
  let seen!: () => void;
  const held = new Promise<void>((r) => (seen = r));
  let first = true;
  await page.route(`**${path}`, async (route: Route) => {
    if (route.request().method() !== "POST" || !first) return route.fallback();
    first = false;
    seen();
    const how = await go;
    if (how) await route.fulfill({ status: how.status, contentType: "application/json", body: how.body });
    else await route.fallback();
  });
  const answered = held.then(() =>
    page.waitForResponse((res) => res.request().method() === "POST" && new URL(res.url()).pathname === path, { timeout: 30_000 })
  );
  return {
    /** The held request has left the page. */
    held,
    release: (how?: { status: number; body: string }) => release(how),
    /** The page has the answer (its continuation runs right after). */
    answered: async () => {
      await answered;
      // The fetch continuation (`res.json()`, then the island's code) runs after the response event.
      await page.waitForTimeout(500);
    },
  };
}

function tabs(page: Page) {
  return page.getByRole("main").getByRole("navigation", { name: "Trainee sections", exact: true });
}

const composer = (page: Page) => page.locator("form.msg-composer textarea");
const rows = (page: Page) => page.locator("li.msg-item");

async function openThread(page: Page): Promise<void> {
  await page.goto(THREAD);
  await expect(page.locator("[data-nav-progress-ready]"), "the page hydrated").toHaveCount(1);
  await expect(page.locator("section.msg")).toHaveAttribute("data-messages-state", "ready");
}

async function toOverview(page: Page): Promise<void> {
  await tabs(page).getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${LINA}$`));
  await expect(page.locator("section.msg")).toHaveCount(0);
}

async function backToMessages(page: Page): Promise<number> {
  const clicked = Date.now();
  await tabs(page).getByRole("link", { name: "Messages", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${LINA}/messages$`));
  return clicked;
}

interface Frame {
  at: number;
  seqs: number[];
  bodies: string[];
  draft: string;
  state: string;
}

/** Every frame of the thread from now on (a client transition: the window stays), recorded in the page. */
async function watchFrames(page: Page): Promise<() => Promise<Frame[]>> {
  await page.evaluate(() => {
    const frames: Frame[] = [];
    (window as unknown as { __bug943: Frame[] }).__bug943 = frames;
    const frame = () => {
      if (document.querySelector("section.msg")) {
        const items = Array.from(document.querySelectorAll("li.msg-item"));
        frames.push({
          at: Date.now(),
          seqs: items.map((e) => Number(e.getAttribute("data-message-seq"))),
          bodies: items.map((e) => e.querySelector(".msg-body")?.textContent ?? ""),
          draft: (document.querySelector("form.msg-composer textarea") as HTMLTextAreaElement | null)?.value ?? "",
          state: document.querySelector("form.msg-composer")?.getAttribute("data-composer-state") ?? "",
        });
      }
      if (frames.length < 3_000) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  return () => page.evaluate(() => (window as unknown as { __bug943: Frame[] }).__bug943);
}

async function send(page: Page, text: string): Promise<void> {
  await composer(page).fill(text);
  await page.locator("form.msg-composer button").last().click();
  await expect(page.locator("form.msg-composer"), "the send is out").toHaveAttribute("data-composer-state", "sending");
}

test.describe("BUG-943: a send or a mark-read in flight when the coach leaves Messages", () => {
  test("a send that resolves while the coach is away is in the remount's first frame, with the 5 s period after it", async ({ page }) => {
    test.setTimeout(90_000);
    await signInThroughForm(page, { lang: "en" });
    await openThread(page);
    const prod = await isProductionBuild(page);
    const req = recordRequests(page);
    const hold = await holdFirstPost(page, BFF);

    await send(page, "sent while leaving");
    await hold.held;
    await toOverview(page);
    hold.release();
    await hold.answered();

    const frames = await watchFrames(page);
    const back = await backToMessages(page);
    // The Closes line: the message within 1 s of the return.
    await expect(rows(page), "the coach's message within 1 s of the return").toHaveCount(1, { timeout: 1_000 });
    const seen = await frames();
    note("first-frame", `${prod ? "prod" : "dev"}: remount's first frame ${JSON.stringify(seen[0])}; row at +${(seen.find((f) => f.seqs.length > 0)?.at ?? NaN) - back} ms`);
    expect(seen.length, "frames of the remounted thread were recorded").toBeGreaterThan(0);
    // At once: from what the island kept, not a round trip later by the return read.
    // Soft, so a red run still measures the cadence below.
    expect.soft(seen[0].bodies, "the late send's row in the remount's first frame").toEqual(["sent while leaving"]);
    expect.soft(seen[0].draft, "the composer is empty: the send was answered").toBe("");
    for (const f of seen) expect.soft(f.bodies, "never fewer, never twice").toEqual(["sent while leaving"]);

    await page.waitForTimeout(1_000);
    const after = () => req.gets.filter((t) => t >= back);
    expect(after().length, "thread GETs in the 1 s after the return: the return read (BUG-942)").toBe(1);
    // AC-B3: the late send's time is kept, so the next poll is 5 s after the return read, not 15 s.
    await page.waitForTimeout(7_000);
    note("cadence", `${prod ? "prod" : "dev"}: thread GETs after the return (ms): ${after().map((t) => t - back).join(", ")}`);
    expect(after().length, "the return read and the 5 s poll").toBeGreaterThanOrEqual(2);
    expect(after()[1] - after()[0], "the next poll ~5 s after the return read").toBeGreaterThanOrEqual(4_500);
    expect(after()[1] - after()[0], "the next poll ~5 s after the return read").toBeLessThan(7_000);
    expect(req.sends, "one send POST: no second message").toHaveLength(1);
    expect(await rows(page).locator(".msg-body").allTextContents(), "each message once").toEqual(["sent while leaving"]);
  });

  test("a send still out on the return shows as sending with its text, and its row is there within 1 s of the answer", async ({ page }) => {
    test.setTimeout(90_000);
    await signInThroughForm(page, { lang: "en" });
    await openThread(page);
    const prod = await isProductionBuild(page);
    const req = recordRequests(page);
    const hold = await holdFirstPost(page, BFF);

    await send(page, "answered after the return");
    await hold.held;
    await toOverview(page);
    const frames = await watchFrames(page);
    const back = await backToMessages(page);
    await page.waitForTimeout(1_500);
    expect(req.gets.filter((t) => t >= back).length, "the return read (BUG-942)").toBe(1);
    // AC-B7: the text is still the send's, and not a new send (the composer is read-only while out).
    // Soft, so a red run still measures the late answer below.
    await expect.soft(page.locator("form.msg-composer"), "the send is still out").toHaveAttribute("data-composer-state", "sending");
    await expect.soft(composer(page)).toHaveValue("answered after the return");
    await expect(rows(page), "not sent yet").toHaveCount(0);

    const released = Date.now();
    hold.release();
    await expect(rows(page).locator(".msg-body"), "the row within 1 s of the answer").toHaveText(["answered after the return"], { timeout: 1_000 });
    await expect(composer(page), "the composer clears on the 2xx").toHaveValue("");
    await expect(page.locator("form.msg-composer")).toHaveAttribute("data-composer-state", "idle");
    const seen = await frames();
    const firstRow = seen.find((f) => f.seqs.length > 0);
    note("late-answer", `${prod ? "prod" : "dev"}: row at +${(firstRow?.at ?? NaN) - released} ms after the release`);
    for (const f of seen) expect([[], ["answered after the return"]], "never twice").toContainEqual(f.bodies);

    // AC-B3: the 5 s period runs from the late answer.
    await page.waitForTimeout(Math.max(0, released + 7_500 - Date.now()));
    const sinceRelease = req.gets.filter((t) => t >= released).map((t) => t - released);
    note("cadence", `${prod ? "prod" : "dev"}: thread GETs after the release (ms): ${sinceRelease.join(", ")}`);
    expect(sinceRelease.length, "a poll ~5 s after the late answer").toBeGreaterThanOrEqual(1);
    expect(sinceRelease[0], "a poll ~5 s after the late answer").toBeGreaterThanOrEqual(4_500);
    expect(sinceRelease[0], "a poll ~5 s after the late answer").toBeLessThan(7_000);
    expect(req.sends, "one send POST").toHaveLength(1);
    expect(await rows(page).locator(".msg-body").allTextContents(), "each message once").toEqual(["answered after the return"]);
  });

  test("a send that failed while the coach was away shows as failed, and the retry keeps its clientMessageId", async ({ page }) => {
    test.setTimeout(60_000);
    await signInThroughForm(page, { lang: "en" });
    await openThread(page);
    const req = recordRequests(page);
    const hold = await holdFirstPost(page, BFF);

    await send(page, "failed while away");
    await hold.held;
    await toOverview(page);
    hold.release({ status: 502, body: JSON.stringify({ code: "UPSTREAM" }) });
    await hold.answered();

    await backToMessages(page);
    await expect(page.locator('[data-messages-failure="sendFailed"]'), "the failure, as on the page").toHaveCount(1, { timeout: 1_000 });
    await expect(composer(page), "the text stays").toHaveValue("failed while away");
    await expect(page.locator("form.msg-composer button").last()).toHaveText("Retry");
    await expect(rows(page)).toHaveCount(0);

    await page.locator("form.msg-composer button").last().click();
    await expect(rows(page).locator(".msg-body")).toHaveText(["failed while away"]);
    await expect(composer(page)).toHaveValue("");
    expect(req.sends.map((s) => s.body)).toEqual(["failed while away", "failed while away"]);
    expect(req.sends[1].clientMessageId, "AC-B7: the retry is the same message").toBe(req.sends[0].clientMessageId);
  });

  test("a mark-read that resolves while the coach is away is not posted again on the return", async ({ page }) => {
    test.setTimeout(60_000);
    await signInThroughForm(page, { lang: "en" });
    await traineeWrites(page, "unread one");
    const req = recordRequests(page);
    const hold = await holdFirstPost(page, READ);
    await openThread(page);
    await expect(rows(page)).toHaveCount(1);
    await hold.held;
    await toOverview(page);
    hold.release();
    await hold.answered();

    const back = await backToMessages(page);
    await expect(rows(page)).toHaveCount(1);
    await page.waitForTimeout(2_000);
    note("mark-read", `away: POST /read ${req.reads.length} in all, ${req.reads.filter((t) => t >= back).length} after the return; thread GETs after the return ${req.gets.filter((t) => t >= back).length}`);
    expect(req.reads.filter((t) => t >= back), "no mark-read on the return").toHaveLength(0);
    expect(req.reads, "one mark-read in all").toHaveLength(1);
  });

  test("a mark-read still out on the return is not posted again, before or after it resolves", async ({ page }) => {
    test.setTimeout(60_000);
    await signInThroughForm(page, { lang: "en" });
    await traineeWrites(page, "unread one");
    const req = recordRequests(page);
    const hold = await holdFirstPost(page, READ);
    await openThread(page);
    await expect(rows(page)).toHaveCount(1);
    await hold.held;
    await toOverview(page);

    const back = await backToMessages(page);
    await expect(rows(page)).toHaveCount(1);
    // The return read (BUG-942) sees `unread > 0`: the held mark-read has not reached the server.
    await page.waitForTimeout(1_500);
    expect(req.gets.filter((t) => t >= back).length, "the return read").toBe(1);
    expect(req.reads.filter((t) => t >= back), "no second mark-read while the first is out").toHaveLength(0);
    hold.release();
    await hold.answered();
    await page.waitForTimeout(1_500);
    note("mark-read", `back before the answer: POST /read ${req.reads.length} in all`);
    expect(req.reads, "one mark-read in all").toHaveLength(1);
  });

  test("an inherited mark-read that never answers does not stop marking: the poll after the return read marks", async ({ page }) => {
    test.setTimeout(90_000);
    await signInThroughForm(page, { lang: "en" });
    await traineeWrites(page, "unread one");
    const req = recordRequests(page);
    const hold = await holdFirstPost(page, READ);
    await openThread(page);
    await expect(rows(page)).toHaveCount(1);
    await hold.held;
    await toOverview(page);

    const back = await backToMessages(page);
    await page.waitForTimeout(1_500);
    const gets = () => req.gets.filter((t) => t >= back);
    expect(gets().length, "the return read").toBe(1);
    expect(req.reads.filter((t) => t >= back), "none while the return read lets the inherited one go").toHaveLength(0);
    // The held mark-read never answers. The next poll (15 s idle) still sees unread > 0, and marks.
    await expect.poll(() => req.reads.filter((t) => t >= back).length, { timeout: 20_000, message: "the poll after the return read marks" }).toBe(1);
    const markedAt = req.reads.filter((t) => t >= back)[0];
    note("hung-mark-read", `POST /read ${markedAt - gets()[0]} ms after the return read; thread GETs after the return (ms): ${gets().map((t) => t - back).join(", ")}`);
    expect(gets().length, "it came with the poll after the return read").toBeGreaterThanOrEqual(2);
    expect(markedAt - gets()[1], "posted from that poll's read").toBeGreaterThanOrEqual(0);
    hold.release({ status: 504, body: JSON.stringify({ code: "UPSTREAM" }) });
  });
});

/**
 * BUG-1009 — the witness for BUG-943's two late-denial refreshes in `MessageThread.tsx`
 * (`markRead`'s `settle` and `sendSettledLate`, each `if (!slot.endedLate()) router.refresh()`).
 *
 * A send or a mark-read held when the coach leaves « Messages » for the same client's Overview, the
 * link ended meanwhile (`evoli_fixture_link=ended`), then answered 403 after the island unmounted:
 * no island is mounted for the thread, so the late answer's own refresh is the only thing that takes
 * the Overview tab to `/clients/denied` (BUG-1007 ruled both calls legitimate). Without it the tab
 * stays up on an ended link with no RSC request at all, which the census count alone cannot tell
 * from a change that removes both calls and pins the count at 15.
 *
 * Each case asserts the page reaches `/clients/denied` and that exactly ONE refresh is made after the
 * late 403 (one non-prefetch RSC request for the Overview's own path), never a second. Case A guards
 * `sendSettledLate`, case B `markRead`'s `settle`; each is red with its call removed.
 *
 * The sequence is the same on both servers (staff recorded every request on each):
 *   1. the refresh, `/clients/<id>?_rsc` with no `Next-Url`, answered 200 with the layout's redirect
 *      in its payload;
 *   2. the router following that redirect, `/clients/denied?_rsc`, answered 403;
 *   3. an MPA document load of `/clients/denied` (also 403): a 403 is `!res.ok`, so the router falls
 *      back to `doMpaNavigation` (next 14.2.35 `router-reducer/fetch-server-response.js:91-96`).
 * The one difference is request 2's headers. Under `next dev` a missing prefetch entry is created as
 * `PrefetchKind.AUTO` (`prefetch-cache-utils.js:98-99`), and an AUTO fetch carries
 * `Next-Router-Prefetch: 1` (`fetch-server-response.js:43-44`), so dev marks that navigation as a
 * prefetch; a production build does not. Every RSC request is therefore asserted exactly on both
 * servers (the refresh, then `/clients/denied` once), and so is which of them carry the header.
 */
const DENIED = { status: 403, body: JSON.stringify({ code: "COACH_ACCESS_DENIED" }) };

/**
 * Every RSC request (`RSC: 1`) from now on, by path. `prefetch` is "carries `Next-Router-Prefetch`";
 * "non-prefetch" below means without it. Under `next dev` that header is also on real navigations
 * (an AUTO entry, see above), so a non-prefetch filter alone drops them there.
 */
function recordRsc(page: Page) {
  const log: Array<{ at: number; path: string; prefetch: boolean }> = [];
  page.on("request", (r: Request) => {
    const h = r.headers();
    if (h["rsc"] === "1") log.push({ at: Date.now(), path: new URL(r.url()).pathname, prefetch: !!h["next-router-prefetch"] });
  });
  return log;
}

async function endLink(page: Page): Promise<void> {
  await page.context().addCookies([{ name: "evoli_fixture_link", value: "ended", url: new URL("/", page.url()).href }]);
}

/** Ends the link, answers the held POST 403, and checks where the Overview tab goes. */
async function lateDenial(page: Page, hold: Awaited<ReturnType<typeof holdFirstPost>>, label: string): Promise<void> {
  const prod = await isProductionBuild(page);
  await endLink(page);
  const rsc = recordRsc(page);
  const released = Date.now();
  hold.release(DENIED);
  await hold.answered();
  // Soft, so a red run still reports the RSC count below.
  await expect.soft(page, "the late 403's refresh takes the tab to the denial page").toHaveURL(/\/clients\/denied$/);
  // A quiet window, so a second refresh after the first would be counted.
  await page.waitForTimeout(2_000);
  const after = rsc.filter((e) => e.at >= released);
  test.info().annotations.push({
    type: `BUG-1009 ${label}`,
    description: `${prod ? "prod" : "dev"}: final ${new URL(page.url()).pathname}; RSC after the late 403: [${after.map((e) => `+${e.at - released} ms ${e.path}${e.prefetch ? " (Next-Router-Prefetch)" : ""}`).join(", ")}]`,
  });
  const refresh = `/clients/${LINA}`;
  expect(after.filter((e) => e.path === refresh && !e.prefetch), "exactly one refresh of the Overview after the late 403").toHaveLength(1);
  expect(after.map((e) => e.path), "the refresh, then the redirect followed to the denial page once, and no other RSC request").toEqual([refresh, "/clients/denied"]);
  // Only dev marks the followed redirect as an AUTO prefetch; the refresh never carries the header.
  expect(after.map((e) => e.prefetch), prod ? "no RSC request carries Next-Router-Prefetch" : "only the followed redirect carries Next-Router-Prefetch (dev's AUTO entry)").toEqual([false, !prod]);
}

test.describe("BUG-1009: a send or a mark-read answered 403 after the coach moved to the same client's Overview", () => {
  test("A: a late send 403 takes the Overview to /clients/denied, with one refresh (sendSettledLate)", async ({ page }) => {
    await signInThroughForm(page, { lang: "en" });
    const hold = await holdFirstPost(page, BFF);
    await openThread(page);
    await send(page, "late one");
    await hold.held;
    await toOverview(page);
    await lateDenial(page, hold, "A late send");
  });

  test("B: a late mark-read 403 takes the Overview to /clients/denied, with one refresh (markRead's settle)", async ({ page }) => {
    await signInThroughForm(page, { lang: "en" });
    await traineeWrites(page, "unread one");
    const hold = await holdFirstPost(page, READ);
    await openThread(page);
    await expect(rows(page)).toHaveCount(1);
    await hold.held;
    await toOverview(page);
    await lateDenial(page, hold, "B late mark-read");
  });
});
