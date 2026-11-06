import { createRequire } from "node:module";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { signInThroughForm } from "./sign-in";
import {
  apiInbox,
  apiMarkRead,
  apiUnread,
  clientCompletes,
  clientWrites,
  freshCoach,
  insertRedFlagItem,
  linkClient,
  PASSWORD,
  recordCountReads,
  revoke,
  setHidden,
  type Account,
  type ApiItem,
} from "./notifications-live";

/**
 * EV-455f — the coach portal's bell and inbox, AC-1 to AC-10, against a REAL b-fit-api
 * (`playwright.live.config.ts`), in English and in French. AC-11 is the gates (lint, tsc, the
 * existing suites). The rig, and the two SQL steps it takes and why, are `qa/notifications-live.ts`.
 *
 *   EV455F_PSQL='psql postgresql://bfit:bfit@127.0.0.1:5433/bfit' \
 *   COACH_LIVE_API_ORIGIN=http://localhost:8080 \
 *     npx playwright test --config playwright.live.config.ts qa/notifications.live.spec.ts --project=chromium
 *
 * Every test makes its OWN coach (an empty inbox) and its own clients, so each count is exact
 * and the file re-runs on the same database. Expected sentences are LITERALS, never read from
 * `src/lib/copy.ts`. AC-8 (the poll) is language-free and runs once, in English: it holds the
 * tab hidden for the story's 3 minutes, then times two 60 s periods.
 */

const T = {
  en: {
    locale: "en-US",
    bell: (n: number) => `Notifications, ${n} unread`,
    title: "Notifications",
    empty: "No notifications yet.",
    loadError: "Couldn't load notifications.",
    retry: "Try again",
    markAll: "Mark all as read",
    allRead: "All your notifications are marked as read.",
    unread: "unread",
    more: "Load more",
    denied: "This trainee is not on your roster. They may have revoked access.",
    item: {
      CLIENT_MESSAGE: (c: string) => `New message from ${c}`,
      CLIENT_JOINED: (c: string) => `${c} accepted your invitation`,
      CLIENT_SESSION_COMPLETED: (c: string) => `${c} completed a session`,
      CLIENT_RED_FLAG: (c: string) => `Something to check for ${c}`,
    } as Record<string, (c: string) => string>,
  },
  fr: {
    locale: "fr-FR",
    bell: (n: number) => `Notifications, ${n} non lue${n < 2 ? "" : "s"}`,
    title: "Notifications",
    empty: "Aucune notification pour le moment.",
    loadError: "Impossible de charger les notifications.",
    retry: "Réessayer",
    markAll: "Tout marquer comme lu",
    allRead: "Toutes vos notifications sont marquées comme lues.",
    unread: "non lue",
    more: "Charger plus",
    denied: "Ce client ne fait pas partie de votre liste. Il a peut-être révoqué l'accès.",
    item: {
      CLIENT_MESSAGE: (c: string) => `Nouveau message de ${c}`,
      CLIENT_JOINED: (c: string) => `${c} a accepté votre invitation`,
      CLIENT_SESSION_COMPLETED: (c: string) => `${c} a terminé une séance`,
      CLIENT_RED_FLAG: (c: string) => `Un point à vérifier pour ${c}`,
    } as Record<string, (c: string) => string>,
  },
} as const;
type Lang = keyof typeof T;

/** The bell: the one link named « Notifications… » in the displayed shell (the other is display:none). */
const bell = (page: Page): Locator => page.getByRole("link", { name: /^Notifications/ });
const rows = (page: Page): Locator => page.locator("[data-notification-id]");
const row = (page: Page, id: string): Locator => page.locator(`[data-notification-id="${id}"]`);

/** The count is KNOWN and equals `n`: the name, the badge, and the state attribute all agree. */
async function expectBell(page: Page, lang: Lang, n: number): Promise<void> {
  const b = bell(page);
  await expect(b).toHaveAttribute("data-count-state", "known");
  await expect(b).toHaveAttribute("data-unread-count", String(n));
  await expect(b).toHaveAccessibleName(n === 0 ? T[lang].title : T[lang].bell(n));
  const badge = b.locator(".shell-bell-badge");
  if (n === 0) await expect(badge).toHaveCount(0);
  else await expect(badge).toHaveText(n > 9 ? "9+" : String(n));
}

