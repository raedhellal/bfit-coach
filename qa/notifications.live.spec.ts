import { createRequire } from "node:module";
import { expect, test, type Locator, type Page, type Request, type Response as PwResponse, type Route } from "@playwright/test";
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
      // BUG-1102: « de » elides before a vowel (« d'Eva »), as copy.fr.ts's de() does. A literal rule sized
      // to the ASCII names this file uses (Eva, Sami, Yara…); it does not model accents, Y before a consonant or H.
      CLIENT_MESSAGE: (c: string) => (/^[aeiou]/i.test(c) ? `Nouveau message d'${c}` : `Nouveau message de ${c}`),
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
/** The parts of a Playwright request / response the helpers below read (structural: BUG-1109 S1's test feeds fakes). */
type SeenRequest = { method(): string; url(): string; timing(): { startTime: number; responseStart: number } };
type SeenResponse = { status(): number; request(): SeenRequest };
const isCountRead = (r: Pick<SeenRequest, "method" | "url">) =>
  r.method() === "GET" && new URL(r.url()).pathname === "/api/bff/notifications/unread-count";
const isMarkAll = (r: Pick<SeenRequest, "method" | "url">) =>
  r.method() === "POST" && new URL(r.url()).pathname === "/api/bff/notifications/read-all";
/** When the browser sent `r` (browser clock, ms since the epoch). */
const sentAt = (r: Pick<SeenRequest, "timing">) => r.timing().startTime;
/**
 * BUG-1108: when the browser got the mark-all's 204 (browser clock), or 0 for any other response.
 * When the browser's timing has no `responseStart` (-1), the time Node receives the event stands in.
 */
function markAllAnsweredAt(r: SeenResponse): number {
  if (!isMarkAll(r.request()) || r.status() !== 204) return 0;
  const t = r.request().timing();
  return t.responseStart >= 0 ? t.startTime + t.responseStart : Date.now();
}

/**
 * BUG-1109 S1: hands `onRead` every count-read response whose request the browser SENT at or after
 * the mark-all's 204 (`sentAt` against `markAllAnsweredAt`), in either order of delivery.
 * Two clocks (BUG-1113 F1): `sentAt` is always the browser's. `markAllAnsweredAt` is the browser's
 * when the 204 has a `responseStart`, and Node's `Date.now()` when that is -1. In that fallback the
 * mark is when Node got the event, after the browser's 204, so a read sent between the two counts
 * as sent before it and is not handed on: a missed 0 (a false red) or a missed non-zero (a false
 * green in BUG-1094 (3)), by trace. No run has shown a -1 here.
 * A count-read response delivered BEFORE the mark-all's own 204 event is buffered, not dropped:
 * when the 204 arrives, each buffered read sent at or after it is handed on and the rest are
 * discarded. A read delivered after the 204 is handed on at once if it was sent at or after it.
 * Returns a reader of the 204's time (0 until it is seen). Witness: the test
 * "BUG-1109 S1 (no browser)" below delivers a read before the 204 that was sent after it.
 */
function countReadsAfterMarkAll<R extends SeenResponse>(subscribe: (fn: (r: R) => void) => void, onRead: (r: R) => unknown): () => number {
  let marked = 0;
  let early: R[] = [];
  subscribe((r) => {
    if (marked === 0) {
      const at = markAllAnsweredAt(r);
      if (at === 0) {
        if (isCountRead(r.request())) early.push(r);
        return;
      }
      marked = at;
      const held = early;
      early = [];
      for (const e of held) if (sentAt(e.request()) >= marked) void onRead(e);
      return;
    }
    if (isCountRead(r.request()) && sentAt(r.request()) >= marked) void onRead(r);
  });
  return () => marked;
}

/** The api item `match` picks, asserted present by name first (BUG-1108 N-d: no find-then-bang). */
function itemIn(items: ApiItem[], what: string, match: (i: ApiItem) => boolean): ApiItem {
  const item = items.find(match);
  expect(item, `the api inbox holds ${what}`).toBeDefined();
  return item as ApiItem;
}

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

