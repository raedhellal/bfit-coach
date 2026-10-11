import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import {
  LABELS,
  LINA,
  LINA_NAME,
  SEEDED_TEMPLATE,
  YUSUF,
  YUSUF_NAME,
  epochCookieName,
  expectLeftToLogin,
  expectNoLoop,
  fmt,
  holdResponse,
  hydrated,
  layerAfter,
  openLinaThenRoster,
  openTabs,
  recordsAfter,
  signOutInTab2,
  type Lang,
  type Tabs,
} from "./session-epoch-harness";
import { signInThroughForm } from "./sign-in";
import { openEveryDay } from "./day-accordion";

/**
 * BUG-745, ADR-0033 D33.14 — a session boundary in one tab is honoured by every tab of the
 * browser. The QA witnesses W2–W18 (W1 needs EV-356d's IntentLink and `static: 30`, so it is
 * shown on the rebuilt train only). W16 runs because this branch contains s3j (`4e95519`), whose
 * create corrects the URL with a `replaceState(null, …)` that Next syncs (K9). W4b is not in the
 * ADR: see its comment.
 *
 * Run by `playwright.session.config.ts` on `next dev` AND `next start`, Chromium AND WebKit, EN
 * and FR. Harness: `qa/session-epoch-harness.ts` (records, layers, requests).
 *
 * (d) is OFF unless a witness says otherwise (staff r2 S3): the sign-out's BroadcastChannel
 * message, or a `focus` when Playwright brings tab 1 forward, would reload tab 1 before the
 * click, traversal or action resolution the witness is about. `evoli_fixture_session_wake=off`
 * is that "M9 build" in fixture mode (no post, no listener). W5, W6, W10, W11, W14 and W18 run
 * with (d) on.
 */

const UPPER_LOWER = "7c2d0a11-0000-4000-8000-0000000000b1";
const UNLINKED = "00000000-0000-0000-0000-000000000000";