async function signIn(page: Page, lang: Lang, coach: Account): Promise<void> {
  await signInThroughForm(page, { email: coach.email, password: PASSWORD, lang });
}

async function openInbox(page: Page): Promise<void> {
  await page.goto("/notifications");
  await expect(page.locator('[data-inbox-state="loading"]')).toHaveCount(0, { timeout: 15_000 });
}

/** What the row for `item` must say, from the api's own fields (type + actor name). */
const lineOf = (lang: Lang, item: ApiItem) => T[lang].item[item.type](item.actor.displayName ?? "");

for (const lang of ["en", "fr"] as const) {
  const L = T[lang];

  test.describe(`EV-455f bell and inbox, live api, ${lang.toUpperCase()}`, () => {
    test.use({ locale: L.locale });
    test.describe.configure({ timeout: 120_000 });

    test(`AC-1 [${lang}]: 3 unread → the bell shows 3 on every signed-in page, named with the count`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Lina ${lang} Ac1`); // CLIENT_JOINED
      await clientWrites(request, link.trainee); // CLIENT_MESSAGE
      await clientCompletes(request, link.trainee, 1); // CLIENT_SESSION_COMPLETED
      expect(await apiUnread(request, coach)).toBe(3);

      await signIn(page, lang, coach);
      for (const path of ["/", "/templates", "/challenges", `/clients/${link.coachClientId}`, "/notifications"]) {
        await page.goto(path);
        await expectBell(page, lang, 3);
      }
      // The narrow shell (top bar) has its own bell, with the same count.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await expect(page.locator(".shell-topbar .shell-bell")).toBeVisible();
      await expectBell(page, lang, 3);
    });

    test(`AC-2 [${lang}]: 0 unread → no badge and the bare name; 12 unread → « 9+ », the name says 12`, async ({ page, request }) => {
      const empty = await freshCoach(request);
      await signIn(page, lang, empty);
      await expectBell(page, lang, 0);
      // A KNOWN zero, told apart from a failed read (AC-9) by more than its look.
      await expect(bell(page)).toHaveAttribute("data-count-state", "known");
      await openInbox(page);
      await expect(page.getByText(L.empty, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: L.markAll })).toHaveCount(0);
      await runAxe(page, "empty"); // AC-10's axe, on the empty state

      await page.context().clearCookies();
      const busy = await freshCoach(request);
      const link = await linkClient(request, busy, `Noa ${lang} Ac2`);
      await clientWrites(request, link.trainee);
      await clientCompletes(request, link.trainee, 10);
      expect(await apiUnread(request, busy)).toBe(12);
      await signIn(page, lang, busy);
      await expectBell(page, lang, 12);
      await expect(bell(page)).toHaveAccessibleName(L.bell(12));
    });

    test(`AC-3 [${lang}]: newest first, catalogue texts, data-unread; 25 → 20, « ${L.more} » → 25, then gone`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Sami ${lang} Ac3`);
      await clientWrites(request, link.trainee);
      await clientCompletes(request, link.trainee, 23);
      const inbox = await apiInbox(request, coach);
      expect(inbox, "the api holds exactly 25 items for this coach").toHaveLength(25);
      // Two read items, one on each page, so `data-unread` is seen both ways.
      await apiMarkRead(request, coach, inbox[3].id);
      await apiMarkRead(request, coach, inbox[22].id);
      const truth = await apiInbox(request, coach);
      expect(truth.map((i) => i.id), "marking read does not reorder").toEqual(inbox.map((i) => i.id));

      await signIn(page, lang, coach);
      await openInbox(page);
      await expect(page.getByRole("heading", { level: 1, name: L.title })).toBeVisible();
      await expect(rows(page)).toHaveCount(20);
      const check = async (n: number) => {
        const ids = await rows(page).evaluateAll((els) => els.map((e) => e.getAttribute("data-notification-id")));
        expect(ids, "the page's order is the api's (newest first)").toEqual(truth.slice(0, n).map((i) => i.id));
        for (const item of truth.slice(0, n)) {
          const r = row(page, item.id);
          await expect(r).toHaveAttribute("data-unread", item.readAt === null ? "true" : "false");
          await expect(r.locator(".inbox-item-line")).toHaveText(lineOf(lang, item));
        }
      };
      await check(20);
      const more = page.getByRole("button", { name: L.more, exact: true });
      await expect(more).toBeVisible();
      await more.click();
      await expect(rows(page)).toHaveCount(25);
      await check(25);
      await expect(more).toHaveCount(0);
      // Staff S3: the button left the page; focus is on the first row it added, never on <body>.
      await expect(rows(page).nth(20)).toBeFocused();
      // The newest first, by time as well as by the api's order.
      const times = await page.locator("[data-notification-id] time").evaluateAll((els) => els.map((e) => Date.parse(e.getAttribute("datetime") ?? "")));
      for (let i = 1; i < times.length; i++) expect(times[i], `row ${i} is not newer than row ${i - 1}`).toBeLessThanOrEqual(times[i - 1]);
    });

    test(`AC-4 [${lang}]: a CLIENT_MESSAGE opens the thread and is read on return, badge −1; the other three open the client`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const name = `Yara ${lang} Ac4`;
      const link = await linkClient(request, coach, name);
      await clientCompletes(request, link.trainee, 1);
      await clientWrites(request, link.trainee);
      // CLIENT_RED_FLAG has no producer on api main (EV-455e): one row, written by SQL (see the rig).
      insertRedFlagItem(coach, link);
      const inbox = await apiInbox(request, coach);
      expect(inbox.map((i) => i.type).sort()).toEqual(["CLIENT_JOINED", "CLIENT_MESSAGE", "CLIENT_RED_FLAG", "CLIENT_SESSION_COMPLETED"]);
      const byType = (t: string) => inbox.find((i) => i.type === t)!;

      await signIn(page, lang, coach);
      await openInbox(page);
      await expectBell(page, lang, 4);

      const message = byType("CLIENT_MESSAGE");
      await expect(row(page, message.id)).toHaveAttribute("data-unread", "true");
      await expect(row(page, message.id)).toHaveText(new RegExp(`^${L.item.CLIENT_MESSAGE(name)}`));
      await row(page, message.id).click();
      await expect(page).toHaveURL(new RegExp(`/clients/${link.coachClientId}/messages$`));

      await bell(page).click();
      await expect(page).toHaveURL(/\/notifications$/);
      await expect(rows(page)).toHaveCount(4);
      await expect(row(page, message.id)).toHaveAttribute("data-unread", "false");
      await expectBell(page, lang, 3);
      expect((await apiInbox(request, coach)).find((i) => i.id === message.id)!.readAt).not.toBeNull();

      let left = 3;
      for (const type of ["CLIENT_JOINED", "CLIENT_SESSION_COMPLETED", "CLIENT_RED_FLAG"]) {
        const item = byType(type);
        await expect(row(page, item.id).locator(".inbox-item-line")).toHaveText(L.item[type](name));
        await row(page, item.id).click();
        await expect(page, `${type} opens the client`).toHaveURL(new RegExp(`/clients/${link.coachClientId}$`));
        await bell(page).click();
        await expect(page).toHaveURL(/\/notifications$/);
        left -= 1;
        await expect(row(page, item.id)).toHaveAttribute("data-unread", "false");
        await expectBell(page, lang, left);
      }
    });

    test(`AC-5 [${lang}] (X4): reading the thread directly makes the CLIENT_MESSAGE item read on the next count`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Ines ${lang} Ac5`);
      await clientWrites(request, link.trainee);
      const message = (await apiInbox(request, coach)).find((i) => i.type === "CLIENT_MESSAGE")!;

      await signIn(page, lang, coach);
      await expectBell(page, lang, 2);
      // Straight to the thread, not through the inbox: the page marks the thread read when shown.
      // One ordered log of protocol events: the mark's response, and each count request after it.
      const events: string[] = [];
      const markPath = `/api/bff/clients/${link.coachClientId}/messages/read`;
      page.on("response", (r) => {
        if (r.request().method() === "POST" && new URL(r.url()).pathname === markPath) events.push(`mark ${r.status()}`);
      });
      page.on("request", (r) => {
        if (r.method() === "GET" && new URL(r.url()).pathname === "/api/bff/notifications/unread-count") events.push("count");
      });
      await page.goto(`/clients/${link.coachClientId}/messages`);
      await expect.poll(() => events.includes("mark 204"), { timeout: 10_000, message: "the thread's mark-read answered 204" }).toBe(true);
      // Staff S2: the thread page's own bell re-reads AFTER the mark's 204 (not 60 s later). The page
      // load's own first read can race the mark, so only a read sent after the 204 counts here.
      await expect
        .poll(() => events.slice(events.indexOf("mark 204") + 1).filter((e) => e === "count").length, {
          timeout: 5_000,
          message: "a count read sent after the mark's 204",
        })
        .toBeGreaterThan(0);
      await expectBell(page, lang, 1);

      await page.goto("/");
      await expectBell(page, lang, 1);
      await openInbox(page);
      await expect(row(page, message.id)).toHaveAttribute("data-unread", "false");
    });

    test(`AC-6 [${lang}] (X6): an item about a revoked client opens the existing denied page`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Omar ${lang} Ac6`);
      await clientWrites(request, link.trainee);
      await revoke(request, coach, link.coachClientId);
      const inbox = await apiInbox(request, coach);
      expect(inbox, "items stay after the revoke (X6)").toHaveLength(2);

      await signIn(page, lang, coach);
      await openInbox(page);
      for (const item of inbox) {
        await row(page, item.id).click();
        await expect(page).toHaveURL(/\/clients\/denied$/);
        await expect(page.getByRole("heading", { level: 1, name: L.denied })).toBeVisible();
        await openInbox(page);
      }
    });

    test(`AC-7 [${lang}]: « ${L.markAll} » → every shown item read, the badge hidden, no reload`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Lea ${lang} Ac7`);
      await clientWrites(request, link.trainee);
      await clientCompletes(request, link.trainee, 2);

      await signIn(page, lang, coach);
      await openInbox(page);
      await expectBell(page, lang, 4);
      await expect(rows(page)).toHaveCount(4);
      await page.evaluate(() => ((window as unknown as { __ev455fNoReload: number }).__ev455fNoReload = 1));
      await page.getByRole("button", { name: L.markAll, exact: true }).click();
      for (const r of await rows(page).all()) await expect(r).toHaveAttribute("data-unread", "false");
      await expectBell(page, lang, 0);
      await expect(page.getByRole("button", { name: L.markAll })).toHaveCount(0);
      // Staff S3: focus moved to the list (not <body>), and the status line says so.
      await expect(page.getByRole("list", { name: L.title })).toBeFocused();
      await expect(page.getByRole("status").filter({ hasText: L.allRead })).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __ev455fNoReload?: number }).__ev455fNoReload), "the page was not reloaded").toBe(1);
      expect(await apiUnread(request, coach), "the server agrees").toBe(0);
    });

    test(`BUG-1094 (1, 2) [${lang}]: a new item after « ${L.markAll} » empties the status line in the render that shows the bell's 1; a second mark-all shows it again`, async ({ page, request }) => {
      test.setTimeout(240_000);
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Ines ${lang} B1094`);
      await signIn(page, lang, coach);
      await openInbox(page);
      await expectBell(page, lang, 1);
      await page.getByRole("button", { name: L.markAll, exact: true }).click();
      await expectBell(page, lang, 0);
      const status = page.locator('[data-inbox-state="all-read-status"]');
      await expect(status).toHaveText(L.allRead);
      await expect(page.getByRole("status").filter({ hasText: L.allRead })).toBeVisible();

      // Every DOM commit from here on: no moment where a bell says unread while the line says read.
      await page.evaluate(() => {
        const w = window as unknown as { __bug1094: string[]; __bug1094Seen: string[] };
        w.__bug1094 = [];
        w.__bug1094Seen = [];
        const check = () => {
          const line = document.querySelector('[data-inbox-state="all-read-status"]')?.textContent ?? "";
          const counts = Array.from(document.querySelectorAll("[data-unread-count]")).map((b) => b.getAttribute("data-unread-count") ?? "");
          w.__bug1094Seen.push(counts.join("/"));
          if (line !== "" && counts.some((n) => n !== "0")) w.__bug1094.push(`bell ${counts.join("/")} with « ${line} »`);
        };
        new MutationObserver(check).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      });

      // A new item for this coach, written by the api's own producer, read by the 60 s poll (no remount).
      await clientWrites(request, link.trainee);
      expect(await apiUnread(request, coach), "the server counts the new item").toBe(1);
      await expect(bell(page)).toHaveAttribute("data-unread-count", "1", { timeout: 75_000 });
      await expectBell(page, lang, 1);
      // Closes-when 1: the line is gone and its role="status" element is empty.
      await expect(page.getByRole("status").filter({ hasText: L.allRead })).toHaveCount(0);
      await expect(status).toHaveText("");
      await expect(status).toHaveClass(/sr-only/);
      await expect(page.getByRole("button", { name: L.markAll, exact: true })).toBeVisible();
      const seen = await page.evaluate(() => (window as unknown as { __bug1094Seen: string[] }).__bug1094Seen);
      expect(seen.some((c) => c.split("/").includes("1")), "the observer saw the bell's 1 commit").toBe(true);
      expect(await page.evaluate(() => (window as unknown as { __bug1094: string[] }).__bug1094), "no commit shows the bell's 1 beside the all-read line").toEqual([]);

      // Closes-when 2: mark-all again succeeds → the same verbatim line again (AC-7 of EV-455f).
      await page.getByRole("button", { name: L.markAll, exact: true }).click();
      await expectBell(page, lang, 0);
      await expect(status).toHaveText(L.allRead);
      await expect(status).toHaveClass(/inbox-status/);
      await expect(page.getByRole("status").filter({ hasText: L.allRead })).toBeVisible();
      expect(await apiUnread(request, coach), "the server agrees").toBe(0);
    });

    test(`BUG-1094 (3) [${lang}]: after « ${L.markAll} » with no new item, 60 s visible and a count read of 0 leave the status line shown`, async ({ page, request }) => {
      test.setTimeout(180_000);
      const coach = await freshCoach(request);
      await linkClient(request, coach, `Noa ${lang} B1094`);
      await signIn(page, lang, coach);
      await openInbox(page);
      await expectBell(page, lang, 1);
      // Every count read the PAGE gets back after the mark, with the count it answered.
      const zeros: number[] = [];
      const others: string[] = [];
      let marked = Number.POSITIVE_INFINITY;
      page.on("response", async (r) => {
        if (r.request().method() !== "GET" || new URL(r.url()).pathname !== "/api/bff/notifications/unread-count") return;
        const at = Date.now();
        if (at < marked) return;
        const body = (await r.json().catch(() => null)) as { count?: unknown } | null;
        if (r.status() === 200 && body?.count === 0) zeros.push(at);
        else others.push(`${r.status()} ${JSON.stringify(body)}`);
      });
      marked = Date.now();
      await page.getByRole("button", { name: L.markAll, exact: true }).click();
      await expectBell(page, lang, 0);
      const status = page.locator('[data-inbox-state="all-read-status"]');
      await expect(status).toHaveText(L.allRead);
      // The re-read after the 204, then the poll's read 60 s after it: at least 2 reads, both 0.
      await expect
        .poll(() => zeros.length, { timeout: 75_000, message: "at least 2 count reads returning 0 after the mark (the 60 s poll among them)" })
        .toBeGreaterThanOrEqual(2);
      expect(others, "no count read after the mark answered anything but 0").toEqual([]);
      expect(Date.now() - marked, "60 s passed with the tab visible").toBeGreaterThanOrEqual(60_000);
      await expectBell(page, lang, 0);
      await expect(status).toHaveText(L.allRead);
      await expect(page.getByRole("status").filter({ hasText: L.allRead })).toBeVisible();
    });

    test(`BUG-1094 (4) [${lang}]: an unread item's link is named "{time}, ${L.unread}", no space before the comma`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Eva ${lang} B1094`);
      await clientWrites(request, link.trainee);
      const inbox = await apiInbox(request, coach);
      await signIn(page, lang, coach);
      await openInbox(page);
      await expectBell(page, lang, inbox.length);
      const unreadLinks = page.locator('a[data-notification-id][data-unread="true"]');
      await expect(unreadLinks).toHaveCount(inbox.length);
      for (const item of inbox) {
        const a = page.locator(`a[data-notification-id="${item.id}"]`);
        const time = ((await a.locator("time").textContent()) ?? "").trim();
        expect(time, "the row shows a time").not.toBe("");
        const esc = time.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        await expect(a).toHaveAccessibleName(new RegExp(`${esc}, ${L.unread}$`));
        await expect(a).not.toHaveAccessibleName(/ ,/);
        await expect(a).toHaveAccessibleName(`${lineOf(lang, item)} ${time}, ${L.unread}`);
      }
    });

    test(`AC-4b [${lang}] (staff S1): the page an item opens counts that item read, even when the mark answers late`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Ana ${lang} S1`);
      await clientCompletes(request, link.trainee, 2);
      const joined = (await apiInbox(request, coach)).find((i) => i.type === "CLIENT_JOINED")!;
      await signIn(page, lang, coach);
      await openInbox(page);
      await expectBell(page, lang, 3);

      // The mark is held 2 s at the browser, so the new page's shell mounts while it is out.
      let markAnsweredAt = 0;
      await page.route("**/api/bff/notifications/*/read", async (route) => {
        await new Promise((r) => setTimeout(r, 2_000));
        await route.continue();
        markAnsweredAt = Date.now();
      });
      const countReads = recordCountReads(page);
      const clickedAt = Date.now();
      await row(page, joined.id).click();
      await expect(page).toHaveURL(new RegExp(`/clients/${link.coachClientId}$`));
      await expect.poll(() => markAnsweredAt, { timeout: 10_000, message: "the held mark answered" }).toBeGreaterThan(0);
      await expect
        .poll(() => countReads.filter((t) => t > clickedAt).length, { timeout: 10_000, message: "the new page read the count" })
        .toBeGreaterThan(0);
      expect(
        countReads.filter((t) => t > clickedAt && t < markAnsweredAt),
        "no count read on the new page while the mark was out (a read then would be stale)"
      ).toEqual([]);
      await page.waitForTimeout(1_500);
      await expectBell(page, lang, 2);
      expect(await apiUnread(request, coach)).toBe(2);
    });

    test(`AC-7b [${lang}] (staff S4): a failed « ${L.markAll} » says so beside the button and changes nothing`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Eli ${lang} S4`);
      await clientWrites(request, link.trainee);
      await signIn(page, lang, coach);
      await openInbox(page);
      await expectBell(page, lang, 2);
      const button = page.getByRole("button", { name: L.markAll, exact: true });

      for (const failure of ["502", "403", "network"] as const) {
        await page.route("**/api/bff/notifications/read-all", (route) =>
          failure === "network"
            ? route.abort("failed")
            : route.fulfill({ status: Number(failure), contentType: "application/json", body: '{"code":"X"}' })
        );
        await button.click();
        await expect(page.getByRole("alert").filter({ hasText: L.loadError }), `${failure}: the sentence`).toBeVisible();
        await expect(button, `${failure}: the button stays`).toBeVisible();
        for (const r of await rows(page).all()) await expect(r).toHaveAttribute("data-unread", "true");
        await expectBell(page, lang, 2);
        await page.unrouteAll();
      }
      expect(await apiUnread(request, coach), "nothing was marked").toBe(2);

      // The same button works once the request does, and the sentence goes.
      await button.click();
      await expectBell(page, lang, 0);
      await expect(page.getByRole("alert").filter({ hasText: L.loadError })).toHaveCount(0);
    });

    test(`AC-9 [${lang}]: a failing count (503 in front of the BFF) → no badge, no false 0; the page's error and « ${L.retry} »`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Rami ${lang} Ac9`);
      await clientWrites(request, link.trainee);
      await signIn(page, lang, coach);
      await expectBell(page, lang, 2);

      const fail = (route: { fulfill: (r: { status: number; body: string; contentType: string }) => Promise<void> }) =>
        route.fulfill({ status: 503, body: '{"code":"UNAVAILABLE"}', contentType: "application/json" });
      await page.route("**/api/bff/notifications/unread-count", fail);
      await page.route("**/api/bff/notifications", fail);
      await page.route("**/api/bff/notifications?*", fail);

      await page.goto("/notifications");
      const b = bell(page);
      await expect(b).toHaveAttribute("data-count-state", "failed");
      await expect(b).not.toHaveAttribute("data-unread-count", /.*/);
      await expect(b.locator(".shell-bell-badge")).toHaveCount(0);
      await expect(b).toHaveAccessibleName(L.title);
      await expect(page.getByRole("alert").filter({ hasText: L.loadError })).toBeVisible();
      await expect(rows(page)).toHaveCount(0);
      await expect(page.getByText(L.empty)).toHaveCount(0);
      await runAxe(page, "load error"); // AC-10's axe, on the error state

      // A failed count on another page is the same: no badge, no 0.
      await page.goto("/");
      await expect(bell(page)).toHaveAttribute("data-count-state", "failed");
      await expect(bell(page).locator(".shell-bell-badge")).toHaveCount(0);

      await page.goto("/notifications");
      await expect(page.getByRole("alert").filter({ hasText: L.loadError })).toBeVisible();
      await page.unrouteAll();
      await page.getByRole("button", { name: L.retry, exact: true }).click();
      await expect(rows(page)).toHaveCount(2);
      await expectBell(page, lang, 2);
    });

    test(`AC-10 [${lang}]: Tab reaches the bell, Enter opens it, items are links; axe finds nothing on /notifications`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Zoe ${lang} Ac10`);
      await clientWrites(request, link.trainee);
      await signIn(page, lang, coach);
      await expectBell(page, lang, 2);

      await page.locator("body").focus();
      let reached = false;
      for (let i = 0; i < 25 && !reached; i++) {
        await page.keyboard.press("Tab");
        reached = await page.evaluate(() => document.activeElement?.classList.contains("shell-bell") ?? false);
      }
      expect(reached, "Tab reaches the bell").toBe(true);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/notifications$/);
      await expect(rows(page)).toHaveCount(2);
      for (const r of await rows(page).all()) {
        expect(await r.evaluate((e) => e.tagName)).toBe("A");
        await expect(r).toHaveAttribute("href", new RegExp(`^/clients/${link.coachClientId}(/messages)?$`));
      }

      await runAxe(page, "list");
      // The two other states a coach can meet here.
      await page.getByRole("button", { name: L.markAll, exact: true }).click();
      await expectBell(page, lang, 0);
      await runAxe(page, "list, all read");
    });
  });
}

