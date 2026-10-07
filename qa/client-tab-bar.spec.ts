import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type Page } from "@playwright/test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { TabBar, type TabDef } from "../src/components/client/TabBar";

/**
 * EV-342e (audit A5) — one tab bar on every client page, built from data.
 *
 *   E.1 On all three pages, the same tab bar « Vue d'ensemble · Programme · Nutrition » (EN
 *       Overview · Routine · Nutrition) appears in the same place, with aria-current="page"
 *       on the current one; the overview no longer shows the two buttons.
 *   E.2 A unit test renders the bar from a four-entry array and shows four tabs.
 *   E.3 Tab reaches the bar, Enter follows the link; at 390 px the bar scrolls sideways
 *       inside itself and the page does not.
 *   E.4 One `h1` per page (EV-337). BUG-670's second-click rule is `nav-progress.spec.ts`'s
 *       (roster config), run unchanged on this branch.
 *
 * Lina is used because her overview carries no injury chip, so her header is the same block
 * on all three pages and "the same place" can be a measured box, not only a DOM position.
 * Red on c2768c2: the overview has no « Sections du client » navigation.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const PAGES = [
  { key: "overview", path: `/clients/${LINA}` },
  { key: "routine", path: `/clients/${LINA}/routine` },
  { key: "nutrition", path: `/clients/${LINA}/nutrition` },
] as const;

const LANG = {
  en: { locale: "en-US", nav: "Trainee sections", tabs: ["Overview", "Routine", "Nutrition"] },
  fr: { locale: "fr-FR", nav: "Sections du client", tabs: ["Vue d'ensemble", "Programme", "Nutrition"] },
} as const;

function bar(page: Page, lang: keyof typeof LANG) {
  return page.getByRole("main").getByRole("navigation", { name: LANG[lang].nav, exact: true });
}

/*
 * E.2 renders `TabBar` from a HAND-WRITTEN four-entry array, not from `CLIENT_SECTIONS`: it
 * proves the bar draws whatever array it is given. That the three pages use
 * `CLIENT_SECTIONS` is E.1's job (the same three tabs on every page). A real fourth section
 * is one `CLIENT_SECTIONS` entry plus its `copy.tabs` label in both languages.
 */
test.describe("E.2 the bar is data", () => {
  test("four entries render four tabs, in order, the active one marked", () => {
    const tabs: TabDef[] = [
      { key: "overview", href: "/clients/x", label: "Overview" },
      { key: "routine", href: "/clients/x/routine", label: "Routine", scope: "WORKOUTS" },
      { key: "nutrition", href: "/clients/x/nutrition", label: "Nutrition", scope: "NUTRITION" },
      { key: "intake", href: "/clients/x/intake", label: "Intake" },
    ];
    const html = renderToStaticMarkup(createElement(TabBar, { tabs, active: "intake", label: "Trainee sections" }));
    const links = [...html.matchAll(/<a\b([^>]*)>([^<]*)<\/a>/g)];
    expect(links.map((m) => m[2])).toEqual(["Overview", "Routine", "Nutrition", "Intake"]);
    expect(links.map((m) => /href="([^"]*)"/.exec(m[1])?.[1])).toEqual(tabs.map((t) => t.href));
    expect(links.map((m) => m[1].includes('aria-current="page"'))).toEqual([false, false, false, true]);
    expect(html).toMatch(/^<nav aria-label="Trainee sections"/);
  });
});

