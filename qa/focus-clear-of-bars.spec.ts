import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * QA NB-1 (branch 1, 2026-10-02) — WCAG 2.4.11 in WebKIT: keyboard focus must not land
 * partly under the sticky tab bar, top bar, legal footer or an editor's action bar (EV-337i).
 *
 * Chromium honours `html { scroll-padding-* }` when it scrolls a focused element into view;
 * in WebKit the padding alone is not enough: at 390 × 700, with the island disabled, 33 of
 * the routine editor's focus stops were left partly hidden under the tab bar (re-witnessed
 * 2026-10-02; see FocusClearOfBars' header for what WebKit does honour). `FocusClearOfBars` (mounted by the shell) is the fix. This spec
 * drives REAL WebKit, because the defect does not exist in Chromium — a Chromium-only test
 * of it passes with the fix deleted.
 *
 * It launches WebKit itself (the configs' project is Chromium). The browser must be
 * installed (`npx playwright install webkit`); a missing browser FAILS here rather than
 * skipping, so the gate cannot turn green by not running.
 *
 * The measure is the QA harness's (`qapro1-evidence/harness/focusobscured.cjs`): after each
 * Tab (Alt+Tab: WebKit on macOS skips links on a plain Tab) and a settle, the share of the
 * focused element's box that is clear of every sticky/fixed bar on screen.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** The fixture's « Upper / Lower split » template: its editor carries EV-337i's sticky `.action-bar`. */
const UPPER_LOWER = "7c2d0a11-0000-4000-8000-0000000000b1";
const TAB = process.platform === "darwin" ? "Alt+Tab" : "Tab";

let browser: Browser;
test.beforeAll(async () => {
  expect(existsSync(webkit.executablePath()), `WebKit is not installed: npx playwright install webkit`).toBe(true);
  browser = await webkit.launch();
});
test.afterAll(async () => {
  await browser?.close();
});

async function signedIn(baseURL: string): Promise<Page> {
  const context = await browser.newContext({ baseURL, locale: "en-US" });
  const page = await context.newPage();
  // WebKit types before hydration under load: the helper waits for the form to take it.
  await signInThroughForm(page, { landing: `${baseURL}/` });
  return page;
}

/** Tab through `stops` focus stops in the page's content; report the ones not fully clear. */
async function obscuredStops(page: Page, stops: number) {
  const out: { what: string; visible: number }[] = [];
  let measured = 0;
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press(TAB);
    await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement | null;
      if (!e || e === document.body) return null;
      if (e.closest(".shell-tabbar, .shell-topbar, .shell-sidebar, .legal-footer, .action-bar")) return { inShell: true } as const;
      const b = e.getBoundingClientRect();
      // EV-337i: `.action-bar` is stuck ABOVE the tab bar or the footer, at its own `bottom`
      // offset — so a bar counts as riding the bottom edge when it sits at THAT offset. One
      // that has settled into the page's flow higher up is content, not a bar.
      const bars = Array.from(document.querySelectorAll(".shell-tabbar, .shell-topbar, .legal-footer, .action-bar"))
        .filter((x) => getComputedStyle(x).display !== "none" && ["sticky", "fixed"].includes(getComputedStyle(x).position))
        .map((x) => {
          const offset = parseFloat(getComputedStyle(x).bottom);
          return { r: x.getBoundingClientRect(), stuckAt: innerHeight - (Number.isFinite(offset) ? offset : 0) };
        });
      let top = Math.max(b.top, 0);
      let bottom = Math.min(b.bottom, innerHeight);
      for (const { r: bar, stuckAt } of bars) {
        if (bar.top <= 1 && bar.bottom > top) top = Math.max(top, bar.bottom);
        else if (bar.bottom >= stuckAt - 1 && bar.top < bottom) bottom = Math.min(bottom, bar.top);
      }
      const what = `${e.tagName.toLowerCase()} ${(e.getAttribute("aria-label") || e.innerText || (e as HTMLInputElement).value || "").slice(0, 30)}`;
      return { inShell: false, what, visible: b.height ? Math.max(0, bottom - top) / b.height : 0 } as const;
    });
    if (!r) break;
    if (r.inShell) continue;
    measured += 1;
    if (r.visible < 0.99) out.push({ what: r.what, visible: Math.round(r.visible * 100) / 100 });
  }
  return { measured, out };
}

