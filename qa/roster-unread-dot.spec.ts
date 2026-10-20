import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-095b AC-B4 — the roster's unread dot. Roster config (the populated scenario: the dot needs
 * rows). The fixture seeds Yusuf A. with one unread message from him (`seedMessageThreads`).
 *
 *   · the dot is drawn when `GET /coach-portal/messages/unread` reports count > 0 for the row,
 *     as decoration with words (« Unread messages », the row's first description);
 *   · it is read ONCE per roster load (the journal's `listMessageUnread`), with no interval;
 *   · reading the thread clears it on the next roster load;
 *   · a failed unread read costs the dots only: the roster renders.
 * The EV-342 perf-gate reading (one added read, same round trip) is `page-read-budget.spec.ts`.
 */

const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

type Entry = { op: string; arg: string | null; document: boolean };

async function journal(page: Page): Promise<Entry[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { api: Entry[] }).api;
}

const row = (page: Page, name: string) => page.locator("a.roster-row").filter({ has: page.getByText(name, { exact: true }) });

async function openRoster(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
  await expect(page.locator("a.roster-row").first()).toBeVisible();
}

test.describe("AC-B4 the roster's unread dot", () => {
  test.use({ locale: "en-US" });

  test("drawn on the row with unread messages only, with words; read once per load, never again while idle", async ({ page }) => {
    test.setTimeout(90_000);
    await signInThroughForm(page);
    const before = (await journal(page)).length;
    await openRoster(page);
    const yusuf = row(page, "Yusuf A.");
    await expect(yusuf).toHaveAttribute("data-unread", "");
    await expect(yusuf.locator("[data-roster-unread]")).toHaveCount(1);
    await expect(yusuf).toHaveAccessibleDescription(/^Unread messages /);
    await expect(page.locator("a.roster-row[data-unread]"), "only Yusuf's row").toHaveCount(1);
    await expect(row(page, "Lina M.").locator("[data-roster-unread]")).toHaveCount(0);

    const loaded = (await journal(page)).slice(before).filter((e) => e.op === "listMessageUnread");
    expect(loaded.length, "one unread read for one roster load").toBe(1);
    await page.waitForTimeout(20_000);
    const idle = (await journal(page)).slice(before).filter((e) => e.op === "listMessageUnread");
    expect(idle.length, "no interval: still one after 20 s idle").toBe(1);
  });

  test("reading the thread clears the dot on the next roster load", async ({ page }) => {
    await signInThroughForm(page);
    await openRoster(page);
    await expect(row(page, "Yusuf A.")).toHaveAttribute("data-unread", "");
    await page.goto(`/clients/${YUSUF}/messages`);
    await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
    await expect(page.locator('li[data-author="TRAINEE"]')).toHaveCount(1);
    await expect
      .poll(async () => ((await (await page.request.get(`/api/fixture/messages?clientId=${YUSUF}`)).json()) as { coachReadSeq: number }).coachReadSeq)
      .toBe(2);
    await openRoster(page);
    await expect(page.locator("a.roster-row[data-unread]")).toHaveCount(0);
  });

  test("a new message from a client draws the dot on the next roster load", async ({ page }) => {
    await signInThroughForm(page);
    const res = await page.request.post("/api/fixture/messages", { data: { clientId: LINA, body: "Quick question" } });
    expect(res.status()).toBe(200);
    await openRoster(page);
    await expect(row(page, "Lina M.")).toHaveAttribute("data-unread", "");
    await expect(page.locator("a.roster-row[data-unread]")).toHaveCount(2);
  });

  test("the unread read fails: the roster renders, with no dot", async ({ page }) => {
    await signInThroughForm(page);
    await page.context().addCookies([{ name: "evoli_fixture_messages_unread", value: "fail", url: new URL("/", page.url()).href }]);
    await openRoster(page);
    await expect(page.locator("a.roster-row")).not.toHaveCount(0);
    await expect(page.locator("a.roster-row[data-unread]")).toHaveCount(0);
  });
});

test.describe("AC-B4 / AC-B6 the dot's words in French", () => {
  test.use({ locale: "fr-FR" });

  test("« Messages non lus » is the row's first description", async ({ page }) => {
    await signInThroughForm(page, { lang: "fr" });
    await openRoster(page);
    await expect(row(page, "Yusuf A.")).toHaveAccessibleDescription(/^Messages non lus /);
  });
});