/** AC-9's failing count: a 503 in front of the BFF. */
const fail503 = (route: Route) => route.fulfill({ status: 503, body: '{"code":"UNAVAILABLE"}', contentType: "application/json" });

/**
 * BUG-1109: a count read NOW rather than at the next 60 s poll. Hiding then showing the tab makes
 * the provider read at once when no read is out (`onVisibility`, NotificationsProvider.tsx:138-141).
 * Same page, no reload and no navigation.
 */
async function readCountNow(page: Page): Promise<void> {
  await setHidden(page, true);
  await setHidden(page, false);
}

/**
 * BUG-1109: the BUG-1108 B1 guard, armed from here on: a `window` marker (gone after a reload) and a
 * main-frame `framenavigated` log. The returned check fails on either.
 */
async function armNoReloadGuard(page: Page): Promise<() => Promise<void>> {
  await page.evaluate(() => ((window as unknown as { __bug1109NoReload: number }).__bug1109NoReload = 1));
  const navigations: string[] = [];
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navigations.push(f.url());
  });
  return async () => {
    expect(await page.evaluate(() => (window as unknown as { __bug1109NoReload?: number }).__bug1109NoReload), "the page was not reloaded").toBe(1);
    expect(navigations, "no navigation").toEqual([]);
  };
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
      const byType = (t: string) => itemIn(inbox, `a ${t} item`, (i) => i.type === t);

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
      expect(itemIn(await apiInbox(request, coach), "the CLIENT_MESSAGE item just opened", (i) => i.id === message.id).readAt).not.toBeNull();

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
      const message = itemIn(await apiInbox(request, coach), "a CLIENT_MESSAGE item", (i) => i.type === "CLIENT_MESSAGE");

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
      // BUG-1108 N-c (option b): the first mark-all's 204, then the re-read it asks for answering 0.
      // `clientWrites` waits for that re-read, which restarts the 60 s timer, so the 1 can only come
      // from the 60 s poll, and the test asserts the 60 s.
      let reReadAt = 0;
      const markedAt = countReadsAfterMarkAll<PwResponse>(
        (fn) => page.on("response", fn),
        async (r) => {
          if (reReadAt > 0 || r.status() !== 200) return;
          const body = (await r.json().catch(() => null)) as { count?: unknown } | null;
          if (body?.count === 0 && reReadAt === 0) reReadAt = Date.now();
        }
      );
      await page.getByRole("button", { name: L.markAll, exact: true }).click();
      await expectBell(page, lang, 0);
      const status = page.locator('[data-inbox-state="all-read-status"]');
      await expect(status).toHaveText(L.allRead);
      await expect(page.getByRole("status").filter({ hasText: L.allRead })).toBeVisible();
      await expect.poll(markedAt, { timeout: 10_000, message: "the mark-all answered 204" }).toBeGreaterThan(0);
      await expect.poll(() => reReadAt, { timeout: 10_000, message: "a count read sent after the mark-all 204 answered 0" }).toBeGreaterThan(0);

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
      // BUG-1108 N2: Node's clock minus the browser's, both this host's wall clock (local Chromium); margin over 60 s +419 ms EN, +328 ms FR at ad5c029d.
      const oneAfter = Date.now() - markedAt();
      test.info().annotations.push({ type: "BUG-1108 N-c", description: `the bell's 1 at +${oneAfter} ms after the mark-all 204 (the 60 s poll)` });
      expect(oneAfter, "the bell's 1 came from the 60 s poll: at least 60 s after the mark-all 204").toBeGreaterThanOrEqual(60_000);
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

    test(`BUG-1094 (B1) [${lang}]: after the bell's 1, a failing count (503) keeps the all-read line empty: a failure is no 0`, async ({ page, request }) => {
      test.setTimeout(240_000);
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Ivo ${lang} B1094`);
      await signIn(page, lang, coach);
      await openInbox(page);
      await expectBell(page, lang, 1);
      await page.getByRole("button", { name: L.markAll, exact: true }).click();
      await expectBell(page, lang, 0);
      const status = page.locator('[data-inbox-state="all-read-status"]');
      await expect(status).toHaveText(L.allRead);
      // BUG-1108 B1 guard: a reload or a navigation from here on would reset the inbox's all-read
      // state and pass this test falsely. The marker dies with a reload; the listener sees the rest.
      // BUG-1113 F4: the shared `armNoReloadGuard`, so the BUG-1109 N1 mutant witnesses it here.
      const noReload = await armNoReloadGuard(page);

      // Item 1's steps: a new item, read by the 60 s poll, hides the line.
      await clientWrites(request, link.trainee);
      await expect(bell(page)).toHaveAttribute("data-unread-count", "1", { timeout: 75_000 });
      await expectBell(page, lang, 1);
      await expect(status).toHaveText("");

      // Then the count fails (AC-9's 503 in front of the BFF), read by the next poll (no remount).
      const fail = (route: { fulfill: (r: { status: number; body: string; contentType: string }) => Promise<void> }) =>
        route.fulfill({ status: 503, body: '{"code":"UNAVAILABLE"}', contentType: "application/json" });
      await page.route("**/api/bff/notifications/unread-count", fail);
      await expect(bell(page)).toHaveAttribute("data-count-state", "failed", { timeout: 75_000 });
      await expect(bell(page)).not.toHaveAttribute("data-unread-count", /.*/);
      // The server still holds 1 unread: the line must not come back on a failure.
      expect(await apiUnread(request, coach), "the server still counts the new item").toBe(1);
      await expect(page.getByRole("status").filter({ hasText: L.allRead })).toHaveCount(0);
      await expect(status).toHaveText("");
      await expect(status).toHaveClass(/sr-only/);
      await noReload();
      await page.unrouteAll();
    });

    // BUG-1109 closes-when 1. Witness (closes-when 2): deleting `lastKnown.current = 0;` in
    // Inbox.tsx `markAll` turns the "line shows" assertion red.
    test(`BUG-1109 (a) [${lang}]: a mark-all 204 while the count read is failing shows the all-read line`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      await linkClient(request, coach, `Uma ${lang} B1109a`);
      await signIn(page, lang, coach);
      await openInbox(page);
      // Given: a KNOWN count of 1, so the inbox's last known count is 1 (neither null nor 0).
      await expectBell(page, lang, 1);
      const status = page.locator('[data-inbox-state="all-read-status"]');
      await expect(status).toHaveText("");
      const noReload = await armNoReloadGuard(page);

      // When: the count read fails (503), and the bell says so.
      await page.route("**/api/bff/notifications/unread-count", fail503);
      await readCountNow(page);
      await expect(bell(page)).toHaveAttribute("data-count-state", "failed", { timeout: 10_000 });
      await expect(bell(page)).not.toHaveAttribute("data-unread-count", /.*/);
      // Then mark-all, against the REAL read-all.
      const markAll = page.waitForResponse((r) => isMarkAll(r.request()), { timeout: 10_000 });
      await page.getByRole("button", { name: L.markAll, exact: true }).click();
      expect((await markAll).status(), "the real read-all answered 204").toBe(204);

      // Then: the verbatim all-read line, while the count is still failing.
      await expect(status).toHaveText(L.allRead);
      // Both read in one task, so they are the same commit: the line beside a failed count, every bell.
      const snapshot = await page.evaluate(() => ({
        line: document.querySelector('[data-inbox-state="all-read-status"]')?.textContent ?? "",
        states: Array.from(document.querySelectorAll("[data-count-state]")).map((b) => b.getAttribute("data-count-state")),
      }));
      expect(snapshot.line).toBe(L.allRead);
      expect(snapshot.states.length, "the shell draws its bells").toBeGreaterThan(0);
      expect(snapshot.states.every((s) => s === "failed"), `every bell still failed: ${snapshot.states.join("/")}`).toBe(true);
      await expect(status).toHaveClass(/inbox-status/);
      await expect(page.getByRole("status").filter({ hasText: L.allRead })).toBeVisible();
      await noReload();
      await page.unrouteAll();
      expect(await apiUnread(request, coach), "the server agrees").toBe(0);
    });

    // BUG-1109 closes-when 3. Witness (closes-when 4): `if (again)` in NotificationsProvider.tsx
    // `tick` made `if (false)` turns the "line shows again" assertion red: the one that checks the
    // re-read the 204 asked for, sent after the held read's release.
    test(`BUG-1109 (b) [${lang}]: a count read sent before the mark that answers a stale 3 hides the line; the re-read the 204 asked for shows it again`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Teo ${lang} B1109b`);
      await clientWrites(request, link.trainee);
      await signIn(page, lang, coach);
      await openInbox(page);
      // Given: the inbox with unread items, and a known count of 2.
      await expectBell(page, lang, 2);
      const status = page.locator('[data-inbox-state="all-read-status"]');
      await expect(status).toHaveText("");
      const noReload = await armNoReloadGuard(page);

      // The FIRST count read from here on is held at the browser. Every later one waits for `letLater`
      // (so the stale 3 stays on screen long enough to be asserted), then goes to the real api.
      const hold: { route?: Route } = {};
      let releasedAt = 0;
      let letLater: () => void = () => undefined;
      const later = new Promise<void>((resolve) => (letLater = resolve));
      const sentAfterRelease = new Set<Request>();
      await page.route("**/api/bff/notifications/unread-count", async (route) => {
        if (hold.route === undefined) {
          hold.route = route;
          return;
        }
        if (releasedAt > 0) sentAfterRelease.add(route.request());
        await later;
        await route.continue();
      });
      let zeroAfterRelease = 0;
      page.on("response", async (r) => {
        if (!sentAfterRelease.has(r.request()) || r.status() !== 200) return;
        const body = (await r.json().catch(() => null)) as { count?: unknown } | null;
        if (body?.count === 0 && zeroAfterRelease === 0) zeroAfterRelease = Date.now();
      });

      // When: a count read is sent, and is still out, BEFORE the mark-all click.
      await readCountNow(page);
      await expect.poll(() => hold.route !== undefined, { timeout: 10_000, message: "a count read is held before the click" }).toBe(true);
      const stale = hold.route;
      expect(stale, "the held count read").toBeDefined();
      const markAll = page.waitForResponse((r) => isMarkAll(r.request()), { timeout: 10_000 });
      await page.getByRole("button", { name: L.markAll, exact: true }).click();
      expect((await markAll).status(), "the real read-all answered 204").toBe(204);
      // The 204's own 0 (settle) shows the line.
      await expectBell(page, lang, 0);
      await expect(status).toHaveText(L.allRead);

      // The held read answers after the mark, with a stale 3: the line is hidden once the 3 is applied.
      releasedAt = Date.now();
      await (stale as Route).fulfill({ status: 200, contentType: "application/json", body: '{"count":3}' });
      await expectBell(page, lang, 3);
      await expect(status).toHaveText("");
      await expect(status).toHaveClass(/sr-only/);

      // Then: the re-read the 204 asked for answers 0 (the real api), and the line shows again within
      // 15 s of the release. The poll is 60 s, so only the re-read can satisfy this.
      letLater();
      await expect(status, "the re-read the 204 asked for (sent after the held read's release) answers 0: the line shows again within 15 s of that release").toHaveText(L.allRead, {
        timeout: Math.max(1, releasedAt + 15_000 - Date.now()),
      });
      await expect.poll(() => zeroAfterRelease, { timeout: 5_000, message: "a count read sent after the release answered 0" }).toBeGreaterThan(0);
      expect(zeroAfterRelease - releasedAt, "that 0 came within 15 s of the release").toBeLessThanOrEqual(15_000);
      await expectBell(page, lang, 0);
      await expect(page.getByRole("status").filter({ hasText: L.allRead })).toBeVisible();
      await noReload();
      await page.unrouteAll();
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
      // Only reads SENT after the mark-all's 204 count (BUG-1108 N-a: not after the click): a read
      // sent before it may answer after it, with the old 1, and says nothing about the line (staff S1).
      const zeros: number[] = [];
      const others: string[] = [];
      const marked = countReadsAfterMarkAll<PwResponse>(
        (fn) => page.on("response", fn),
        async (r) => {
          const at = Date.now();
          const body = (await r.json().catch(() => null)) as { count?: unknown } | null;
          if (r.status() === 200 && body?.count === 0) zeros.push(at);
          else others.push(`${r.status()} ${JSON.stringify(body)}`);
        }
      );
      await page.getByRole("button", { name: L.markAll, exact: true }).click();
      await expectBell(page, lang, 0);
      const status = page.locator('[data-inbox-state="all-read-status"]');
      await expect(status).toHaveText(L.allRead);
      await expect.poll(marked, { timeout: 10_000, message: "the mark-all answered 204" }).toBeGreaterThan(0);
      // The re-read after the 204, then the poll's read 60 s after it: at least 2 reads, both 0.
      await expect
        .poll(() => zeros.length, { timeout: 75_000, message: "at least 2 count reads returning 0 after the mark (the 60 s poll among them)" })
        .toBeGreaterThanOrEqual(2);
      expect(others, "no count read after the mark answered anything but 0").toEqual([]);
      expect(Date.now() - marked(), "60 s passed with the tab visible").toBeGreaterThanOrEqual(60_000);
      await expectBell(page, lang, 0);
      await expect(status).toHaveText(L.allRead);
      await expect(page.getByRole("status").filter({ hasText: L.allRead })).toBeVisible();
    });

    test(`BUG-1094 (4) [${lang}]: an unread item's link is named "{time}, ${L.unread}", no space before the comma; a read one "{line} {time}"`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Eva ${lang} B1094`);
      await clientWrites(request, link.trainee);
      await clientCompletes(request, link.trainee, 1);
      const completed = itemIn(await apiInbox(request, coach), "a CLIENT_SESSION_COMPLETED item", (i) => i.type === "CLIENT_SESSION_COMPLETED");
      await apiMarkRead(request, coach, completed.id);
      const inbox = await apiInbox(request, coach);
      const unreadItems = inbox.filter((i) => i.readAt === null);
      const readItems = inbox.filter((i) => i.readAt !== null);
      expect(readItems.map((i) => i.id), "exactly the completed session is read").toEqual([completed.id]);
      await signIn(page, lang, coach);
      await openInbox(page);
      await expectBell(page, lang, unreadItems.length);
      await expect(page.locator('a[data-notification-id][data-unread="true"]')).toHaveCount(unreadItems.length);
      const timeOf = async (a: Locator) => {
        const time = ((await a.locator("time").textContent()) ?? "").trim();
        expect(time, "the row shows a time").not.toBe("");
        return time;
      };
      for (const item of unreadItems) {
        const a = page.locator(`a[data-notification-id="${item.id}"]`);
        const time = await timeOf(a);
        const esc = time.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        await expect(a).toHaveAccessibleName(new RegExp(`${esc}, ${L.unread}$`));
        await expect(a).not.toHaveAccessibleName(/ ,/);
        await expect(a).toHaveAccessibleName(`${lineOf(lang, item)} ${time}, ${L.unread}`);
      }
      // N4: a READ link says no "unread" at all: its line and its time.
      const read = page.locator(`a[data-notification-id="${completed.id}"]`);
      await expect(read).toHaveAttribute("data-unread", "false");
      await expect(read).toHaveAccessibleName(`${lineOf(lang, completed)} ${await timeOf(read)}`);
    });

    test(`AC-4b [${lang}] (staff S1): the page an item opens counts that item read, even when the mark answers late`, async ({ page, request }) => {
      const coach = await freshCoach(request);
      const link = await linkClient(request, coach, `Ana ${lang} S1`);
      await clientCompletes(request, link.trainee, 2);
      const joined = itemIn(await apiInbox(request, coach), "a CLIENT_JOINED item", (i) => i.type === "CLIENT_JOINED");
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

/**
 * BUG-1109 S1: `countReadsAfterMarkAll` places each count read by when the browser SENT it, not by
 * the order Playwright delivers the events in. Language-free, no page: synthetic responses, one of
 * them a read sent after the 204 but delivered before it. Witnesses (phase 2 mutants): deleting the
 * flush loop drops that read (red); flushing without the `sentAt` check lets a pre-204 read in (red).
 */
test("BUG-1109 S1 (no browser): a count read delivered before the mark-all's 204 event is kept if sent after the 204, dropped if sent before", () => {
  type Fake = SeenResponse & { name: string };
  const COUNT = "/api/bff/notifications/unread-count";
  const fake = (name: string, method: string, path: string, status: number, startTime: number, responseStart: number): Fake => ({
    name,
    status: () => status,
    request: () => ({ method: () => method, url: () => `http://localhost:3301${path}`, timing: () => ({ startTime, responseStart }) }),
  });
  let emit: (r: Fake) => void = () => undefined;
  const handed: string[] = [];
  const marked = countReadsAfterMarkAll<Fake>(
    (fn) => {
      emit = fn;
    },
    (r) => handed.push(r.name)
  );
  expect(marked(), "no 204 seen yet").toBe(0);
  // The mark-all is sent at t = 1000 and its 204 starts 50 ms later: the 204 is at 1050 (browser clock).
  for (const e of [
    fake("sent 1040, delivered before the 204", "GET", COUNT, 200, 1_040, 30),
    fake("sent 1060, delivered before the 204", "GET", COUNT, 200, 1_060, 5),
    fake("a list read, delivered before the 204", "GET", "/api/bff/notifications", 200, 1_070, 5),
    fake("the mark-all's 204", "POST", "/api/bff/notifications/read-all", 204, 1_000, 50),
    fake("sent 1045, delivered after the 204", "GET", COUNT, 200, 1_045, 40),
    fake("sent 1080, delivered after the 204", "GET", COUNT, 200, 1_080, 5),
  ])
    emit(e);
  expect(marked(), "the 204's browser time").toBe(1_050);
  expect(handed, "exactly the count reads sent at or after the 204, in either delivery order").toEqual([
    "sent 1060, delivered before the 204",
    "sent 1080, delivered after the 204",
  ]);
});

