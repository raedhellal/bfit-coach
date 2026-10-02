import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * perf/coach-fast-routes-no-skeleton — the navigation progress bar
 * (`src/components/shell/NavigationProgress.tsx`).
 *
 * The client tabs and the challenge page lost their `loading.tsx`, so a page change keeps
 * the old page on screen until the new one is ready. The bar is the only feedback when
 * that is slow, and it must not flash when it is fast:
 *
 *   · held response (every fixture read held 1.2 s): the bar appears no sooner than
 *     400 ms after the click and before the content, `#app-root` is `aria-busy` while it
 *     shows, and both are gone with the content;
 *   · fast responses (no hold; a revisit inside 30 s): the bar never appears;
 *   · a click the unsaved-changes guard intercepts is not a navigation: no bar;
 *   · `prefers-reduced-motion`: the bar stands still; it is `position: fixed`, 3 px,
 *     so it shifts no layout.
 *
 * "Never appeared" is recorded by a MutationObserver from before the click, not sampled.
 *
 * Staff's review (B1, S2) added the navigations started from code (« Leave without
 * saving », « Use this template ») and every skip/stop branch; each of ten mutants of
 * the component and its call sites turns at least one test here red. Runs in the ROSTER
 * config (`playwright.roster.config.ts`): « Use this template » needs trainees, which
 * only the populated scenario serves.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const BAR = '[data-nav-progress="visible"]';
/**
 * The element itself. Every NEGATIVE check reads its real visibility (staff review r2):
 * the bar is toggled by `hidden` and an attribute on one always-rendered element, so a
 * check on the attribute alone let "hidden never set" and "visible until hydration" pass.
 */
const NODE = ".nav-progress";

/** Idle: the bar is not visible and #app-root is not busy. */
async function expectIdle(page: Page) {
  await expect(page.locator(NODE)).toBeHidden();
  await expect(page.locator("#app-root")).not.toHaveAttribute("aria-busy", /.*/);
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@evoli.fit");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
  await expectIdle(page);
}

/** Click a link and report when the bar appeared/left and when `selector` showed up (ms after the click). */
async function timedClick(page: Page, href: string, selector: string) {
  return page.evaluate(
    async ({ href, selector, node }) => {
      const seen: { barAt: number | null; barGoneAt: number | null; busyAt: number | null; contentAt: number | null } = {
        barAt: null,
        barGoneAt: null,
        busyAt: null,
        contentAt: null,
      };
      const t0 = performance.now();
      const target = new URL(href, location.href).pathname;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no ${selector} on ${target}`)), 15_000);
        const observer = new MutationObserver(() => {
          const now = performance.now() - t0;
          const el = document.querySelector<HTMLElement>(node);
          const shown = el !== null && el.checkVisibility();
          if (shown && seen.barAt === null) seen.barAt = now;
          if (!shown && seen.barAt !== null && seen.barGoneAt === null) seen.barGoneAt = now;
          if (document.getElementById("app-root")?.getAttribute("aria-busy") === "true" && seen.busyAt === null) seen.busyAt = now;
          if (seen.contentAt === null && location.pathname === target && document.querySelector(selector)) seen.contentAt = now;
          if (seen.contentAt !== null && !shown) {
            observer.disconnect();
            clearTimeout(timer);
            resolve();
          }
        });
        observer.observe(document, { subtree: true, childList: true, attributes: true });
        document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)!.click();
      });
      return seen;
    },
    { href, selector, node: NODE }
  );
}

test("a held response: the bar appears after 400 ms, says what it is, and leaves with the content", async ({
  page,
  baseURL,
}) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}`);
  await expect(page.locator("section[aria-label]").first()).toBeVisible();
  await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "1200", url: baseURL! }]);

  const clicked = page.evaluate(() => performance.now());
  const seen = timedClick(page, `/clients/${LINA}/nutrition`, 'input[inputmode="numeric"]');
  await clicked;
  // While it shows: an indeterminate progressbar with a name, and the content region busy.
  const bar = page.getByRole("progressbar", { name: "Loading the page" });
  await expect(bar).toBeVisible();
  await expect(page.locator("#app-root")).toHaveAttribute("aria-busy", "true");
  await expect(bar).not.toHaveAttribute("aria-valuenow", /.*/);

  const t = await seen;
  expect(t.barAt, "the bar appeared").not.toBeNull();
  expect(t.barAt!, "not before the 400 ms threshold").toBeGreaterThanOrEqual(390);
  expect(t.barAt!, "well before the held content").toBeLessThan(t.contentAt!);
  expect(t.busyAt!).toBeLessThan(t.contentAt!);
  expect(t.contentAt!, "the content really was held").toBeGreaterThan(1_000);
  await expectIdle(page);
  await expect(page.locator("#app-root")).not.toHaveAttribute("aria-busy", /.*/);
});