test.describe("EV-455f the poll, live api", () => {
  test.use({ locale: "en-US" });

  test("AC-8: hidden for 3 minutes → no unread-count read; visible → one within 2 s, then one every 60 s", async ({ page, request }) => {
    test.setTimeout(480_000);
    const coach = await freshCoach(request);
    await linkClient(request, coach, "Pia Ac8");
    await signIn(page, "en", coach);
    const reads = recordCountReads(page);
    const loaded = Date.now();
    await page.goto("/templates");
    await expect.poll(() => reads.filter((t) => t >= loaded).length, { timeout: 10_000, message: "one read on page load" }).toBe(1);
    await expectBell(page, "en", 1);

    await setHidden(page, true);
    const hiddenFrom = reads.length;
    await page.waitForTimeout(180_000);
    expect(reads.length - hiddenFrom, "unread-count reads during 3 minutes hidden").toBe(0);

    const shown = Date.now();
    await setHidden(page, false);
    await expect.poll(() => reads.filter((t) => t >= shown).length, { timeout: 2_000, message: "one read within 2 s of visible" }).toBe(1);
    const first = reads.filter((t) => t >= shown)[0];
    await page.waitForTimeout(125_000);
    const after = reads.filter((t) => t >= shown);
    expect(after.length, "visible for 125 s after the return: the return read, then two at 60 s and 120 s").toBe(3);
    const gaps = after.slice(1).map((t, i) => t - after[i]);
    for (const g of gaps) {
      expect(g, "60 s between reads").toBeGreaterThanOrEqual(59_000);
      expect(g, "60 s between reads").toBeLessThanOrEqual(63_000);
    }
    expect(first - shown).toBeLessThan(2_000);
  });
});

/** axe-core, the package this repo pins, injected into the page; every rule axe runs by default. */
async function runAxe(page: Page, state: string): Promise<void> {
  const require_ = createRequire(__filename);
  await page.addScriptTag({ path: require_.resolve("axe-core/axe.min.js") });
  const violations = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run(document);
    return result.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target.join(" ")) }));
  });
  expect(violations, `axe on /notifications (${state})`).toEqual([]);
}