for (const lang of ["en", "fr"] as const) {
  test.describe(`E.1 / E.4, ${lang.toUpperCase()}`, () => {
    test.use({ locale: LANG[lang].locale });

    for (const width of [1440, 390] as const) {
      test(`the same bar, in the same place, on all three pages at ${width} px; one h1; no buttons on the overview`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await signInThroughForm(page, { lang });
        const boxes: { x: number; y: number; width: number }[] = [];
        for (const p of PAGES) {
          await page.goto(p.path);
          const nav = bar(page, lang);
          await expect(nav, `${p.key}: one bar`).toHaveCount(1);
          await expect(nav.getByRole("link")).toHaveText([...LANG[lang].tabs]);
          const current = nav.locator('[aria-current="page"]');
          await expect(current, `${p.key}: one current tab`).toHaveCount(1);
          await expect(current).toHaveText(LANG[lang].tabs[PAGES.indexOf(p)]);
          await expect(current).toHaveAttribute("href", p.path);
          // Directly under the header block, inside the header (the same place in the DOM)…
          expect(
            await nav.evaluate((el) => el.previousElementSibling?.classList.contains("client-head") ?? false),
            `${p.key}: the bar follows the header block`
          ).toBe(true);
          await expect(page.locator("h1"), `${p.key}: one h1`).toHaveCount(1);
          // …and at the same box (Lina's header is the same block on all three pages).
          const box = await nav.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), width: Math.round(r.width) };
          });
          boxes.push(box);
          if (p.key === "overview") {
            await expect(page.locator(".client-head .status-pill"), "Lina has no injury chip").toHaveCount(0);
            // The two EV-337e buttons are gone: each section's link is in the bar, and only there.
            for (const t of LANG[lang].tabs.slice(1)) {
              await expect(page.getByRole("main").getByRole("link", { name: t, exact: true })).toHaveCount(1);
            }
            await expect(page.locator(".client-head a.link-button")).toHaveCount(0);
            // The revoke menu stays in the header.
            await expect(page.locator(".client-head").getByRole("button", { name: lang === "fr" ? "Plus" : "More" })).toBeVisible();
          }
        }
        expect(boxes[1], "routine: same place as the overview").toEqual(boxes[0]);
        expect(boxes[2], "nutrition: same place as the overview").toEqual(boxes[0]);
      });
    }
  });
}

/*
 * BUG-701 (QA of 242d5fa; senior-po ruling 2026-10-07). Only the overview passed injury chips
 * to the header, so for Dana the bar sat 34 px lower on the overview at 390 px (3 px wider).
 * Ruling: no chip in the header on any client page; on the overview they sit under the bar,
 * above the first card; no new read. So the header is the same block everywhere and the
 * bar's TOP is identical (0 px) on the three pages, for: Lina (no chip), Dana (a chip),
 * Quentin H. (the longest seeded name), and Dana served a 50-character name through the
 * fixture's `evoli_fixture_display_name` switch (the header's truncation path).
 */
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
const QUENTIN = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0022";
const LONG_NAME = "Maximiliana-Josefina Wolkenstein de la Fontaine R.";
const DANA_CHIP = { en: "Limitation: Shoulders", fr: "Limitation\u00a0: Épaules" } as const;
const BUG701_CLIENTS = [
  { label: "Lina", id: LINA, longName: false },
  { label: "Dana", id: DANA, longName: false },
  { label: "Quentin H.", id: QUENTIN, longName: false },
  { label: "Dana, 50-character name", id: DANA, longName: true },
] as const;

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-701: the bar's top on the three client pages, ${lang.toUpperCase()}`, () => {
    test.use({ locale: LANG[lang].locale });

    for (const client of BUG701_CLIENTS) {
      test(`${client.label}: the same top at 1440, 1024, 768 and 390; no chip in the header`, async ({ page }) => {
        test.setTimeout(120_000);
        await signInThroughForm(page, { lang });
        if (client.longName) {
          expect(LONG_NAME.length).toBe(50);
          await page.context().addCookies([
            {
              name: "evoli_fixture_display_name",
              value: `${client.id}:${encodeURIComponent(LONG_NAME)}`,
              url: new URL("/", page.url()).href,
            },
          ]);
        }
        for (const width of [1440, 1024, 768, 390] as const) {
          await page.setViewportSize({ width, height: 900 });
          const tops: number[] = [];
          for (const path of [`/clients/${client.id}`, `/clients/${client.id}/routine`, `/clients/${client.id}/nutrition`]) {
            await page.goto(path);
            const where = `${path} at ${width}`;
            await expect(page.locator(".client-head"), where).toHaveCount(1);
            if (client.longName) await expect(page.locator(".client-head h1"), where).toHaveAttribute("title", LONG_NAME);
            await expect(page.locator(".client-head .status-pill"), `${where}: no chip in the header`).toHaveCount(0);
            const nav = bar(page, lang);
            await expect(nav, `${where}: one bar`).toHaveCount(1);
            tops.push(await nav.evaluate((el) => el.getBoundingClientRect().top + window.scrollY));
          }
          expect(tops[1] - tops[0], `${width}: routine vs overview, px`).toBe(0);
          expect(tops[2] - tops[0], `${width}: nutrition vs overview, px`).toBe(0);
        }
      });
    }

    test("Dana's overview: the chip under the bar, above the first card", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await page.goto(`/clients/${DANA}`);
      const chips = page.locator(".client-injuries .status-pill");
      await expect(chips).toHaveText([DANA_CHIP[lang]]);
      const [barBox, chipBox, firstCard] = await Promise.all([
        bar(page, lang).boundingBox(),
        page.locator(".client-injuries").boundingBox(),
        page.locator(".client-injuries + *").boundingBox(),
      ]);
      expect(chipBox!.y, "under the tab bar").toBeGreaterThanOrEqual(barBox!.y + barBox!.height);
      expect(chipBox!.y + chipBox!.height, "above the first card").toBeLessThanOrEqual(firstCard!.y);
    });
  });
}