test("fast page changes never show the bar: a first visit and a revisit", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}`);
  await expect(page.locator("section[aria-label]").first()).toBeVisible();

  const first = await timedClick(page, `/clients/${LINA}/nutrition`, 'input[inputmode="numeric"]');
  expect(first.barAt, `a ${Math.round(first.contentAt!)} ms first visit showed no bar`).toBeNull();
  const revisit = await timedClick(page, `/clients/${LINA}`, "section[aria-label]");
  expect(revisit.barAt, "a router-cache revisit showed no bar").toBeNull();
});

test("a click the unsaved-changes guard stops is not a navigation: no bar", async ({ page, baseURL }) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}/routine`);
  await page.getByLabel("Sets").first().fill("7");
  // Hold every read, so a bar that wrongly started would have time to show.
  await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "1200", url: baseURL! }]);
  const watch = everShown(page, 1_200);
  await page.locator(`a[href="/clients/${LINA}/nutrition"]`).click();
  await expect(page.getByText("Leave with unsaved changes?")).toBeVisible();
  expect(await watch, "never visible while the guard holds the click").toBe(false);
  await expectIdle(page);
  await page.getByRole("button", { name: "Stay on this page" }).click();
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the bar stands still, and it is fixed and 3 px tall, so nothing shifts", async ({ page, baseURL }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    const heading = page.locator("h1").first();
    await expect(heading).toBeVisible();
    const before = await heading.boundingBox();
    await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "1500", url: baseURL! }]);
    await page.locator(`a[href="/clients/${LINA}/nutrition"]`).click();
    const bar = page.locator(BAR);
    await expect(bar).toBeVisible();
    const style = await bar.evaluate((el) => {
      const own = getComputedStyle(el);
      const fill = getComputedStyle(el.firstElementChild!);
      return { position: own.position, height: own.height, animation: fill.animationName };
    });
    expect(style).toEqual({ position: "fixed", height: "3px", animation: "none" });
    // The old page is still on screen under the bar, exactly where it was.
    expect(await heading.boundingBox()).toEqual(before);
  });
});

/**
 * Inside branch 1's shell: a sidebar at >= 1024 px, a top bar and a bottom tab bar
 * below. The bar is `pointer-events: none`, so a hit test cannot see it; instead it must
 * span the top edge and out-stack every fixed or sticky element of the shell there.
 */
for (const width of [1440, 390]) {
  test(`at ${width} px the bar spans the top edge above the shell`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    await page.goto(`/clients/${LINA}`);
    await expect(page.locator("section[aria-label]").first()).toBeVisible();
    await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "1500", url: baseURL! }]);
    await page.locator(`a[href="/clients/${LINA}/nutrition"]`).first().click();
    const bar = page.locator(BAR);
    await expect(bar).toBeVisible();
    expect(await bar.boundingBox()).toEqual({ x: 0, y: 0, width, height: 3 });
    const stacking = await bar.evaluate((el) => {
      const own = Number(getComputedStyle(el).zIndex);
      const others = [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((n) => !el.contains(n))
        .filter((n) => ["fixed", "sticky"].includes(getComputedStyle(n).position))
        .filter((n) => n.getBoundingClientRect().top <= 1 && n.getBoundingClientRect().bottom > 1)
        .map((n) => Number(getComputedStyle(n).zIndex) || 0);
      return { own, highestBelow: Math.max(0, ...others) };
    });
    expect(stacking.own).toBeGreaterThan(stacking.highestBelow);
    await page.screenshot({ path: info.outputPath(`nav-progress-${width}.png`) });
  });
}

/* ── Navigations started from code (staff review B1) ─────────────────────────────────
 * The click listener cannot see a `router.push` that follows a dialog. Each such call
 * site calls `startNavigationProgress` first; these two are the measured cases (2.4 s
 * and 4.8 s with no feedback before the fix). */

const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";

