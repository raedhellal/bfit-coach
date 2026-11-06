import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-475 — the portal's bell and inbox ask the api for COACH items only (`audience=COACH`).
 *
 * A coach can also be someone's trainee (EV-467 AC-2). Their `/me/notifications` then holds both
 * the `CLIENT_*` items the portal is for and their own coach's `COACH_*` items, which belong to
 * the app. Without `audience=COACH` the bell counted both, and « Tout marquer comme lu » marked the
 * app's items read too.
 *
 * Fixture mode, default suite. `evoli_fixture_inbox=dual-role` (this browser context only) is that
 * coach's inbox: one unread `CLIENT_MESSAGE`, one unread `COACH_PLAN_PUBLISHED`. Fixture mode runs
 * the live client's own list / count / read-all functions, and the fixture answers the PATH they
 * built as the api at `4963d486` does (`fixtureInboxFetch`): absent `audience` is every type,
 * `COACH` the `CLIENT_*` types. So dropping `audience` from one of those functions changes what
 * this spec sees:
 *
 *   · AC-2: the bell reads 1, not 2 (mutant: no `audience` in `getNotificationsUnreadCount`);
 *   · AC-3: after « Tout marquer comme lu » the `CLIENT_MESSAGE` is read and the
 *     `COACH_PLAN_PUBLISHED` is still unread, read back WITHOUT an audience from the fixture's
 *     store (`GET /api/fixture/inbox`) (mutant: no `audience` in `markAllNotificationsRead`);
 *   · every inbox request the fixture answered carried exactly `audience=COACH`
 *     (`GET /api/fixture/calls` → `inboxCalls`), which is AC-1's grep seen at run time, and the
 *     only witness of the list read: the inbox draws `CLIENT_*` items only, with or without it.
 *
 * Expected values are LITERALS.
 */

const CLIENT_MESSAGE_ID = "e4750000-0000-4000-8000-000000000001";
const COACH_PLAN_PUBLISHED_ID = "e4750000-0000-4000-8000-000000000002";

const T = {
  en: { locale: "en-US", bellOne: "Notifications, 1 unread", markAll: "Mark all as read" },
  fr: { locale: "fr-FR", bellOne: "Notifications, 1 non lue", markAll: "Tout marquer comme lu" },
} as const;

async function dualRoleInbox(page: Page, baseURL: string) {
  await page.context().addCookies([{ name: "evoli_fixture_inbox", value: "dual-role", url: new URL("/", baseURL).href }]);
}

/** The shell draws two bells (sidebar, top bar) and CSS hides one: the one the coach sees. */
function bell(page: Page) {
  return page.locator("a.shell-bell").filter({ visible: true });
}

type StoredItem = { id: string; type: string; readAt: string | null };

async function storedInbox(page: Page): Promise<{ items: StoredItem[]; unreadWithoutAudience: number }> {
  const res = await page.request.get("/api/fixture/inbox", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/inbox — 404 means the server is not in fixture mode").toBe(200);
  return res.json();
}

async function inboxCalls(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { inboxCalls: string[] }).inboxCalls;
}

/** Every inbox request carried `audience=COACH`, once, and no other value. */
function expectAllCoach(calls: string[]) {
  expect(calls.length, "the portal made at least one inbox request").toBeGreaterThan(0);
  for (const call of calls) {
    const query = new URLSearchParams(call.split("?")[1] ?? "");
    expect(query.getAll("audience"), `audience on « ${call} »`).toEqual(["COACH"]);
  }
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`EV-475 (${lang})`, () => {
    test.use({ locale: T[lang].locale });

    test("AC-2: a dual-role coach's bell counts the CLIENT_MESSAGE only", async ({ page, baseURL }) => {
      await dualRoleInbox(page, baseURL!);
      await signInThroughForm(page, { lang });

      // The store holds two unread items: the bell must not count the coach's own one.
      expect((await storedInbox(page)).unreadWithoutAudience, "the fixture holds two unread items").toBe(2);

      await expect(bell(page)).toHaveAttribute("data-count-state", "known");
      await expect(bell(page)).toHaveAttribute("data-unread-count", "1");
      await expect(bell(page)).toHaveAccessibleName(T[lang].bellOne);

      const calls = await inboxCalls(page);
      expect(calls).toContain("GET /me/notifications/unread-count?audience=COACH");
      expectAllCoach(calls);
    });

    test("AC-3: « Tout marquer comme lu » reads the CLIENT_MESSAGE and leaves COACH_PLAN_PUBLISHED unread", async ({
      page,
      baseURL,
    }) => {
      await dualRoleInbox(page, baseURL!);
      await signInThroughForm(page, { lang });
      await page.goto("/notifications");
      await expect(page.locator('[data-inbox-state="list"]')).toBeVisible();
      await expect(bell(page)).toHaveAttribute("data-unread-count", "1");

      const readAll = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/bff/notifications/read-all" && r.request().method() === "POST"
      );
      await page.getByRole("button", { name: T[lang].markAll, exact: true }).click();
      expect((await readAll).status()).toBe(204);
      await expect(page.locator('[data-inbox-state="all-read-status"]')).not.toBeEmpty();
      await expect(bell(page)).toHaveAttribute("data-unread-count", "0");

      // Read back from the store, with NO audience: every type, as the app would see it.
      const stored = await storedInbox(page);
      const byId = new Map(stored.items.map((item) => [item.id, item]));
      expect(byId.get(CLIENT_MESSAGE_ID)?.type).toBe("CLIENT_MESSAGE");
      expect(byId.get(CLIENT_MESSAGE_ID)?.readAt, "the CLIENT_MESSAGE is read").not.toBeNull();
      expect(byId.get(COACH_PLAN_PUBLISHED_ID)?.type).toBe("COACH_PLAN_PUBLISHED");
      expect(byId.get(COACH_PLAN_PUBLISHED_ID)?.readAt, "the coach's own COACH_PLAN_PUBLISHED is still unread").toBeNull();
      expect(stored.unreadWithoutAudience, "a call without audience still counts 1").toBe(1);

      const calls = await inboxCalls(page);
      expect(calls).toContain("GET /me/notifications?audience=COACH&limit=20");
      expect(calls).toContain("POST /me/notifications/read-all?audience=COACH");
      expectAllCoach(calls);
    });
  });
}

test("no cookie: the inbox is empty and the bell draws no badge, as before EV-475", async ({ page }) => {
  await signInThroughForm(page, { lang: "en" });
  await expect(bell(page)).toHaveAttribute("data-unread-count", "0");
  await expect(bell(page)).toHaveAccessibleName("Notifications");
  expect(await storedInbox(page)).toEqual({ items: [], unreadWithoutAudience: 0 });
});