test.describe("E.3 keyboard and the narrow bar", () => {
  test("Tab reaches the bar from the back link, Enter follows a tab", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signInThroughForm(page);
    await page.goto(`/clients/${LINA}`);
    const nav = bar(page, "en");
    await page.getByRole("link", { name: "Back to roster", exact: true }).focus();
    let reached = false;
    for (let i = 0; i < 6 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await nav.evaluate((el) => el.contains(document.activeElement));
    }
    expect(reached, "Tab reaches the tab bar within 6 presses of the back link").toBe(true);
    await expect(nav.getByRole("link", { name: "Overview", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(nav.getByRole("link", { name: "Routine", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/clients/${LINA}/routine$`));
    await expect(bar(page, "en").locator('[aria-current="page"]')).toHaveText("Routine");
  });

});

for (const lang of ["en", "fr"] as const) {
  test.describe(`E.3 the narrow bar, ${lang.toUpperCase()}`, () => {
    test.use({ locale: LANG[lang].locale });

    test("at 390 px a bar too wide for the row scrolls inside itself, the page does not", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await signInThroughForm(page, { lang });
      await page.goto(`/clients/${LINA}`);
      const nav = bar(page, lang);
      await expect(nav.getByRole("link")).toHaveCount(3);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        "today's three tabs: no sideways page scroll"
      ).toBeLessThanOrEqual(0);
      // Today's three tabs fit; a section added later (EV-341b) may not. Two more tabs,
      // copies of a real one, stand in for it: the bar's CSS is what is under test.
      await nav.evaluate((el) => {
        const last = el.lastElementChild as HTMLElement;
        for (const label of ["Entretien initial", "Historique complet"]) {
          const copy = last.cloneNode(true) as HTMLElement;
          copy.textContent = label;
          el.appendChild(copy);
        }
      });
      const m = await nav.evaluate((el) => {
        el.scrollLeft = 80;
        return {
          overflowX: getComputedStyle(el).overflowX,
          inner: el.scrollWidth > el.clientWidth,
          scrolled: el.scrollLeft,
          page: document.documentElement.scrollWidth - window.innerWidth,
          barRight: Math.round(el.getBoundingClientRect().right),
        };
      });
      expect(m.overflowX).toBe("auto");
      expect(m.inner, "the bar is wider than its row").toBe(true);
      expect(m.scrolled, "and scrolls sideways inside itself").toBeGreaterThan(0);
      expect(m.page, "the page does not scroll sideways").toBeLessThanOrEqual(0);
      expect(m.barRight, "the bar ends inside the window").toBeLessThanOrEqual(390);
    });
  });
}

/* The configs' project is Chromium; WebKit is launched here, like focus-clear-of-bars.spec.ts. */
test.describe("EV-342e in WebKit, French, 390 px", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  test("the overview carries the bar; a tab leads to the routine, where the bar marks it", async ({ baseURL }) => {
    const context = await browser.newContext({ baseURL, locale: "fr-FR", viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: "evoli_pro_locale", value: "fr", url: baseURL! }]);
    const page = await context.newPage();
    try {
      await signInThroughForm(page, { lang: "fr" });
      await page.goto(`/clients/${LINA}`);
      const nav = bar(page, "fr");
      await expect(nav.getByRole("link")).toHaveText([...LANG.fr.tabs]);
      await expect(nav.locator('[aria-current="page"]')).toHaveText("Vue d'ensemble");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await nav.getByRole("link", { name: "Programme", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/clients/${LINA}/routine$`));
      await expect(bar(page, "fr").locator('[aria-current="page"]')).toHaveText("Programme");
    } finally {
      await context.close();
    }
  });
});