/** Click the button with this exact text and time the bar and the destination's content. */
async function timedButton(page: Page, text: string, target: string, selector: string) {
  return page.evaluate(
    async ({ text, target, selector, node }) => {
      const seen = { barAt: null as number | null, barPath: null as string | null, contentAt: null as number | null };
      const t0 = performance.now();
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no ${selector} on ${target}`)), 20_000);
        const observer = new MutationObserver(() => {
          const now = performance.now() - t0;
          const el = document.querySelector<HTMLElement>(node);
          const shown = el !== null && el.checkVisibility();
          if (shown && seen.barAt === null) {
            seen.barAt = now;
            seen.barPath = location.pathname;
          }
          if (seen.contentAt === null && location.pathname === target && document.querySelector(selector)) seen.contentAt = now;
          if (seen.contentAt !== null && !shown) {
            observer.disconnect();
            clearTimeout(timer);
            resolve();
          }
        });
        observer.observe(document, { subtree: true, childList: true, attributes: true });
        const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
        if (!button) throw new Error(`no button "${text}"`);
        button.click();
      });
      return seen;
    },
    { text, target, selector, node: NODE }
  );
}

test("« Leave without saving » to a slow tab: the bar after 400 ms, gone when the page arrives", async ({
  page,
  baseURL,
}) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}/routine`);
  await page.getByLabel("Sets").first().fill("7");
  await page.locator(`a[href="/clients/${LINA}/nutrition"]`).first().click();
  await expect(page.getByText("Leave with unsaved changes?")).toBeVisible();
  await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "1200", url: baseURL! }]);
  const t = await timedButton(page, "Leave without saving", `/clients/${LINA}/nutrition`, 'input[inputmode="numeric"]');
  expect(t.barAt, "the bar appeared").not.toBeNull();
  expect(t.barAt!, "not before the threshold").toBeGreaterThanOrEqual(390);
  expect(t.barPath, "while the routine was still on screen").toBe(`/clients/${LINA}/routine`);
  expect(t.barAt!).toBeLessThan(t.contentAt!);
  await expectIdle(page);
});

test("« Use this template » closes its dialog and the bar covers the wait for the trainee's routine", async ({
  page,
  baseURL,
}) => {
  await signIn(page);
  await page.goto("/templates");
  await page.getByRole("button", { name: "Use on a trainee" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("select").selectOption({ label: "Yusuf A." });
  await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "1200", url: baseURL! }]);
  const t = await timedButton(page, "Use this template", `/clients/${YUSUF}/routine`, "#plan-name");
  expect(t.barAt, "the bar appeared").not.toBeNull();
  // The library is still on screen (the dialog is closed) while the routine is read.
  expect(t.barPath).toBe("/templates");
  expect(t.barAt!).toBeLessThan(t.contentAt!);
  await expectIdle(page);
});

/* ── What is NOT a navigation, and how a pending one ends (staff review S2) ─────────── */

/** Whether the bar showed at any moment in the next `ms`. */
async function everShown(page: Page, ms: number) {
  return page.evaluate(
    async ({ node, ms }) => {
      const visible = () => document.querySelector<HTMLElement>(node)?.checkVisibility() ?? false;
      let seen = visible();
      // `attributes`: the bar is shown by attribute changes, not by inserting a node.
      const o = new MutationObserver(() => {
        if (visible()) seen = true;
      });
      o.observe(document, { subtree: true, childList: true, attributes: true });
      await new Promise((r) => setTimeout(r, ms));
      o.disconnect();
      return seen || visible();
    },
    { node: NODE, ms }
  );
}

test("a click on the tab you are already on never shows the bar", async ({ page, baseURL }) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}/nutrition`);
  await expect(page.locator('input[inputmode="numeric"]').first()).toBeVisible();
  await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "1200", url: baseURL! }]);
  const watch = everShown(page, 1_500);
  await page.locator(`a[href="/clients/${LINA}/nutrition"]`).first().click();
  expect(await watch).toBe(false);
});

test("a Cmd-click (a new tab) never shows the bar", async ({ page, baseURL, context }) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}`);
  await expect(page.locator("section[aria-label]").first()).toBeVisible();
  await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "1200", url: baseURL! }]);
  const watch = everShown(page, 1_500);
  const opened = context.waitForEvent("page", { timeout: 1_500 }).catch(() => null);
  await page.locator(`a[href="/clients/${LINA}/nutrition"]`).first().click({ modifiers: ["Meta"] });
  expect(await watch).toBe(false);
  await (await opened)?.close();
});