/** A fixture-shaped unsigned token (middleware decodes, never verifies). */
function token(roles: string[], exp: number): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "none", typ: "JWT" })}.${enc({ sub: "1a2b3c4d-0000-4000-8000-00000000c0ac", email: "coach@evoli.fit", roles, exp })}.fixture`;
}

/** Replace the session cookies in the shared jar, with the attributes the server writes. */
async function setSession(t: Tabs, access: string, refresh: string): Promise<void> {
  const secure = t.baseURL.startsWith("https:");
  const domain = new URL(t.baseURL).hostname;
  await t.context.addCookies([
    { name: "evoli_pro_at", value: access, domain, path: "/", httpOnly: true, secure, sameSite: "Lax" },
    { name: "evoli_pro_rt", value: refresh, domain, path: "/", httpOnly: true, secure, sameSite: "Lax" },
  ]);
}

async function epochValue(t: Tabs): Promise<string | undefined> {
  return (await t.context.cookies()).find((c) => c.name === epochCookieName(t.baseURL))?.value;
}

/** Template editor with unsaved work: /templates → the seeded template (a soft navigation) → its name edited. */
async function dirtyTemplateEditor(t: Tabs): Promise<void> {
  const L = LABELS[t.lang];
  await hydrated(t.tab1, "/templates");
  await t.tab1.locator(`a[href="/templates/${UPPER_LOWER}"]`).first().click();
  await t.tab1.waitForURL(`**/templates/${UPPER_LOWER}`);
  const name = t.tab1.getByLabel(L.templateName, { exact: true });
  await expect(name).toHaveValue(SEEDED_TEMPLATE);
  // Typed until the island answers (a keystroke before hydration does not reach React state).
  await expect(async () => {
    await name.fill("");
    await name.fill(`${SEEDED_TEMPLATE} v2`);
    await expect(t.tab1.locator(".tpl-dirty-slot")).not.toBeEmpty({ timeout: 1_000 });
  }).toPass();
}

for (const lang of ["en", "fr"] as Lang[]) {
  const L = LABELS[lang];
  /** W11's ten-second watch, once per witness in English (it is a property of the reload, not of the words). */
  const watch = lang === "en";

  test.describe(`BUG-745 D33.14 witnesses (${lang})`, () => {
    test(`W2: a page already opened, sign-out in tab 2, click it in tab 1 within 30 s -> /login, layer a`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang });
      await openLinaThenRoster(t);
      const since = await signOutInTab2(t);
      await t.tab1.locator(`a.roster-row[href="/clients/${LINA}"]`).click();
      await expectLeftToLogin(t, since, "a", { watch });
      await t.context.close();
    });

    test(`W3: Back then Forward in tab 1 after a sign-out in tab 2 -> /login, layer b`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang });
      await openLinaThenRoster(t);
      const since = await signOutInTab2(t);
      await t.tab1.bringToFront();
      // Back (to Lina's entry), then Forward queued from inside the Back's own popstate (after the
      // guard's listener): the Forward reaches a document that is already leaving, which re-issues
      // the reload. (A synchronous back(); forward() is no traversal at all in WebKit.)
      await t.tab1.evaluate(() => {
        window.addEventListener("popstate", () => history.forward(), { once: true });
        history.back();
      });
      await expectLeftToLogin(t, since, "b", { watch, reissued: true });
      await t.context.close();
    });

    test(`W4: a server action resolves after the sign-out and navigates (router.push) -> /login, layer c`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang, name: YUSUF_NAME });
      await hydrated(t.tab1, "/templates");
      const row = t.tab1.getByRole("group", { name: SEEDED_TEMPLATE, exact: true });
      const dialog = t.tab1.getByRole("dialog");
      await expect(async () => {
        await row.getByRole("button", { name: L.use }).click();
        await expect(dialog).toBeVisible({ timeout: 1_000 });
      }).toPass();
      await dialog.locator("select").selectOption({ label: YUSUF_NAME });
      // The ACTION's answer is held: the write reached the server under the old session.
      const held = await holdResponse(t.tab1, (route) => route.request().method() === "POST" && route.request().headers()["next-action"] !== undefined);
      await dialog.getByRole("button", { name: L.useConfirm }).click();
      await held.reached;
      const since = await signOutInTab2(t);
      held.release();
      // No click in tab 1 after the sign-out. The push's own RSC request is refused (307) by
      // middleware: the action's answer revalidated, so the router cache had no copy of the page.
      await expectLeftToLogin(t, since, "c", { clientPath: `/clients/${YUSUF}`, allowRefusedRsc: true, watch });
      await t.context.close();
    });

    /**
     * W4b — NOT one of the ADR's witnesses; added because W4 as written cannot fail on this code.
     * Every create action calls `revalidatePath`, so its answer carries a render and the router
     * replaces its cache (`server-action-reducer.js`: `prefetchCache = new Map()` when `rsc !==
     * null`). The `router.push` that follows must therefore REQUEST the page, after the sign-out:
     * middleware answers 307, nothing of the client can paint, and W4 stays green with (c)
     * removed or turned into a `useEffect` (M2, M8). What (c) uniquely guards is a navigation whose
     * answer was rendered under the OLD session and arrives after the boundary: this holds that
     * answer (the push's data-carrying RSC GET, sent before the sign-out) instead of the action's.
     */
    test(`W4b: the navigation's own answer, rendered under the old session, arrives after the sign-out -> zero frames, layer c`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang, name: YUSUF_NAME });
      await hydrated(t.tab1, "/templates");
      const row = t.tab1.getByRole("group", { name: SEEDED_TEMPLATE, exact: true });
      const dialog = t.tab1.getByRole("dialog");
      await expect(async () => {
        await row.getByRole("button", { name: L.use }).click();
        await expect(dialog).toBeVisible({ timeout: 1_000 });
      }).toPass();
      await dialog.locator("select").selectOption({ label: YUSUF_NAME });
      const held = await holdResponse(
        t.tab1,
        (route) =>
          route.request().method() === "GET" &&
          route.request().headers()["rsc"] === "1" &&
          // The request that carries the page's data. On a cold cache Next first sends a
          // `Next-Router-Prefetch` request for the tree only, then this one.
          route.request().headers()["next-router-prefetch"] === undefined &&
          new URL(route.request().url()).pathname === `/clients/${YUSUF}/routine`
      );
      await dialog.getByRole("button", { name: L.useConfirm }).click();
      await held.reached;
      const since = await signOutInTab2(t);
      held.release();
      await expectLeftToLogin(t, since, "c", { clientPath: `/clients/${YUSUF}`, watch });
      await t.context.close();
    });

    test(`W5: (d) on, tab 1 on the overview beside tab 2, sign-out -> tab 1 on /login within 1 s, no input, layer d`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang, wake: true });
      await hydrated(t.tab1, `/clients/${LINA}`);
      await hydrated(t.tab2, "/");
      const since = await signOutInTab2(t);
      await t.tab1.waitForURL((u) => u.pathname === "/login", { timeout: 1_000 + (Date.now() - since) });
      expect(Date.now() - since).toBeLessThan(3_000);
      expect(recordsAfter(t, since)).toEqual([]);
      expect(layerAfter(t, since)).toBe("d");
      if (watch) await expectNoLoop(t, since);
      await t.context.close();
    });

    test(`W6: (d) on, tab 1 hidden at the sign-out, then shown -> /login within 1 s of being shown, layer d`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang, wake: true });
      // Hidden as far as the page can tell (a headless page is always "visible").
      await t.tab1.addInitScript(() => {
        const w = window as unknown as { __hidden: boolean };
        w.__hidden = true;
        Object.defineProperty(document, "visibilityState", { get: () => (w.__hidden ? "hidden" : "visible"), configurable: true });
        Object.defineProperty(document, "hidden", { get: () => w.__hidden, configurable: true });
      });
      await hydrated(t.tab1, `/clients/${LINA}`);
      expect(await t.tab1.evaluate(() => document.visibilityState)).toBe("hidden");
      const since = await signOutInTab2(t);
      // Shown.
      const shownAt = Date.now();
      await t.tab1
        .evaluate(() => {
          (window as unknown as { __hidden: boolean }).__hidden = false;
          document.dispatchEvent(new Event("visibilitychange"));
        })
        .catch(() => undefined); // already reloading: the message reached the hidden tab first
      await t.tab1.waitForURL((u) => u.pathname === "/login", { timeout: 1_000 });
      expect(Date.now() - shownAt).toBeLessThan(1_500);
      expect(recordsAfter(t, since)).toEqual([]);
      expect(layerAfter(t, since)).toBe("d");
      await t.context.close();
    });

    test(`W7: a frozen tab, sign-out, unfreeze, click at once -> /login, layer a (Chromium CDP)`, async ({ browser, baseURL, browserName }) => {
      test.skip(browserName !== "chromium", "Page.setWebLifecycleState is Chromium's CDP");
      const t = await openTabs(browser, baseURL!, { lang });
      await openLinaThenRoster(t);
      const cdp = await t.context.newCDPSession(t.tab1);
      await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
      const since = await signOutInTab2(t);
      await cdp.send("Page.setWebLifecycleState", { state: "active" });
      await t.tab1.locator(`a.roster-row[href="/clients/${LINA}"]`).click();
      await expectLeftToLogin(t, since, "a", { watch });
      await t.context.close();
    });

    test(`W8: a session ended by middleware's toLogin in tab 2 (refused refresh) -> tab 1's click goes to /login, layer a`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang });
      await openLinaThenRoster(t);
      const before = await epochValue(t);
      await setSession(t, token(["USER", "COACH"], Math.floor(Date.now() / 1000) - 60), "refused");
      const since = Date.now();
      const res = await t.tab2.goto("/");
      expect(new URL(t.tab2.url()).pathname, "tab 2 was sent to /login").toBe("/login");
      expect(res?.status()).toBe(200);
      const after = await epochValue(t);
      expect(after, "toLogin rotated the epoch").toBeTruthy();
      expect(after).not.toBe(before);
      await t.tab1.bringToFront();
      await t.tab1.locator(`a.roster-row[href="/clients/${LINA}"]`).click();
      await expectLeftToLogin(t, since, "a", { watch });
      await t.context.close();
    });

    test(`W9: account switch, tab 2 signs in as another coach -> tab 1 paints nothing of Lina from its cache, layer a`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang });
      await openLinaThenRoster(t);
      const since = await signOutInTab2(t);
      await signInThroughForm(t.tab2, { email: "coach.b@evoli.fit", password: "Password123!", lang });
      await t.tab1.bringToFront();
      await t.tab1.locator(`a.roster-row[href="/clients/${LINA}"]`).click();
      // It ends on what the second coach's session renders: here the roster (the fixture shows
      // every coach the same rows), served by a document request.
      await t.tab1.waitForLoadState("load");
      await expect.poll(() => t.seen.filter((s) => s.at >= since && s.kind === "DOC").map((s) => `${s.path} ${s.status}`)).toEqual(["/ 200"]);
      await expect(t.tab1.locator(`a.roster-row[href="/clients/${LINA}"]`)).toBeVisible();
      expect(new URL(t.tab1.url()).pathname).toBe("/");
      expect(recordsAfter(t, since, true), "nothing of Lina painted by the OLD document").toEqual([]);
      // No NAVIGATION to her page. (On `next start` the new document's roster prefetches her row
      // under coach B's session, AUTO: invariant N is not on this base. That is the new session's
      // server answering, not the old document's cache.)
      expect(t.seen.filter((s) => s.at >= since && s.kind === "FULL" && s.path.startsWith(`/clients/${LINA}`))).toEqual([]);
      expect(await t.tab1.locator("h1").allTextContents()).not.toContain(LINA_NAME);
      expect(layerAfter(t, since)).toBe("a");
      if (watch) await expectNoLoop(t, since);
      await t.context.close();
    });

    test(`W10: rotation is not a boundary -> a normal navigation, no document request, no data-session-leaving`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang, wake: true });
      await hydrated(t.tab1, "/");
      const epoch = await epochValue(t);
      expect(epoch).toBeTruthy();
      // The access token has expired while tab 1 idled; the refresh cookie is good.
      await setSession(t, token(["USER", "COACH"], Math.floor(Date.now() / 1000) - 60), "rotate:COACH:coach@evoli.fit");
      const since = Date.now();
      await hydrated(t.tab2, "/");
      const access = (await t.context.cookies()).find((c) => c.name === "evoli_pro_at")?.value ?? "";
      expect(JSON.parse(Buffer.from(access.split(".")[1], "base64url").toString()).exp * 1000, "middleware rotated").toBeGreaterThan(Date.now());
      expect.soft(await epochValue(t), "the epoch is unchanged by a rotation").toBe(epoch);
      await t.tab1.bringToFront();
      await t.tab1.locator(`a.roster-row[href="/clients/${LINA}"]`).click();
      await t.tab1.waitForURL(`**/clients/${LINA}`, { timeout: 15_000 });
      await expect(t.tab1.locator("h1")).toHaveText(LINA_NAME);
      await t.tab1.waitForTimeout(1_000);
      expect(t.seen.filter((s) => s.at >= since && s.kind === "DOC"), fmt(t.seen).join(", ")).toEqual([]);
      expect(t.reports.filter((r) => r.kind === "layer")).toEqual([]);
      expect(await t.tab1.evaluate(() => document.documentElement.hasAttribute("data-session-leaving"))).toBe(false);
      await t.context.close();
    });

    test(`W12: a session from before the deploy (no epoch at load), sign-out in tab 2, click in tab 1 -> /login, layer a`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang, noEpochAtLoad: true });
      await openLinaThenRoster(t);
      expect(await t.tab1.evaluate(() => document.documentElement.getAttribute("data-session-epoch"))).toBe("");
      const since = await signOutInTab2(t);
      await t.tab1.locator(`a.roster-row[href="/clients/${LINA}"]`).click();
      await expectLeftToLogin(t, since, "a", { watch });
      await t.context.close();
    });

    test.describe("W13: no BroadcastChannel and no wake-ups (old Safari)", () => {
      test(`W13/W2 -> /login, layer a`, async ({ browser, baseURL }) => {
        const t = await openTabs(browser, baseURL!, { lang, noBroadcastChannel: true });
        await openLinaThenRoster(t);
        expect(await t.tab1.evaluate(() => typeof (window as unknown as { BroadcastChannel?: unknown }).BroadcastChannel)).toBe("undefined");
        const since = await signOutInTab2(t);
        await t.tab1.locator(`a.roster-row[href="/clients/${LINA}"]`).click();
        await expectLeftToLogin(t, since, "a", { watch: false });
        await t.context.close();
      });
      test(`W13/W3 -> /login, layer b`, async ({ browser, baseURL }) => {
        const t = await openTabs(browser, baseURL!, { lang, noBroadcastChannel: true });
        await openLinaThenRoster(t);
        const since = await signOutInTab2(t);
        await t.tab1.bringToFront();
        await t.tab1.evaluate(() => history.back());
        await expectLeftToLogin(t, since, "b", { watch: false });
        await t.context.close();
      });
      test(`W13/W8 -> /login, layer a`, async ({ browser, baseURL }) => {
        const t = await openTabs(browser, baseURL!, { lang, noBroadcastChannel: true });
        await openLinaThenRoster(t);
        await setSession(t, token(["USER", "COACH"], Math.floor(Date.now() / 1000) - 60), "refused");
        const since = Date.now();
        await t.tab2.goto("/");
        expect(new URL(t.tab2.url()).pathname).toBe("/login");
        await t.tab1.bringToFront();
        await t.tab1.locator(`a.roster-row[href="/clients/${LINA}"]`).click();
        await expectLeftToLogin(t, since, "a", { watch: false });
        await t.context.close();
      });
    });

    test(`W15: the editor exception -> a safe toggle works, Save posts nothing, a link does not navigate, the banner signs in again`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang });
      await dirtyTemplateEditor(t);
      const editorUrl = t.tab1.url();
      const since = await signOutInTab2(t);
      await t.tab1.bringToFront();
      const banner = t.tab1.locator("[data-session-ended-banner]");

      // (i) a section toggle marked data-session-safe works.
      const toggle = t.tab1.locator(".day-acc-toggle").first();
      const before = await toggle.getAttribute("aria-expanded");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", before === "true" ? "false" : "true");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(L.banner);
      expect(layerAfter(t, since, "data-session-ended")).toBe("a");

      // (ii) Save: zero server-action requests.
      const save = t.tab1.getByRole("button", { name: L.save, exact: true });
      await expect(save).toBeEnabled();
      await save.click();
      await t.tab1.waitForTimeout(1_500);
      expect(t.seen.filter((s) => s.at >= since && s.kind === "ACTION"), "Save posted nothing").toEqual([]);

      // (iii) a link: no navigation, no question, the URL unchanged.
      await t.tab1.locator('.shell-sidebar a[href="/"]').last().click();
      await t.tab1.waitForTimeout(1_000);
      expect(t.tab1.url()).toBe(editorUrl);
      expect(t.seen.filter((s) => s.at >= since && s.kind !== "ACTION"), "no request at all").toEqual([]);
      await expect(t.tab1.getByRole("button", { name: L.leave })).toHaveCount(0);
      await expect(banner).toBeVisible();
      expect(await t.tab1.evaluate(() => document.documentElement.getAttribute("data-session-ended"))).toBe("a");
      expect(await t.tab1.evaluate(() => document.documentElement.hasAttribute("data-session-leaving"))).toBe(false);
      expect(recordsAfter(t, since)).toEqual([]);

      // (iv) the banner's sign-in, accepting the browser's question about the unsaved work.
      t.tab1.removeAllListeners("dialog");
      const asked: string[] = [];
      t.tab1.on("dialog", async (d) => {
        asked.push(d.type());
        await d.accept();
      });
      await banner.getByRole("button", { name: L.bannerButton }).click();
      await t.tab1.waitForURL((u) => u.pathname === "/login", { timeout: 15_000 });
      expect(asked, "the browser asked before discarding the work").toEqual(["beforeunload"]);
      await t.context.close();
    });

    test(`W16: a staying editor, a create answered after the sign-out with late text -> URL corrected, editor and text kept, banner, layer c`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang });
      await hydrated(t.tab1, "/templates");
      await t.tab1.goto("/templates/new");
      const name = t.tab1.getByLabel(L.templateName, { exact: true });
      await expect(async () => {
        await name.fill("BUG-745 staying editor");
        await expect(t.tab1.locator(".tpl-dirty-slot")).not.toBeEmpty({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });
      for (const day of [1, 2]) {
        await openEveryDay(t.tab1);
        await t.tab1.getByRole("group", { name: L.day(day), exact: true }).getByRole("button", { name: L.addExercise }).click();
        const picker = t.tab1.getByRole("dialog");
        for (let i = 0; i < 2; i += 1) await picker.locator("button[title]").nth(i).click();
        await picker.getByRole("button").first().click();
        await expect(t.tab1.getByRole("dialog")).toHaveCount(0);
      }
      const held = await holdResponse(t.tab1, (route) => route.request().method() === "POST" && route.request().headers()["next-action"] !== undefined);
      await t.tab1.getByRole("button", { name: L.save, exact: true }).click();
      await held.reached;
      // Typed while the create is in flight: unsaved after its answer (BUG-735/739's `stillUnsaved`).
      await name.fill("BUG-745 staying editor L1");
      const since = await signOutInTab2(t);
      await t.tab1.bringToFront();
      held.release();
      await expect(t.tab1).toHaveURL(/\/templates\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      const banner = t.tab1.locator("[data-session-ended-banner]");
      await expect(banner).toBeVisible();
      await expect(banner).toContainText(L.banner);
      await expect(name).toHaveValue("BUG-745 staying editor L1");
      await t.tab1.waitForTimeout(1_000);
      /**
       * ⚠ ADR-0033 D33.14 says `data-session-ended` = `c` here. On this code it is `b`, and that is
       * the code's order, not a guard defect: the create's `leaving.release(then, "stays")`
       * (TemplateEditor.tsx, the BUG-739 block) hands the unsaved guard's sentinel back with
       * `history.back()` (useUnsavedChanges.ts `withCleanHistory`) BEFORE `then` runs the
       * `replaceState(null, …)`. That traversal's `popstate` reaches layer (b) first, with the
       * editor still dirty (late text), so `ended("b")` is the first writer; (c)'s `ended("c")` on
       * the corrected URL's commit comes second and the attribute keeps `b`. Reported, not changed.
       */
      expect(layerAfter(t, since, "data-session-ended")).toBe("b");
      expect(await t.tab1.evaluate(() => document.documentElement.hasAttribute("data-session-leaving"))).toBe(false);
      expect(t.seen.filter((s) => s.at >= since && s.kind === "DOC"), "the editor stayed: no document load").toEqual([]);
      expect(recordsAfter(t, since), "nothing of another page painted").toEqual([]);
      await t.context.close();
    });

    test(`W17: Leave in a stale tab -> /login, no beforeunload prompt, no hidden tab left behind`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang });
      await dirtyTemplateEditor(t);
      const since = await signOutInTab2(t);
      await t.tab1.bringToFront();
      await t.tab1.evaluate(() => history.back());
      const leave = t.tab1.getByRole("button", { name: L.leave });
      await expect(leave).toBeVisible();
      await leave.click();
      await t.tab1.waitForURL((u) => u.pathname === "/login", { timeout: 15_000 });
      await expect(t.tab1.getByLabel(L.email)).toBeVisible();
      await t.tab1.waitForTimeout(2_000);
      expect(t.dialogs, "no beforeunload prompt").toEqual([]);
      expect(new URL(t.tab1.url()).pathname).toBe("/login");
      expect(await t.tab1.evaluate(() => document.documentElement.hasAttribute("data-session-leaving"))).toBe(false);
      const docs = t.seen.filter((s) => s.at >= since && s.kind === "DOC");
      expect(docs.filter((s) => s.path !== "/login").length, fmt(docs).join(", ")).toBeLessThanOrEqual(1);
      expect(layerAfter(t, since, "data-session-ended")).toBe("b");
      expect(layerAfter(t, since)).toBe("c");
      await t.context.close();
    });

    test(`W11b: a 500 before the first byte (Next's error shell) loads once and stays: no reload loop`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang, wake: true });
      await t.context.addCookies([{ name: "evoli_fixture_overview", value: "fail", url: baseURL! }]);
      const since = Date.now();
      const res = await t.tab1.goto(`/clients/${LINA}`);
      expect(res?.status()).toBe(500);
      await t.tab1.waitForTimeout(5_000);
      const docs = t.seen.filter((s) => s.at >= since && s.kind === "DOC");
      expect(docs.map((s) => `${s.path} ${s.status}`), "one document load, then stable").toEqual([`/clients/${LINA} 500`]);
      expect(t.reports.filter((r) => r.kind === "layer")).toEqual([]);
      await t.context.close();
    });

    test(`W18: the revoked shape survives the placement -> one 307 to /clients/denied, then 403`, async ({ browser, baseURL }) => {
      const t = await openTabs(browser, baseURL!, { lang, wake: true });
      const first = await t.context.request.get(`/clients/${UNLINKED}`, { maxRedirects: 0 });
      expect(first.status()).toBe(307);
      expect(new URL(first.headers()["location"], baseURL).pathname).toBe("/clients/denied");
      const second = await t.context.request.get("/clients/denied", { maxRedirects: 0 });
      expect(second.status()).toBe(403);
      await t.context.close();
    });
  });
}
