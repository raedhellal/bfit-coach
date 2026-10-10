import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import {
  LINA_NAME,
  LINA_PATH,
  fmt,
  hydrated,
  launch,
  setSwitch,
  signedInContext,
  track,
  type Engine,
  type Seen,
} from "./start-build";

/**
 * EV-356d D.6 / P5 — ADR-0033 D33.13 point 8, R1-H: the client load error is never replayed
 * from the router cache.
 *
 * On an RSC request Next 14.2.35 answers a page's throw as an error row inside a 200 flight,
 * so the router caches it: a hover prefetch made while the overview read failed (D.6), a
 * failed click revisited by Back + click or Back/Forward (P5, pre-existing on main) painted
 * « This trainee could not be loaded. » with no request, after the api had recovered.
 * `src/app/error.tsx` now reloads the document once when it meets that error in any commit
 * after the document's first (`BootMark`), and shows the notice only on the document's own
 * first render (BUG-629's 500).
 *
 * Staff's QA checks Q1-Q4 and Q6 (`ev356d-d6-staff.md`), in Chromium and WebKit, on `next
 * start` (`playwright.start.config.ts`). "At every frame" is a MutationObserver installed by
 * `addInitScript` in every document of the context and reporting through `exposeBinding`, so
 * its record survives the reload: any text node (outside <script>/<style>) that carries the
 * notice, in English or French, is recorded, and so is the reload's busy marker.
 */

const NOTICE = { en: "This trainee could not be loaded.", fr: "Ce client n'a pas pu être chargé." };
const BUSY = "<busy: data-client-load-reloading>";
const row = (page: Page) => page.locator(`a.roster-row[href="${LINA_PATH}"]`);
const h1 = (page: Page) => page.getByRole("heading", { level: 1 });

/** Every paint-relevant appearance of the notice (or of the busy marker), across reloads. */
async function recordNotice(context: BrowserContext): Promise<string[]> {
  const records: string[] = [];
  await context.exposeBinding("__evoliNoticeSeen", (_source, what: string) => {
    records.push(what);
  });
  await context.addInitScript(
    ({ needles, busy }: { needles: string[]; busy: string }) => {
      const report = (what: string) =>
        (window as unknown as { __evoliNoticeSeen?: (w: string) => void }).__evoliNoticeSeen?.(what);
      const skip = (el: Element | null) => !!el && /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.nodeName);
      const scanText = (t: Node) => {
        if (skip(t.parentElement)) return;
        const text = t.textContent ?? "";
        for (const n of needles) if (text.includes(n)) report(n);
      };
      const scan = (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) return scanText(node);
        if (node.nodeType !== Node.ELEMENT_NODE || skip(node as Element)) return;
        const el = node as Element;
        if (el.matches("[data-client-load-reloading]") || el.querySelector("[data-client-load-reloading]")) report(busy);
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) scanText(t);
      };
      new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "characterData") scanText(m.target);
          else m.addedNodes.forEach(scan);
        }
      }).observe(document, { subtree: true, childList: true, characterData: true });
    },
    { needles: [NOTICE.en, NOTICE.fr], busy: BUSY }
  );
  return records;
}

const notices = (records: string[]) => records.filter((r) => r !== BUSY);
const docs = (seen: Seen[], path: string) => seen.filter((s) => s.kind === "DOC" && s.path === path);

/** Wait until every request seen so far has its status, then a quiet half second. */
async function settle(page: Page, seen: Seen[]): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect.poll(() => seen.every((s) => s.status !== undefined), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(500);
}

