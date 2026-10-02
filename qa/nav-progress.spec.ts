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
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const BAR = '[data-nav-progress="visible"]';

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@evoli.fit");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

/** Click a link and report when the bar appeared/left and when `selector` showed up (ms after the click). */
async function timedClick(page: Page, href: string, selector: string) {
  return page.evaluate(
    async ({ href, selector, bar }) => {
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
          const shown = document.querySelector(bar) !== null;
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
    { href, selector, bar: BAR }
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
  await expect(page.locator(BAR)).toHaveCount(0);
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
  await page.locator(`a[href="/clients/${LINA}/nutrition"]`).click();
  await expect(page.getByText("Leave with unsaved changes?")).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator(BAR)).toHaveCount(0);
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
