import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, webkit, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { isProductionBuild } from "./production-build";

/**
 * EV-356d (F4) — a client's overview is ready by the click when the coach's pointer (or
 * keyboard focus) rests on the roster row.
 *
 * `src/components/roster/IntentLink.tsx`: the row is a `<Link prefetch={false}>`, and a
 * `router.prefetch(href)` (a FULL prefetch: the server renders the layout and the page)
 * fires once the pointer or the focus has rested on it for `INTENT_DWELL_MS`. Mouse only,
 * no touch; roster rows only. `next.config.mjs` `staleTimes.static` 300 → 30 bounds how long
 * such an entry is painted from the browser's cache: ≤ ~60 s, Raed's ruling (option A).
 *
 * ⚠ PRODUCTION BUILD ONLY. `router.prefetch` is a no-op under `next dev`, so this file runs
 * in `playwright.start.config.ts` (it builds and serves with `next start`), and every test
 * FAILS, not skips, on a dev server: a skipped witness is a green nobody earned.
 *
 * What counts as "a render of /clients/<id>": an RSC GET of that exact path WITHOUT
 * `Next-Router-Prefetch` (a FULL prefetch and a navigation send none; Link's own AUTO
 * prefetch sends it, and renders no component for this route), cross-checked against the
 * fixture's api journal (`GET /api/fixture/calls`), where one server render is one
 * `request` tag.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const LINA_PATH = `/clients/${LINA}`;
const LINA_ROW = `a.roster-row[href="${LINA_PATH}"]`;
const LINA_NAME = "Lina M.";
const ERROR_NOTICE_EN = "This trainee could not be loaded.";

/** The dwell, read from the component so the sweeps below cannot drift from it. */
const DWELL_MS = Number(
  /export const INTENT_DWELL_MS = (\d+);/.exec(
    readFileSync(resolve(__dirname, "..", "src/components/roster/IntentLink.tsx"), "utf8")
  )?.[1]
);

interface Entry {
  op: string;
  arg: string | null;
  document: boolean;
  request: string;
  start: number;
  end: number | null;
}

interface Seen {
  path: string;
  at: number;
  /** An RSC GET with no `Next-Router-Prefetch`: a FULL prefetch or a navigation. */
  full: boolean;
  /** A document request (a hard load). */
  document: boolean;
}

async function journal(page: Page): Promise<Entry[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  return ((await res.json()) as { api: Entry[] }).api;
}

/** Distinct server renders among background (non-document) journal entries. */
function renders(entries: Entry[]): string[] {
  return [...new Set(entries.filter((e) => !e.document).map((e) => e.request))];
}

async function signIn(context: BrowserContext): Promise<void> {
  const login = await context.request.post("/api/auth/login", {
    data: { email: "coach@evoli.fit", password: "Password123!" },
    maxRedirects: 0,
  });
  expect(login.status()).toBe(200);
}

async function setCookie(page: Page, name: string, value: string): Promise<void> {
  await page.context().addCookies([{ name, value, url: new URL("/", page.url()).href }]);
}

/** Every request for a `/clients/…` path, from now on. */
function track(page: Page): Seen[] {
  const seen: Seen[] = [];
  page.on("request", (req) => {
    const path = new URL(req.url()).pathname;
    if (!path.startsWith("/clients/")) return;
    const h = req.headers();
    seen.push({
      path,
      at: Date.now(),
      full: h["rsc"] === "1" && h["next-router-prefetch"] !== "1",
      document: req.isNavigationRequest(),
    });
  });
  return seen;
}

const fullRenders = (seen: Seen[]) => seen.filter((s) => s.full).map((s) => s.path);

/** The roster, hydrated, on a production build, with the pointer parked off every row. */
async function openRoster(page: Page): Promise<void> {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
  expect(
    await isProductionBuild(page),
    "EV-356d's prefetch exists only on a production build: run playwright.start.config.ts (next start)"
  ).toBe(true);
  await page.waitForLoadState("networkidle");
  await page.mouse.move(1, 1);
}

/** Resolves with the FULL render of `path` (a prefetch or a navigation, not Link's AUTO). */
function nextFullRender(page: Page, path: string) {
  return page.waitForResponse(
    (r) => {
      const h = r.request().headers();
      return new URL(r.url()).pathname === path && h["rsc"] === "1" && h["next-router-prefetch"] !== "1";
    },
    { timeout: 10_000 }
  );
}