for (const [width, height] of [
  [390, 700],
  [1023, 700],
  [1440, 850],
] as const) {
  test(`WebKit ${width}×${height}: no keyboard focus stop on the routine editor is under a bar`, async ({ baseURL }) => {
    const page = await signedIn(baseURL!);
    await page.setViewportSize({ width, height });
    await page.goto(`/clients/${LINA}/routine`);
    await expect(page.locator("h1")).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    await page.mouse.click(2, 2);
    const result = await obscuredStops(page, 70);
    expect(result.measured, "measured the editor's stops").toBeGreaterThan(30);
    expect(result.out, `${width}px: focus stops partly under a sticky bar`).toEqual([]);
    await page.context().close();
  });
}

/**
 * EV-337i (staff review of 8b175b2) — the template editor's sticky `.action-bar` is a THIRD
 * bottom bar, stacked on the tab bar (< 1024). Two protections keep focus out from under it:
 * `html:has(.action-bar)`'s scroll-padding (globals.css) and `FocusClearOfBars`, which counts
 * it. Staff's probe: either alone suffices in this WebKit; with BOTH removed, 47 of 58 stops
 * at 390 landed fully under the bar. This pins the pair.
 */
for (const [width, height] of [
  [390, 700],
  [1023, 700],
] as const) {
  test(`WebKit ${width}×${height}: no keyboard focus stop on the template editor is under a bar`, async ({ baseURL }) => {
    const page = await signedIn(baseURL!);
    await page.setViewportSize({ width, height });
    await page.goto(`/templates/${UPPER_LOWER}`);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator(".action-bar")).toHaveCount(1);
    await page.waitForLoadState("networkidle");
    await page.mouse.click(2, 2);
    const result = await obscuredStops(page, 70);
    expect(result.measured, "measured the editor's stops").toBeGreaterThan(30);
    expect(result.out, `${width}px: focus stops partly under a sticky bar`).toEqual([]);
    await page.context().close();
  });
}

test("WebKit 390: a field on /recipes/new is clear of the tab bar when reached by keyboard", async ({ baseURL }) => {
  const page = await signedIn(baseURL!);
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/recipes/new");
  await page.waitForLoadState("networkidle");
  await page.mouse.click(2, 2);
  const result = await obscuredStops(page, 20);
  expect(result.measured).toBeGreaterThan(5);
  expect(result.out).toEqual([]);
  await page.context().close();
});

/**
 * Staff B2 (review of d9515206): a MOUSE click on a text field peeking above the tab bar
 * scrolled the page 40 px, in WebKit and in Chromium, because `:focus-visible` also matches
 * a click-focused input. The island now acts on keyboard focus only. Witness: a field whose
 * top 12 px show above the tab bar is clicked there; the page must not move, and the field
 * must have focus (so the click really landed on it).
 */
async function clickPeekingField(page: Page) {
  const before = await page.evaluate(async () => {
    const bar = document.querySelector(".shell-tabbar")!.getBoundingClientRect();
    const fields = Array.from(document.querySelectorAll<HTMLInputElement>("main input[type=text], main input:not([type])")).filter(
      (e) => e.getBoundingClientRect().height > 20
    );
    const el = fields[Math.floor(fields.length / 2)];
    if (!el) return null;
    window.scrollBy(0, el.getBoundingClientRect().top - (bar.top - 12));
    await new Promise((r) => setTimeout(r, 250));
    el.setAttribute("data-peek", "");
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, scrollY: window.scrollY, barTop: document.querySelector(".shell-tabbar")!.getBoundingClientRect().top };
  });
  expect(before, "found a text field on the routine editor").not.toBeNull();
  expect(before!.top, "the field peeks above the tab bar").toBeLessThan(before!.barTop);
  await page.mouse.click(before!.left + 10, before!.top + 5);
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({
    scrollY: window.scrollY,
    focused: document.activeElement?.hasAttribute("data-peek") ?? false,
  }));
  expect(after.focused, "the click focused the field").toBe(true);
  expect(Math.abs(after.scrollY - before!.scrollY), "a pointer focus does not scroll the page").toBeLessThanOrEqual(1);
}

test("WebKit 390: a mouse click into a field above the tab bar does not scroll the page (B2)", async ({ baseURL }) => {
  const page = await signedIn(baseURL!);
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(`/clients/${LINA}/routine`);
  await page.waitForLoadState("networkidle");
  await clickPeekingField(page);
  await page.context().close();
});

test("Chromium 390: a mouse click into a field above the tab bar does not scroll the page (B2)", async ({ page }) => {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(`/clients/${LINA}/routine`);
  await page.waitForLoadState("networkidle");
  await clickPeekingField(page);
});