/** A same-origin link, appended to the page, whose click is cancelled (nothing navigates). */
async function cancelledLink(page: Page, attrs: Record<string, string>) {
  await page.evaluate(
    ({ href, attrs }) => {
      const a = document.createElement("a");
      a.href = href;
      a.id = "probe-link";
      a.textContent = "probe";
      for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
      a.addEventListener("click", (e) => e.preventDefault());
      document.body.appendChild(a);
    },
    { href: `/clients/${LINA}/nutrition`, attrs }
  );
}

test("a link to another tab (target=_blank) never shows the bar", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}`);
  await expect(page.locator("section[aria-label]").first()).toBeVisible();
  await cancelledLink(page, { target: "_blank" });
  const watch = everShown(page, 1_000);
  await page.locator("#probe-link").click();
  expect(await watch).toBe(false);
});

test("a navigation that never commits gives up after 20 s", async ({ page }) => {
  await page.clock.install();
  await signIn(page);
  await page.goto(`/clients/${LINA}`);
  await expect(page.locator("section[aria-label]").first()).toBeVisible();
  await cancelledLink(page, {});
  await page.locator("#probe-link").click();
  await page.clock.fastForward(1_000);
  await expect(page.locator(BAR), "a pending click shows the bar").toBeVisible();
  await page.clock.fastForward(15_000);
  await expect(page.locator(BAR), "still waiting at 16 s").toBeVisible();
  await page.clock.fastForward(5_000);
  await expect(page.locator(NODE), "gone after the 20 s give-up").toBeHidden();
});

test("Back while a slow click is pending clears the bar", async ({ page, baseURL }) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}`);
  await expect(page.locator("section[aria-label]").first()).toBeVisible();
  await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "4000", url: baseURL! }]);
  await page.locator(`a[href="/clients/${LINA}/nutrition"]`).first().click();
  await expect(page.locator(BAR)).toBeVisible();
  await page.goBack();
  await page.waitForTimeout(600);
  await expectIdle(page);
});

test("Back to an entry with the same URL abandons a slow navigation, and the bar goes with it", async ({
  page,
  baseURL,
}) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}`);
  await expect(page.locator("section[aria-label]").first()).toBeVisible();
  // A second entry for the same URL: the shape of the unsaved-changes guard's sentinel.
  await page.evaluate(() => window.history.pushState(window.history.state, "", location.href));
  await page.context().addCookies([{ name: "evoli_fixture_api_latency", value: "3000", url: baseURL! }]);
  await page.locator(`a[href="/clients/${LINA}/nutrition"]`).first().click();
  await expect(page.locator(BAR)).toBeVisible();
  await page.goBack();
  await expectIdle(page);
  // Measured: Next drops the pending navigation, so nothing commits that would end the bar.
  expect(await everShown(page, 4_000), "the bar does not come back").toBe(false);
  expect(new URL(page.url()).pathname).toBe(`/clients/${LINA}`);
});

test("startNavigationProgress for the URL you are on never shows the bar; another URL does", async ({ page }) => {
  await signIn(page);
  await page.goto(`/clients/${LINA}`);
  await expect(page.locator("section[aria-label]").first()).toBeVisible();
  const start = (href: string) =>
    page.evaluate((href) => window.dispatchEvent(new CustomEvent("evoli:navigation-start", { detail: href })), href);
  const here = everShown(page, 1_000);
  await start(`/clients/${LINA}`);
  expect(await here, "nothing will commit, so it would hang until the give-up").toBe(false);
  // Control: the same event for another URL (nothing navigates, so it stays until give-up).
  await start(`/clients/${LINA}/nutrition`);
  await expect(page.locator(BAR)).toBeVisible();
});

test("the server-rendered bar is hidden before any script runs", async ({ browser, baseURL }) => {
  // No JavaScript: what a coach sees between the HTML arriving and hydration. A bar
  // that relied on an effect to hide itself would be on screen here.
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const login = await context.request.post("/api/auth/login", {
      data: { email: "coach@evoli.fit", password: "Password123!" },
      maxRedirects: 0,
    });
    expect(login.status()).toBe(200);
    const page = await context.newPage();
    await page.goto(`/clients/${LINA}`);
    await expect(page.locator("section[aria-label]").first()).toBeVisible();
    await expect(page.locator(NODE)).toHaveCount(1);
    await expect(page.locator(NODE)).toBeHidden();
  } finally {
    await context.close();
  }
});