for (const engine of ["chromium", "webkit"] as Engine[]) {
  test.describe(`EV-356d D.6 / P5, ${engine}`, () => {
    let browser: Browser;
    test.beforeAll(async () => {
      browser = await launch(engine);
    });
    test.afterAll(async () => {
      await browser?.close();
    });

    async function open(baseURL: string) {
      const context = await signedInContext(browser, baseURL);
      const records = await recordNotice(context);
      const page = await context.newPage();
      const seen = track(context);
      return { context, records, page, seen };
    }

    test("Q1 (D.6): a failure at hover time is never painted at the click, at any frame; one document recovers", async ({
      baseURL,
    }) => {
      const { context, records, page, seen } = await open(baseURL!);
      try {
        await hydrated(page, "/");
        await setSwitch(context, baseURL!, "evoli_fixture_overview", "fail");
        const prefetched = page.waitForResponse(
          (r) => new URL(r.url()).pathname === LINA_PATH && r.request().headers()["next-router-prefetch"] !== "1",
          { timeout: 10_000 }
        );
        await row(page).hover();
        expect((await prefetched).status(), "the hover's FULL prefetch, while the read fails").toBe(200);
        await page.mouse.move(1, 1);
        await context.clearCookies({ name: "evoli_fixture_overview" });

        const n = seen.length;
        await row(page).click();
        await expect(h1(page)).toHaveText(LINA_NAME, { timeout: 15_000 });
        await settle(page, seen);
        const after = seen.slice(n);
        test.info().annotations.push({ type: `Q1 ${engine}`, description: `records ${JSON.stringify(records)}; after the click ${JSON.stringify(fmt(after))}` });
        expect(notices(records), "the notice was never in the DOM").toEqual([]);
        expect(records, "the reload's busy state was drawn").toContain(BUSY);
        expect(fmt(docs(after, LINA_PATH)), "exactly one document recovered the page").toEqual([`DOC ${LINA_PATH} 200`]);
      } finally {
        await context.close();
      }
    });

    test("Q2: the read still failing at the click: busy, one 500 document, the notice, and no second reload in 10 s", async ({
      baseURL,
    }) => {
      const { context, records, page, seen } = await open(baseURL!);
      try {
        await hydrated(page, "/");
        await setSwitch(context, baseURL!, "evoli_fixture_overview", "fail");
        const n = seen.length;
        await row(page).click();
        await expect(h1(page)).toHaveText(NOTICE.en, { timeout: 15_000 });
        await page.waitForTimeout(10_000);
        await settle(page, seen);
        const after = seen.slice(n);
        test.info().annotations.push({ type: `Q2 ${engine}`, description: `records ${JSON.stringify(records)}; after the click ${JSON.stringify(fmt(after))}` });
        expect(fmt(docs(after, LINA_PATH)), "one reload, answered 500, and no loop").toEqual([`DOC ${LINA_PATH} 500`]);
        expect(records.indexOf(BUSY), "busy first").toBe(0);
        expect(notices(records).length, "then the notice (the 500's)").toBeGreaterThan(0);
      } finally {
        await context.close();
      }
    });

    test("Q3 (BUG-629 unchanged): a document load of the failing page is one 500 with the notice, and nothing after it", async ({
      baseURL,
    }) => {
      const { context, records, page, seen } = await open(baseURL!);
      try {
        await setSwitch(context, baseURL!, "evoli_fixture_overview", "fail");
        const res = await page.goto(LINA_PATH);
        expect(res?.status()).toBe(500);
        await expect(h1(page)).toHaveText(NOTICE.en);
        await page.waitForTimeout(3_000);
        await settle(page, seen);
        test.info().annotations.push({ type: `Q3 ${engine}`, description: `records ${JSON.stringify(records)}; ${JSON.stringify(fmt(seen))}` });
        expect(fmt(seen.filter((s) => s.path === LINA_PATH && s.kind !== "AUTO")), "one document, no render after it").toEqual([
          `DOC ${LINA_PATH} 500`,
        ]);
        expect(records, "no busy state on a document's own first render").not.toContain(BUSY);
      } finally {
        await context.close();
      }
    });

    for (const variant of ["Back + click", "Back, Forward"] as const) {
      test(`Q4 (P5): after a failed open and a recovery, ${variant} shows Lina's overview through one document`, async ({
        baseURL,
      }) => {
        const { context, page, seen } = await open(baseURL!);
        try {
          await hydrated(page, "/");
          await setSwitch(context, baseURL!, "evoli_fixture_overview", "fail");
          await row(page).click();
          await expect(h1(page)).toHaveText(NOTICE.en, { timeout: 15_000 });
          await settle(page, seen);
          await context.clearCookies({ name: "evoli_fixture_overview" });
          const n = seen.length;
          await page.goBack();
          await expect(page).toHaveURL(/\/$/);
          await expect(row(page)).toBeVisible();
          if (variant === "Back + click") {
            await page.mouse.move(1, 1);
            await row(page).click();
          } else {
            await page.goForward();
          }
          await expect(page).toHaveURL(new RegExp(`${LINA_PATH}$`));
          await expect(h1(page)).toHaveText(LINA_NAME, { timeout: 15_000 });
          await settle(page, seen);
          const after = seen.slice(n);
          test.info().annotations.push({ type: `Q4 ${variant} ${engine}`, description: JSON.stringify(fmt(after)) });
          expect(
            after.filter((s) => s.path === LINA_PATH && (s.kind === "DOC" || s.kind === "FULL")).length,
            "Lina's page was fetched again, not replayed"
          ).toBe(1);
        } finally {
          await context.close();
        }
      });
    }

    test("Q6: a revoke between the hover and the click — cached inside the ruled window; a cached error reloads onto /clients/denied", async ({
      baseURL,
    }) => {
      const { context, records, page, seen } = await open(baseURL!);
      try {
        // (a) The ruled window (D.5): rest, revoke, click at once — her cached overview.
        await hydrated(page, "/");
        let prefetched = page.waitForResponse((r) => new URL(r.url()).pathname === LINA_PATH, { timeout: 10_000 });
        await row(page).hover();
        await prefetched;
        await page.mouse.move(1, 1);
        await setSwitch(context, baseURL!, "evoli_fixture_link", "ended");
        await row(page).click();
        await expect(h1(page)).toHaveText(LINA_NAME);

        // (b) A fresh document; the hover caches the failing read; the link ends; the click.
        await context.clearCookies({ name: "evoli_fixture_link" });
        await hydrated(page, "/");
        await setSwitch(context, baseURL!, "evoli_fixture_overview", "fail");
        prefetched = page.waitForResponse((r) => new URL(r.url()).pathname === LINA_PATH, { timeout: 10_000 });
        await row(page).hover();
        await prefetched;
        await page.mouse.move(1, 1);
        await context.clearCookies({ name: "evoli_fixture_overview" });
        await setSwitch(context, baseURL!, "evoli_fixture_link", "ended");
        const n = seen.length;
        await row(page).click();
        await expect(page).toHaveURL(/\/clients\/denied$/, { timeout: 15_000 });
        await settle(page, seen);
        const after = seen.slice(n);
        test.info().annotations.push({ type: `Q6 ${engine}`, description: `records ${JSON.stringify(records)}; ${JSON.stringify(fmt(after))}` });
        expect(fmt(after.filter((s) => s.kind === "DOC")), "the reload is a real 307 to the 403 page").toEqual([
          `DOC ${LINA_PATH} 307`,
          "DOC /clients/denied 403",
        ]);
        expect(notices(records)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  });
}