async function expectLinaOverview(page: Page): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`${LINA_PATH}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(LINA_NAME);
}

test("the dwell sits between the sweep (20 ms per row) and the rest (100 ms) the story names", () => {
  expect(DWELL_MS).toBeGreaterThan(20);
  expect(DWELL_MS).toBeLessThan(100);
});

test.describe("EV-356d D.1 — pointer and keyboard intent", () => {
  test.use({ viewport: { width: 1280, height: 1600 } });

  test("resting on a row renders that client once; a re-hover inside 30 s renders nothing; the click asks the server nothing", async ({
    page,
  }) => {
    await signIn(page.context());
    await openRoster(page);
    const seen = track(page);
    const j0 = (await journal(page)).length;

    const prefetched = nextFullRender(page, LINA_PATH);
    await page.locator(LINA_ROW).hover();
    expect((await prefetched).status(), "the hover's FULL prefetch").toBe(200);
    await page.waitForTimeout(300);
    await page.mouse.move(1, 1);
    await page.waitForLoadState("networkidle");
    expect(fullRenders(seen), "one render, of Lina's overview").toEqual([LINA_PATH]);
    expect(renders((await journal(page)).slice(j0)), "one server render in the api journal").toHaveLength(1);

    // D.1: resting on Lina again within 30 s makes none.
    await page.locator(LINA_ROW).hover();
    await page.waitForTimeout(400);
    await page.mouse.move(1, 1);
    await page.waitForLoadState("networkidle");
    expect(fullRenders(seen), "the re-hover inside 30 s rendered nothing").toEqual([LINA_PATH]);

    const n = seen.length;
    await page.locator(LINA_ROW).click();
    await expectLinaOverview(page);
    await page.waitForLoadState("networkidle");
    const atClick = seen.slice(n).filter((s) => s.path === LINA_PATH && (s.full || s.document));
    expect(atClick, "the click painted from the prefetch: no render request, no document request").toEqual([]);
  });

  test("a pointer sweep across 10 rows at 20 ms per row renders nothing; a rest after it renders one", async ({
    page,
  }) => {
    await signIn(page.context());
    await page.goto("/login");
    await setCookie(page, "evoli_fixture_roster_extra", "6");
    await openRoster(page);
    const rows = page.locator("a.roster-row");
    expect(await rows.count(), "twelve rows: the six seeded and six extra").toBeGreaterThanOrEqual(10);
    const seen = track(page);
    const j0 = (await journal(page)).length;

    // When the pointer entered each row, measured in the page: the harness must really
    // sweep faster than the dwell, or a render below would be the harness's, not the app's.
    await page.evaluate(() => {
      const w = window as unknown as { __over: { t: number; href: string | null }[] };
      w.__over = [];
      document.addEventListener(
        "pointerover",
        (e) => {
          const row = (e.target as Element).closest("a.roster-row");
          const href = row?.getAttribute("href") ?? null;
          const last = w.__over[w.__over.length - 1];
          if (!last || last.href !== href) w.__over.push({ t: performance.now(), href });
        },
        { capture: true }
      );
    });
    const centres: { x: number; y: number }[] = [];
    for (let i = 0; i < 10; i += 1) {
      const box = (await rows.nth(i).boundingBox())!;
      centres.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    for (const c of centres) {
      await page.mouse.move(c.x, c.y);
      await page.waitForTimeout(20);
    }
    await page.mouse.move(1, 1);
    const over = await page.evaluate(
      () => (window as unknown as { __over: { t: number; href: string | null }[] }).__over
    );
    const visited = over.filter((o) => o.href !== null);
    expect(new Set(visited.map((o) => o.href)).size, "the sweep crossed ten distinct rows").toBe(10);
    const dwells = over.slice(0, -1).map((o, i) => (o.href ? over[i + 1].t - o.t : 0));
    expect(Math.max(...dwells), `harness: per-row dwell must stay under ${DWELL_MS} ms`).toBeLessThan(DWELL_MS);

    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle");
    expect(fullRenders(seen), "the sweep rendered nothing").toEqual([]);
    expect(renders((await journal(page)).slice(j0)), "and read nothing").toEqual([]);

    // The control: the same rows, a real rest. Without it, "nothing" could be a dead handler.
    const prefetched = nextFullRender(page, LINA_PATH);
    await page.locator(LINA_ROW).hover();
    await prefetched;
    await page.waitForTimeout(200);
    await page.mouse.move(1, 1);
    expect(fullRenders(seen)).toEqual([LINA_PATH]);
  });

  test("keyboard: tabbing across 10 rows at 20 ms each renders nothing; focus resting on a row renders one", async ({
    page,
  }) => {
    await signIn(page.context());
    await page.goto("/login");
    await setCookie(page, "evoli_fixture_roster_extra", "6");
    await openRoster(page);
    const rows = page.locator("a.roster-row");
    const hrefs = await rows.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
    expect(hrefs.length).toBeGreaterThanOrEqual(11);
    const seen = track(page);
    const j0 = (await journal(page)).length;

    await page.evaluate(() => {
      const w = window as unknown as { __focus: { t: number; href: string | null }[] };
      w.__focus = [];
      document.addEventListener(
        "focusin",
        (e) => w.__focus.push({ t: performance.now(), href: (e.target as Element).getAttribute("href") }),
        { capture: true }
      );
    });
    await rows.nth(0).focus();
    for (let i = 1; i < 10; i += 1) {
      await page.waitForTimeout(20);
      await page.keyboard.press("Tab");
    }
    await page.waitForTimeout(20);
    const blurredAt = await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
      return performance.now();
    });
    const focus = await page.evaluate(
      () => (window as unknown as { __focus: { t: number; href: string | null }[] }).__focus
    );
    expect(
      focus.map((f) => f.href),
      "Tab walked the first ten rows in order"
    ).toEqual(hrefs.slice(0, 10));
    const dwells = focus.map((f, i) => (i + 1 < focus.length ? focus[i + 1].t : blurredAt) - f.t);
    expect(Math.max(...dwells), `harness: per-row focus must stay under ${DWELL_MS} ms`).toBeLessThan(DWELL_MS);

    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle");
    expect(fullRenders(seen), "the Tab sweep rendered nothing").toEqual([]);
    expect(renders((await journal(page)).slice(j0)), "and read nothing").toEqual([]);

    // Focus resting on Lina's row, reached by the keyboard from its neighbour.
    const i = hrefs.indexOf(LINA_PATH);
    expect(i, "Lina's row is on the roster").toBeGreaterThanOrEqual(0);
    const prefetched = nextFullRender(page, LINA_PATH);
    if (i > 0) {
      await rows.nth(i - 1).focus();
      await page.keyboard.press("Tab");
    } else {
      await rows.nth(1).focus();
      await page.keyboard.press("Shift+Tab");
    }
    await expect(page.locator(LINA_ROW)).toBeFocused();
    await prefetched;
    await page.waitForTimeout(300);
    expect(fullRenders(seen), "one render, Lina's (the neighbour's focus did not rest)").toEqual([LINA_PATH]);
  });
});

/**
 * D.2 — with latency 40, rest ≥ 500 ms then click: the median click-to-paint is at most
 * half the median of the same click without a hover. Both arms on THIS build, interleaved;
 * the no-hover arm is the parent's path (its AUTO prefetch rendered nothing for this
 * route, so its click always made the full render). Times are the page's own clock, from
 * the click event to the frame after Lina's h1 is in the DOM.
 */
test("D.2: after a 500 ms rest the click paints in at most half the no-hover time (latency 40, 5 runs each)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await signIn(page.context());
  await page.goto("/login");
  await setCookie(page, "evoli_fixture_api_latency", "40");

  async function clickToPaint(rest: boolean): Promise<number> {
    await openRoster(page);
    const row = page.locator(LINA_ROW);
    if (rest) {
      await row.hover();
      await page.waitForTimeout(500);
    }
    await page.evaluate((name) => {
      const w = window as unknown as { __t0: number; __t1: number };
      w.__t0 = 0;
      w.__t1 = 0;
      addEventListener("click", () => (w.__t0 = performance.now()), { capture: true, once: true });
      const mo = new MutationObserver(() => {
        if (!w.__t0) return;
        if ([...document.querySelectorAll("h1")].some((h) => h.textContent?.trim() === name)) {
          mo.disconnect();
          requestAnimationFrame(() => (w.__t1 = performance.now()));
        }
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    }, LINA_NAME);
    await row.click();
    await expectLinaOverview(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __t1: number }).__t1)).toBeGreaterThan(0);
    return page.evaluate(() => {
      const w = window as unknown as { __t0: number; __t1: number };
      return Math.round(w.__t1 - w.__t0);
    });
  }

  const cold: number[] = [];
  const warm: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    cold.push(await clickToPaint(false));
    warm.push(await clickToPaint(true));
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const record = `no hover ${JSON.stringify(cold)} median ${median(cold)} ms; hover ${JSON.stringify(warm)} median ${median(warm)} ms`;
  test.info().annotations.push({ type: "D.2 click-to-paint", description: record });
  process.stdout.write(`D.2 click-to-paint: ${record}\n`);
  expect(median(warm)).toBeLessThanOrEqual(median(cold) / 2);
});

/**
 * D.4 — the client tab bar and the side menu stay plain `<Link>`s: hovering them renders no
 * page (no api read), right after the load and again after 30 s, when `static: 30` has
 * expired their AUTO entries (staff §1b.3: a hover then fetches the route tree again, which
 * must still read nothing).
 */
test("D.4: hovering the client tabs and the side-menu links reads nothing, before and after 30 s", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page.context());
  await openRoster(page);
  await page.goto(LINA_PATH);
  await expectLinaOverview(page);
  await page.waitForLoadState("networkidle");
  const loadedAt = Date.now();
  // Let the page's own viewport prefetches settle before counting.
  let quiet = -1;
  await expect
    .poll(async () => {
      const n = (await journal(page)).length;
      const same = n === quiet;
      quiet = n;
      return same;
    }, { intervals: [500], timeout: 15_000 })
    .toBe(true);

  // The AC's tabs: Programme and Nutrition (the overview tab is the page itself).
  const tabs = page.locator(`a[href="${LINA_PATH}/routine"], a[href="${LINA_PATH}/nutrition"]`);
  const sideLinks = page.locator(`a[href]:not([href^="/clients/"])`).filter({ visible: true });
  async function hoverAll(label: string) {
    const j0 = (await journal(page)).length;
    const targets: Locator[] = [];
    for (const l of await tabs.all()) targets.push(l);
    for (const l of await sideLinks.all()) targets.push(l);
    expect(targets.length, "tabs and side-menu links found").toBeGreaterThan(3);
    for (const t of targets) {
      await t.hover();
      await page.waitForTimeout(150);
    }
    await page.mouse.move(1, 1);
    await page.waitForTimeout(500);
    await page.waitForLoadState("networkidle");
    const after = (await journal(page)).slice(j0);
    expect(
      after.map((e) => `${e.op}(${e.arg})`),
      `${label}: hovering ${targets.length} links read nothing`
    ).toEqual([]);
  }
  await hoverAll("right after the load");
  await page.waitForTimeout(Math.max(0, loadedAt + 31_000 - Date.now()));
  await hoverAll("31 s after the load");
});

/**
 * D.5 — staff's probe P2, the witness of the ruled window. A FULL entry is fresh for
 * `static` (30 s) from the prefetch, then reusable for `dynamic` (30 s) from its first use:
 *
 *   t0       rest on Lina's row (the prefetch)
 *   t0+1 s   the trainee ends the link (`evoli_fixture_link=ended`)
 *   t0+20 s  click: painted from the cache (no request), her data, after the revoke
 *   t0+45 s  Back, click again: still the cache (first use at +20 s, +30 s = +50 s)
 *   t0+65 s  Back, click: expired, the server renders, /clients/denied
 *
 * With `static: 300` the +65 s click would still paint her data (a FULL entry is reusable
 * until the prefetch + 300 s). No paint of her data after t0 + 65 s.
 */
async function revokeTimeline(page: Page, label: string): Promise<string[]> {
  const timeline: string[] = [];
  await openRoster(page);
  const seen = track(page);
  const t0 = Date.now();
  const mark = (what: string) => timeline.push(`+${((Date.now() - t0) / 1000).toFixed(1)} s ${what}`);
  const at = async (s: number) => page.waitForTimeout(Math.max(0, t0 + s * 1000 - Date.now()));

  const prefetched = nextFullRender(page, LINA_PATH);
  await page.locator(LINA_ROW).hover();
  expect((await prefetched).status()).toBe(200);
  mark("hover: FULL prefetch answered 200");
  await page.mouse.move(1, 1);

  await at(1);
  await setCookie(page, "evoli_fixture_link", "ended");
  const direct = await page.request.get(LINA_PATH, { maxRedirects: 0 });
  expect(direct.headers()["location"] ?? "", "the server now refuses her page").toMatch(/\/clients\/denied$/);
  mark(`link ended; a server read of her page now answers ${direct.status()} → /clients/denied`);

  for (const s of [20, 45]) {
    await at(s);
    const n = seen.length;
    await page.locator(LINA_ROW).click();
    await expectLinaOverview(page);
    await page.waitForLoadState("networkidle");
    const asked = seen.slice(n).filter((r) => r.path === LINA_PATH && (r.full || r.document));
    expect(asked, `${label} +${s} s: painted from the cache, no request`).toEqual([]);
    mark(`click: her overview painted from the cache (no request) [${label}]`);
    await page.goBack();
    await expect(page.locator(LINA_ROW)).toBeVisible();
    await page.mouse.move(1, 1);
  }

  await at(65);
  await page.evaluate((name) => {
    const w = window as unknown as { __linaPainted: boolean };
    w.__linaPainted = false;
    new MutationObserver(() => {
      if ([...document.querySelectorAll("h1")].some((h) => h.textContent?.trim() === name)) w.__linaPainted = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }, LINA_NAME);
  const n = seen.length;
  await page.locator(LINA_ROW).click();
  await page.waitForURL("**/clients/denied");
  expect(seen.slice(n).some((r) => r.path === LINA_PATH && (r.full || r.document)), "the click asked the server").toBe(
    true
  );
  expect(
    await page.evaluate(() => (window as unknown as { __linaPainted?: boolean }).__linaPainted ?? false),
    "her overview never painted after +65 s"
  ).toBe(false);
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText(LINA_NAME);
  mark(`click: /clients/denied [${label}]`);
  return timeline;
}

test.describe("EV-356d D.5 — the revoked-client cache window (P2)", () => {
  test("Chromium: cached at +20 s and +45 s after the revoke, /clients/denied at +65 s", async ({ page }) => {
    test.setTimeout(150_000);
    await signIn(page.context());
    const timeline = await revokeTimeline(page, "chromium");
    test.info().annotations.push({ type: "D.5 timeline (chromium)", description: timeline.join("; ") });
    process.stdout.write(`D.5 chromium: ${timeline.join("; ")}\n`);
  });

  test("control, no hover: a click after the revoke goes to /clients/denied at once", async ({ page }) => {
    await signIn(page.context());
    await openRoster(page);
    await setCookie(page, "evoli_fixture_link", "ended");
    await page.locator(LINA_ROW).click();
    await page.waitForURL("**/clients/denied");
  });

  test.describe("WebKit, French", () => {
    let browser: Browser;
    test.beforeAll(async () => {
      expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
      browser = await webkit.launch();
    });
    test.afterAll(async () => {
      await browser?.close();
    });

    test("WebKit: cached at +20 s and +45 s after the revoke, /clients/denied at +65 s", async ({ baseURL }) => {
      test.setTimeout(150_000);
      const context = await browser.newContext({ baseURL, locale: "fr-FR", viewport: { width: 1280, height: 900 } });
      await context.addCookies([{ name: "evoli_pro_locale", value: "fr", url: baseURL! }]);
      try {
        await signIn(context);
        const timeline = await revokeTimeline(await context.newPage(), "webkit fr");
        test.info().annotations.push({ type: "D.5 timeline (webkit)", description: timeline.join("; ") });
        process.stdout.write(`D.5 webkit: ${timeline.join("; ")}\n`);
      } finally {
        await context.close();
      }
    });

    /**
     * D.3 — touch. A finger that lands on a row (a tap, or the start of a scroll) renders
     * nothing ahead of the tap's own navigation. The resting finger is a synthetic
     * `pointerover` + `pointerdown` with `pointerType: "touch"` held 500 ms (the pointer
     * events a scroll that starts on a row produces before its `pointercancel`); its
     * control is the same event with `pointerType: "mouse"`, which must render once, so the
     * "nothing" cannot be a handler that never ran. Then a real tap: exactly one render of
     * Lina's page, the navigation's.
     */
    test("D.3 (WebKit, hasTouch): a resting finger and a tap render nothing before the tap's navigation", async ({
      baseURL,
    }) => {
      const context = await browser.newContext({ baseURL, locale: "en-US", hasTouch: true, viewport: { width: 1024, height: 900 } });
      try {
        await signIn(context);
        const page = await context.newPage();
        await openRoster(page);
        const seen = track(page);
        const rows = page.locator("a.roster-row");
        const other = (await rows.evaluateAll((els) => els.map((el) => el.getAttribute("href")))).find(
          (h) => h !== LINA_PATH
        )!;

        const finger = (sel: string, pointerType: string, types: string[]) =>
          page.locator(sel).evaluate(
            (el, { pointerType, types }) => {
              for (const type of types) {
                el.dispatchEvent(
                  new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, pointerType, isPrimary: true })
                );
              }
            },
            { pointerType, types }
          );

        await finger(LINA_ROW, "touch", ["pointerover", "pointerenter", "pointerdown"]);
        await page.waitForTimeout(500);
        await finger(LINA_ROW, "touch", ["pointercancel", "pointerout", "pointerleave"]);
        await page.waitForLoadState("networkidle");
        expect(fullRenders(seen), "a resting finger rendered nothing").toEqual([]);

        const control = nextFullRender(page, other);
        await finger(`a.roster-row[href="${other}"]`, "mouse", ["pointerover", "pointerenter"]);
        await control;
        await finger(`a.roster-row[href="${other}"]`, "mouse", ["pointerout", "pointerleave"]);
        expect(fullRenders(seen), "control: the same event from a mouse renders once").toEqual([other]);

        const n = seen.length;
        await page.locator(LINA_ROW).tap();
        await expectLinaOverview(page);
        await page.waitForLoadState("networkidle");
        expect(
          seen.slice(n).filter((s) => s.path === LINA_PATH && (s.full || s.document)),
          "the tap made exactly one render of Lina's page: its navigation"
        ).toHaveLength(1);
      } finally {
        await context.close();
      }
    });
  });
});

/**
 * D.6 — staff's probe P3. The overview read fails while the row is hovered
 * (`evoli_fixture_overview=fail`, a 500 from the fixture), and works again by the click.
 * The click must show Lina's overview, never the error notice: a non-OK prefetch is turned
 * into a hard load at the click (`fetch-server-response.js`), which renders afresh. If the
 * cached error painted, EV-356d does not merge with that path (the story's STOP).
 */
test("D.6 (P3): a failure at hover time is not replayed at the click", async ({ page }) => {
  await signIn(page.context());
  await openRoster(page);
  const seen = track(page);
  await setCookie(page, "evoli_fixture_overview", "fail");

  const prefetched = nextFullRender(page, LINA_PATH);
  await page.locator(LINA_ROW).hover();
  // The hover made its FULL prefetch while the read was failing (on the parent branch it
  // made none, and this wait is what turns the test red there).
  const status = (await prefetched).status();
  test.info().annotations.push({ type: "D.6 hover-time prefetch status", description: String(status) });
  process.stdout.write(`D.6: the hover-time prefetch answered ${status}\n`);
  await page.waitForTimeout(200);
  await page.mouse.move(1, 1);

  await page.context().clearCookies({ name: "evoli_fixture_overview" });
  const n = seen.length;
  await page.locator(LINA_ROW).click();
  await expectLinaOverview(page);
  await expect(page.getByText(ERROR_NOTICE_EN)).toHaveCount(0);
  const how = seen.slice(n).filter((s) => s.path === LINA_PATH);
  process.stdout.write(`D.6: at the click: ${JSON.stringify(how.map((s) => ({ full: s.full, document: s.document })))}\n`);
  expect(how.some((s) => s.document || s.full), "the click rendered afresh").toBe(true);
});