/**
 * BUG-1113 F5: S1's boundary, a count read sent at exactly the 204's browser time (1050). The rule
 * is "sent at or after", so both are kept: one delivered before the 204 (the flush loop's `>=`) and
 * one delivered after it (the later `>=`). Witness owed by the gate: each `>=` made `>` should drop
 * its read and turn this test red.
 */
test("BUG-1113 F5 (no browser): a count read sent at exactly the 204's time (1050) is kept, delivered before or after the 204", () => {
  type Fake = SeenResponse & { name: string };
  const COUNT = "/api/bff/notifications/unread-count";
  const fake = (name: string, method: string, path: string, status: number, startTime: number, responseStart: number): Fake => ({
    name,
    status: () => status,
    request: () => ({ method: () => method, url: () => `http://localhost:3301${path}`, timing: () => ({ startTime, responseStart }) }),
  });
  let emit: (r: Fake) => void = () => undefined;
  const handed: string[] = [];
  const marked = countReadsAfterMarkAll<Fake>(
    (fn) => {
      emit = fn;
    },
    (r) => handed.push(r.name)
  );
  for (const e of [
    fake("sent 1050, delivered before the 204", "GET", COUNT, 200, 1_050, 5),
    fake("the mark-all's 204", "POST", "/api/bff/notifications/read-all", 204, 1_000, 50),
    fake("sent 1050, delivered after the 204", "GET", COUNT, 200, 1_050, 5),
  ])
    emit(e);
  expect(marked(), "the 204's browser time").toBe(1_050);
  expect(handed, "both reads sent at exactly the 204's time are kept").toEqual([
    "sent 1050, delivered before the 204",
    "sent 1050, delivered after the 204",
  ]);
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
