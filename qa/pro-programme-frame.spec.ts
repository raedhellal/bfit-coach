import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, webkit, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { openEveryDay } from "./day-accordion";
import { expectNoSidewaysScroll, expectUnoccluded } from "./layout";
import { expectNoEnglish } from "./french";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";

/**
 * EV-337f1 — the programme page in the Evoli Pro frame (`/clients/{id}/routine`, plan §5.3,
 * story § Split of EV-337f, g and j: F1.1–F1.8, rulings 15 and 16, X1–X8).
 *
 * The plan F1.1 measures is the fixture's six-day, six-exercise plan, served for Yusuf
 * behind `evoli_fixture_long_plan=<clientId>` (coachApi.fixture.ts `withLongPlanSwitch`).
 * Every sentence and label is a LITERAL, never read from copy.ts (a fixture derived from its
 * subject cannot witness it) — the dictionaries are imported only for the X6 leftover scan.
 *
 * F1.7 (behaviour unchanged) is witnessed by `routine-editor-remount`, `coach-routine*`,
 * `publish-reseed-no-refresh` and `editor-save-no-refresh`, which this branch does not edit;
 * the one F1.7 clause a browser cannot see (no `"use client"` on the page) is read here.
 *
 * Screenshots (X6: 1440 and 390, each language, each state) are written to
 * `$EV337F1_EVIDENCE` when it is set, and nowhere otherwise.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";

/** Story X1's widths, both sides of every breakpoint. */
const X1_WIDTHS = [1440, 1280, 1279, 1024, 1023, 768, 767, 390, 320] as const;
/** F1.1's two phones, at the heights of the phones that have them. */
const PHONES = [
  [390, 844],
  [320, 568],
] as const;

type Lang = "en" | "fr";
const LOCALE: Record<Lang, string> = { en: "en-US", fr: "fr-FR" };
const L = {
  en: {
    region: "Routine actions",
    save: "Save draft",
    discard: "Discard draft",
    publish: "Publish",
    title: "Routine",
    day: (n: number) => `Day ${n}`,
    sets: "Sets",
    saved: /^Draft saved /,
    saveFailed: "The draft could not be saved.",
    published: /^Published\. /,
    hint: "Publish shows you the safety changes first. Nothing reaches the trainee until you confirm.",
    draft: "Draft — not yet published",
    live: "Published plan",
    unsaved: "Unsaved changes",
    profile: "Trainee profile",
    asTemplate: "Save as template",
    changed: /changed this plan on/,
    planName: "Plan name",
    empty: "No active plan",
    scope: "This trainee has not shared their workouts with you.",
  },
  fr: {
    region: "Actions du programme",
    save: "Enregistrer le brouillon",
    discard: "Supprimer le brouillon",
    publish: "Publier",
    title: "Programme",
    day: (n: number) => `Jour ${n}`,
    sets: "Séries",
    saved: /^Brouillon enregistré à /,
    saveFailed: "Le brouillon n'a pas pu être enregistré.",
    published: /^Publié\. /,
    hint: "Publier vous montre d'abord les ajustements de sécurité. Rien n'arrive au client avant votre confirmation.",
    draft: "Brouillon — pas encore publié",
    live: "Plan publié",
    unsaved: "Modifications non enregistrées",
    profile: "Profil du client",
    asTemplate: "Enregistrer comme modèle",
    changed: /a modifié ce plan le/,
    planName: "Nom du plan",
    empty: "Aucun plan actif",
    scope: "Ce client n'a pas partagé ses séances avec vous.",
  },
} as const;

const EVIDENCE = process.env.EV337F1_EVIDENCE;
async function shot(page: Page, name: string) {
  if (!EVIDENCE) return;
  mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: join(EVIDENCE, `${name}.png`) });
}

async function longPlan(context: BrowserContext, baseURL: string) {
  await context.addCookies([{ name: "evoli_fixture_long_plan", value: YUSUF, url: baseURL }]);
}

async function signIn(page: Page, lang: Lang, baseURL?: string) {
  await signInThroughForm(page, { lang, ...(baseURL ? { landing: `${baseURL}/` } : {}) });
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "has a box").not.toBeNull();
  return b!;
}

function bar(page: Page, lang: Lang) {
  return page.getByRole("region", { name: L[lang].region, exact: true });
}

/** Waits for the long plan (day 6 on screen) — the switch is read by the server render. */
async function openLongPlan(page: Page, lang: Lang) {
  await page.goto(`/clients/${YUSUF}/routine`);
  await expect(page.getByRole("group", { name: L[lang].day(6), exact: true })).toHaveCount(1);
  await expect(bar(page, lang)).toBeVisible();
}

/** Scrolls day `n`'s card to the top of the viewport (under the top bar, if any). */
async function scrollToDay(page: Page, lang: Lang, n: number) {
  await page.getByRole("group", { name: L[lang].day(n), exact: true }).evaluate((el) => {
    el.scrollIntoView({ block: "start" });
    window.scrollBy(0, -64);
  });
}

/** Every word of a button's label sits on ONE line (edge case 3: nothing broken mid-word). */
async function labelWordsWhole(button: Locator): Promise<string[]> {
  return button.evaluate((el) => {
    const broken: string[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const text = node.textContent ?? "";
      for (const m of text.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, m.index ?? 0);
        range.setEnd(node, (m.index ?? 0) + m[0].length);
        const lines = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top)));
        if (lines.size !== 1) broken.push(m[0]);
      }
    }
    return broken;
  });
}

/**
 * F1.1 at the current scroll position: « Publier » in the viewport (measured BEFORE any
 * scroll-into-view), unoccluded, ≥ 44 × 44, the bar's full inner width, above the tab bar;
 * Save and Discard side by side on one row above it, each ≥ 44 tall; no label clipped or
 * broken mid-word.
 */
async function expectPublishUnderTheThumb(page: Page, lang: Lang, where: string) {
  const region = bar(page, lang);
  const publish = region.getByRole("button", { name: L[lang].publish, exact: true });
  const save = region.getByRole("button", { name: L[lang].save, exact: true });
  const discard = region.getByRole("button", { name: L[lang].discard, exact: true });
  const { width, height } = page.viewportSize()!;
  const label = `${where} at ${width}×${height} (${lang})`;

  const p = await box(publish);
  expect(p.y, `${label}: « Publier » starts inside the viewport`).toBeGreaterThanOrEqual(0);
  expect(p.y + p.height, `${label}: « Publier » ends inside the viewport`).toBeLessThanOrEqual(height + 0.5);
  expect(p.height, `${label}: « Publier » is ≥ 44 px tall`).toBeGreaterThanOrEqual(44);
  expect(p.width, `${label}: « Publier » is ≥ 44 px wide`).toBeGreaterThanOrEqual(44);

  const tabbar = page.locator(".shell-tabbar");
  const t = await box(tabbar);
  expect(p.y + p.height, `${label}: « Publier » is above the bottom tab bar`).toBeLessThanOrEqual(t.y + 0.5);
  await expectUnoccluded(page, publish, { over: tabbar, label: `${label}: « Publier »` });

  // The bar's full width: its content box, less nothing.
  const inner = await region.evaluate((el) => {
    const cs = getComputedStyle(el);
    return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  });
  expect(p.width, `${label}: « Publier » spans the bar (${inner}px)`).toBeGreaterThanOrEqual(inner - 1);

  const s = await box(save);
  const d = await box(discard);
  expect(Math.abs(s.y - d.y), `${label}: Save and Discard share a row`).toBeLessThanOrEqual(1);
  expect(s.x + s.width, `${label}: Save is left of Discard`).toBeLessThanOrEqual(d.x + 0.5);
  expect(s.height, `${label}: Save ≥ 44 px tall`).toBeGreaterThanOrEqual(44);
  expect(d.height, `${label}: Discard ≥ 44 px tall`).toBeGreaterThanOrEqual(44);
  expect(s.y + s.height, `${label}: the pair is above « Publier »`).toBeLessThanOrEqual(p.y + 0.5);
  expect(s.y, `${label}: Save is in the viewport`).toBeGreaterThanOrEqual(0);
  await expectUnoccluded(page, save, { label: `${label}: Save` });
  await expectUnoccluded(page, discard, { label: `${label}: Discard` });

  for (const [control, name] of [
    [save, "Save"],
    [discard, "Discard"],
    [publish, "Publish"],
  ] as const) {
    const clip = await control.evaluate((el) => ({ x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight }));
    expect(clip.x, `${label}: ${name}'s label is clipped sideways`).toBeLessThanOrEqual(0);
    expect(clip.y, `${label}: ${name}'s label is clipped vertically`).toBeLessThanOrEqual(0);
    expect(await labelWordsWhole(control), `${label}: ${name}'s label breaks mid-word`).toEqual([]);
  }
}

/* ═══ F1.7 — the page stays server-rendered ═════════════════════════════════════════════ */

test("F1.7: the programme page is a server component (no \"use client\" in page.tsx)", () => {
  const source = readFileSync(join(__dirname, "../src/app/clients/[id]/routine/page.tsx"), "utf8");
  expect(source).not.toMatch(/^\s*["']use client["']/m);
});

/* ═══ X1, X2, X4, X5, F1.6 — nine widths, two languages, four states ════════════════════ */

for (const lang of ["en", "fr"] as const) {
  test.describe(`X1/X2/X4/X5/F1.6 (${lang})`, () => {
    test.use({ locale: LOCALE[lang] });

    test("loaded, no plan, scope missing, load error: no sideways scroll, one h1, the tab's h2, one footer", async ({
      page,
      context,
      baseURL,
    }) => {
      await longPlan(context, baseURL!);
      await signIn(page, lang);
      const states: [string, string, () => Promise<void>][] = [
        ["loaded", `/clients/${YUSUF}/routine`, async () => {}],
        ["no-plan", `/clients/${NILS}/routine`, async () => {}],
        ["scope-missing", `/clients/${SARA}/routine`, async () => {}],
        [
          "load-error",
          `/clients/${LINA}/routine`,
          // EV-337m M7's switch: Lina's routine read answers 500, so the tab draws its load error.
          () => context.addCookies([{ name: "evoli_fixture_summary_read", value: `routine:500:${LINA}`, url: baseURL! }]),
        ],
      ];
      for (const [state, path, arrange] of states) {
        await arrange();
        for (const width of X1_WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          if (width === X1_WIDTHS[0]) {
            await page.goto(path);
            // Each state is the state it claims to be.
            const sentinel = {
              loaded: page.getByRole("group", { name: L[lang].day(6), exact: true }),
              "no-plan": page.getByText(L[lang].empty, { exact: true }),
              "scope-missing": page.getByText(L[lang].scope, { exact: true }),
              "load-error": page.getByText(lang === "en" ? "This trainee's routine could not be loaded." : "Le programme de ce client n'a pas pu être chargé.", { exact: true }),
            }[state]!;
            await expect(sentinel, state).toBeVisible();
          }
          const where = `${state} at ${width} (${lang})`;
          await expectNoSidewaysScroll(page, where);
          await expect(page.locator("h1"), where).toHaveCount(1);
          await expect(page.getByRole("heading", { level: 2, name: L[lang].title, exact: true }), where).toHaveCount(1);
          await expect(page.getByRole("contentinfo"), where).toHaveCount(1);
          // X2: the sidebar from 1024, the bottom tab bar below.
          if (width >= 1024) {
            await expect(page.locator(".shell-sidebar"), where).toBeVisible();
            await expect(page.locator(".shell-tabbar"), where).toBeHidden();
          } else {
            await expect(page.locator(".shell-tabbar"), where).toBeVisible();
            await expect(page.locator(".shell-sidebar"), where).toBeHidden();
          }
          if (width === 1440 || width === 390) await shot(page, `${state}-${lang}-${width}`);
        }
      }
    });
  });
}

/* ═══ F1.1 — « Publier » under the thumb, Chromium ══════════════════════════════════════ */

for (const lang of ["en", "fr"] as const) {
  test.describe(`F1.1 Chromium (${lang})`, () => {
    test.use({ locale: LOCALE[lang] });

    test("6 × 6 plan at 390 and 320: on load and at day 1, 3 and 6", async ({ page, context, baseURL }) => {
      await longPlan(context, baseURL!);
      await signIn(page, lang);
      for (const [width, height] of PHONES) {
        await page.setViewportSize({ width, height });
        await openLongPlan(page, lang);
        await expectPublishUnderTheThumb(page, lang, "on load");
        for (const day of [1, 3, 6]) {
          await scrollToDay(page, lang, day);
          await expectPublishUnderTheThumb(page, lang, `at day ${day}`);
          if (width === 390 && day === 6) await shot(page, `loaded-day6-${lang}-390`);
        }
      }
    });
  });
}

/* ═══ F1.1 + F1.4 — the same, in real WebKit ════════════════════════════════════════════ */

test.describe("F1.1 + F1.4 WebKit", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  for (const lang of ["en", "fr"] as const) {
    test(`WebKit (${lang}): « Publier » at 390 and 320, day 1, 3 and 6; two columns at 1280, one at 1279`, async ({
      baseURL,
    }) => {
      // The runner hands its own en-US Accept-Language to contexts it did not create: say it.
      const context = await browser.newContext({
        baseURL,
        locale: LOCALE[lang],
        extraHTTPHeaders: { "Accept-Language": LOCALE[lang] },
      });
      await longPlan(context, baseURL!);
      const page = await context.newPage();
      await signIn(page, lang, baseURL);
      for (const [width, height] of PHONES) {
        await page.setViewportSize({ width, height });
        await openLongPlan(page, lang);
        await expectPublishUnderTheThumb(page, lang, "WebKit on load");
        for (const day of [1, 3, 6]) {
          await scrollToDay(page, lang, day);
          await expectPublishUnderTheThumb(page, lang, `WebKit at day ${day}`);
        }
      }
      for (const [width, columns] of [
        [1280, 2],
        [1279, 1],
      ] as const) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => window.scrollTo(0, 0));
        const a = await box(page.locator(".prog-aside"));
        const m = await box(page.locator(".prog-main"));
        if (columns === 2) expect(a.x, `WebKit ${width}: the aside is beside the editor`).toBeGreaterThan(m.x + m.width - 1);
        else expect(a.y + a.height, `WebKit ${width}: the aside is above the editor`).toBeLessThanOrEqual(m.y + 1);
      }
      await context.close();
    });
  }
});

/* ═══ F1.2 — one bar, a named region, nothing else saves ═════════════════════════════════ */

for (const lang of ["en", "fr"] as const) {
  test.describe(`F1.2 (${lang})`, () => {
    test.use({ locale: LOCALE[lang] });

    test("the three controls are in one named region, and nowhere else", async ({ page, context, baseURL }) => {
      await longPlan(context, baseURL!);
      await signIn(page, lang);
      await page.setViewportSize({ width: 1440, height: 900 });
      await openLongPlan(page, lang);
      await expect(page.getByRole("region", { name: L[lang].region, exact: true })).toHaveCount(1);
      for (const name of [L[lang].save, L[lang].discard, L[lang].publish]) {
        await expect(page.getByRole("button", { name, exact: true }), name).toHaveCount(1);
        await expect(bar(page, lang).getByRole("button", { name, exact: true }), name).toHaveCount(1);
      }
      // The empty state has no plan to save: no bar, and none of the three.
      await page.goto(`/clients/${NILS}/routine`);
      await expect(page.getByText(L[lang].empty, { exact: true })).toBeVisible();
      await expect(bar(page, lang)).toHaveCount(0);
      for (const name of [L[lang].save, L[lang].discard, L[lang].publish]) {
        await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
      }
    });

    test("≥ 1024: the bar sits above the legal footer and never covers it; at the end it covers no exercise", async ({
      page,
      context,
      baseURL,
    }) => {
      await longPlan(context, baseURL!);
      await signIn(page, lang);
      for (const width of [1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await openLongPlan(page, lang);
        for (const day of [1, 3, 6]) {
          await scrollToDay(page, lang, day);
          const b = await box(bar(page, lang));
          const footer = page.getByRole("contentinfo");
          const f = await box(footer);
          expect(b.y + b.height, `${width}, day ${day}: the bar ends above the footer`).toBeLessThanOrEqual(f.y + 0.5);
          const onTop = await page.evaluate(
            ({ x, y }) => !!document.elementFromPoint(x, y)?.closest("footer"),
            { x: f.x + f.width / 2, y: f.y + f.height / 2 }
          );
          expect(onTop, `${width}, day ${day}: the footer is not covered at its centre`).toBe(true);
        }
      }
      // EV-337f2: day 6 is closed on load; its last exercise row is measured open.
      await openEveryDay(page);
      for (const [width, height] of [[1440, 900], ...PHONES] as const) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        // The day-6 card's last exercise row (Hanging Knee Raise is also on day 3: the last one).
        const last = page
          .getByRole("group", { name: L[lang].day(6), exact: true })
          .getByRole("group", { name: "Hanging Knee Raise", exact: true });
        const r = await box(last);
        const b = await box(bar(page, lang));
        expect(r.y + r.height, `${width}: scrolled to the end, the bar is below the last exercise`).toBeLessThanOrEqual(b.y + 0.5);
        if (width === 390) await shot(page, `loaded-end-${lang}-390`);
      }
    });
  });
}

/* ═══ F1.3 — the answer to a save or a publish is in sight at day 6 ════════════════════ */

for (const lang of ["en", "fr"] as const) {
  test.describe(`F1.3 (${lang})`, () => {
    test.use({ locale: LOCALE[lang] });

    async function inViewInsideTheBar(page: Page, notice: Locator, what: string) {
      await expect(notice, what).toBeVisible();
      const n = await box(notice);
      const { height } = page.viewportSize()!;
      expect(n.y, `${what}: in the viewport (top)`).toBeGreaterThanOrEqual(0);
      expect(n.y + n.height, `${what}: in the viewport (bottom)`).toBeLessThanOrEqual(height + 0.5);
      await expectUnoccluded(page, notice, { label: what });
      // In the bar, so it rides with the controls.
      await expect(bar(page, lang).getByText(await notice.innerText(), { exact: true })).toHaveCount(1);
    }

    test("at 390, scrolled to day 6: saved, failed and published notices are on screen without scrolling", async ({
      page,
      context,
      baseURL,
    }) => {
      await longPlan(context, baseURL!);
      await signIn(page, lang);
      await page.setViewportSize({ width: 390, height: 844 });
      await openLongPlan(page, lang);
      await openEveryDay(page); // EV-337f2: day 6 is closed on load
      await scrollToDay(page, lang, 6);
      const day6 = page.getByRole("group", { name: L[lang].day(6), exact: true });
      const sets = day6.getByRole("group", { name: "Goblet Squat", exact: true }).getByLabel(L[lang].sets);
      // A press before hydration types into a dead field: retried until the island marks it.
      await expect(async () => {
        await sets.fill("");
        await sets.fill("4");
        await expect(page.getByText(L[lang].unsaved, { exact: true })).toBeVisible({ timeout: 1_000 });
      }).toPass();
      await scrollToDay(page, lang, 6);

      // A FAILED save (the action's POST answered 500): the alert, in sight.
      await page.route(`**/clients/${YUSUF}/routine`, async (route) => {
        if (route.request().method() === "POST") return route.fulfill({ status: 500, contentType: "text/plain", body: "" });
        return route.fallback();
      });
      await bar(page, lang).getByRole("button", { name: L[lang].save, exact: true }).click();
      const failed = page.getByText(L[lang].saveFailed, { exact: true });
      await expect(failed).toHaveRole("alert");
      await inViewInsideTheBar(page, failed, "the failed-save alert");
      await page.unroute(`**/clients/${YUSUF}/routine`);

      // The save that lands.
      await bar(page, lang).getByRole("button", { name: L[lang].save, exact: true }).click();
      const saved = page.getByText(L[lang].saved);
      await expect(saved).toHaveRole("status");
      await inViewInsideTheBar(page, saved, "the saved notice");
      await shot(page, `saved-${lang}-390`);
      // Day 6 is still where the coach left it: nothing scrolled them away to read it.
      const d = await box(day6);
      expect(d.y, "day 6 is still on screen after the save").toBeLessThan(844);
      expect(d.y + d.height, "day 6 is still on screen after the save").toBeGreaterThan(0);

      // Publish (Yusuf has no injuries: the no-repairs dialog, one control).
      await bar(page, lang).getByRole("button", { name: L[lang].publish, exact: true }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: L[lang].publish, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      const published = page.getByText(L[lang].published);
      await expect(published).toHaveRole("status");
      await inViewInsideTheBar(page, published, "the published notice");
      await shot(page, `published-${lang}-390`);
    });

    test("the EV-201 AC4 sentence is on the page above the bar, never inside it", async ({ page, context, baseURL }) => {
      await longPlan(context, baseURL!);
      await signIn(page, lang);
      for (const [width, height] of [[1440, 900], ...PHONES] as const) {
        await page.setViewportSize({ width, height });
        await openLongPlan(page, lang);
        const hint = page.getByText(L[lang].hint, { exact: true });
        await expect(hint).toHaveCount(1);
        await expect(bar(page, lang).getByText(L[lang].hint, { exact: true })).toHaveCount(0);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const h = await box(hint);
        const b = await box(bar(page, lang));
        expect(h.y + h.height, `${width}: the sentence ends above the bar`).toBeLessThanOrEqual(b.y + 0.5);
        expect(h.y, `${width}: the sentence is on screen at the end`).toBeGreaterThanOrEqual(0);
        // And Publish names it as its description.
        await expect(bar(page, lang).getByRole("button", { name: L[lang].publish, exact: true })).toHaveAccessibleDescription(
          L[lang].hint
        );
      }
    });
  });
}

/* ═══ F1.4 — two columns from 1280, the aside above the editor below that ═══════════════ */

for (const lang of ["en", "fr"] as const) {
  test.describe(`F1.4 (${lang})`, () => {
    test.use({ locale: LOCALE[lang] });

    test("the aside holds the profile and « save as template »; beside from 1280, above below; the banner above both", async ({
      page,
      context,
      baseURL,
    }) => {
      await longPlan(context, baseURL!);
      await signIn(page, lang);
      await page.setViewportSize({ width: 1440, height: 900 });
      await openLongPlan(page, lang);
      const aside = page.locator(".prog-aside");
      const main = page.locator(".prog-main");
      await expect(aside.getByText(L[lang].profile, { exact: true })).toBeVisible();
      await expect(aside.getByRole("button", { name: L[lang].asTemplate, exact: true })).toBeVisible();
      await expect(main.getByLabel(L[lang].planName)).toBeVisible();
      // Yusuf's seed carries the EV-283b "trainee changed this plan" banner.
      const banner = page.getByRole("note").filter({ hasText: L[lang].changed });
      await expect(banner).toHaveCount(1);

      for (const width of [1440, 1280, 1279, 1024, 768, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const a = await box(aside);
        const m = await box(main);
        const n = await box(banner);
        expect(n.y + n.height, `${width}: the banner is above the aside`).toBeLessThanOrEqual(a.y + 0.5);
        expect(n.y + n.height, `${width}: the banner is above the editor`).toBeLessThanOrEqual(m.y + 0.5);
        if (width >= 1280) {
          expect(a.x, `${width}: the aside is to the right of the editor`).toBeGreaterThanOrEqual(m.x + m.width - 0.5);
          expect(Math.abs(a.y - m.y), `${width}: the two columns start on one line`).toBeLessThanOrEqual(1);
        } else {
          expect(a.y + a.height, `${width}: the aside is above the editor`).toBeLessThanOrEqual(m.y + 0.5);
          expect(Math.abs(a.x - m.x), `${width}: one column`).toBeLessThanOrEqual(1);
        }
      }
    });
  });
}

/* ═══ F1.5 — the pill: today's words, text, no time ════════════════════════════════════ */

for (const lang of ["en", "fr"] as const) {
  test.describe(`F1.5 (${lang})`, () => {
    test.use({ locale: LOCALE[lang] });

    test("published → edited → saved draft → reload → published, in words and without a date", async ({
      page,
      context,
      baseURL,
    }) => {
      await longPlan(context, baseURL!);
      await signIn(page, lang);
      await page.setViewportSize({ width: 1440, height: 900 });
      await openLongPlan(page, lang);
      const status = page.locator(".prog-status");
      await expect(status).toHaveText(L[lang].live);

      const name = page.getByLabel(L[lang].planName);
      await expect(async () => {
        await name.fill("");
        await name.fill("Six jours");
        await expect(status.getByText(L[lang].unsaved, { exact: true })).toBeVisible({ timeout: 1_000 });
      }).toPass();
      await expect(status.getByText(L[lang].draft, { exact: true })).toBeVisible();
      expect(await status.innerText(), "no date or time in the pill").not.toMatch(/\d/);
      await shot(page, `unsaved-${lang}-1440`);

      await bar(page, lang).getByRole("button", { name: L[lang].save, exact: true }).click();
      await expect(page.getByText(L[lang].saved)).toBeVisible();
      await expect(status.getByText(L[lang].unsaved, { exact: true })).toHaveCount(0);
      await expect(status).toHaveText(L[lang].draft);
      await shot(page, `saved-${lang}-1440`);

      await page.reload();
      await expect(status).toHaveText(L[lang].draft);
      expect(await status.innerText(), "no date or time in the pill").not.toMatch(/\d/);

      await bar(page, lang).getByRole("button", { name: L[lang].publish, exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: L[lang].publish, exact: true }).click();
      await expect(page.getByText(L[lang].published)).toBeVisible();
      await expect(status).toHaveText(L[lang].live);
      await shot(page, `published-${lang}-1440`);
    });
  });
}

/* ═══ F1.8 + X3 + X6 — not built, targets at 390, one language per page ════════════════ */

const FRENCH_ONLY = (() => {
  const strings = (value: unknown, out: string[] = []): string[] => {
    if (typeof value === "string") out.push(value);
    else if (value !== null && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
    return out;
  };
  const english = new Set(strings(en));
  return [...new Set(strings(fr))].filter((s) => s.trim().length >= 4 && !english.has(s));
})();

for (const lang of ["en", "fr"] as const) {
  test.describe(`F1.8/X3/X6 (${lang})`, () => {
    test.use({ locale: LOCALE[lang] });

    test("none of G4/G6–G9 is drawn, every control is a 44 px target at 390, and no string is in the other language", async ({
      page,
      context,
      baseURL,
    }) => {
      await longPlan(context, baseURL!);
      await signIn(page, lang);
      await page.setViewportSize({ width: 390, height: 844 });
      await openLongPlan(page, lang);

      // F1.8: no « Modifier (nouveau brouillon) », no history/version, no « identique sur le
      // téléphone », no autosave/« il y a » line, no inline replacement card, no pain signal.
      const text = await page.locator("main").innerText();
      expect(text).not.toMatch(
        /nouveau brouillon|new draft|historique|history|version \d|identique|identical|il y a|\bago\b|automatiquement|automatically|remplacer par|replace with|douleur|pain/i
      );

      // X3: every interactive element in the page, the bar and the tab bar is ≥ 44 × 44.
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll("a, button, input, select, textarea, [role=button]"))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (getComputedStyle(el).visibility === "hidden") continue;
          // The one exception X3 allows: a link inside a sentence.
          if (el.tagName === "A" && el.closest("p") && (el.closest("p")!.textContent ?? "").trim() !== (el.textContent ?? "").trim()) continue;
          if (r.width < 44 - 0.5 || r.height < 44 - 0.5)
            out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || (el as HTMLElement).innerText || "").slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
        return out;
      });
      expect(small, "controls under 44 × 44 at 390").toEqual([]);

      // X6.
      if (lang === "fr") {
        await expectNoEnglish(page, "/clients/{id}/routine");
      } else {
        const seen = await page.evaluate(() => {
          const out: string[] = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const parent = walker.currentNode.parentElement;
            if (parent?.closest("script, style, noscript, template")) continue;
            const t = (walker.currentNode.textContent ?? "").trim();
            if (t) out.push(t);
          }
          for (const el of Array.from(document.querySelectorAll("[aria-label], [title], [placeholder]")))
            for (const attr of ["aria-label", "title", "placeholder"]) {
              const v = el.getAttribute(attr)?.trim();
              if (v) out.push(v);
            }
          return out;
        });
        const leftovers = seen.filter((t) => FRENCH_ONLY.includes(t) || FRENCH_ONLY.some((f) => f.length >= 20 && t.includes(f)));
        expect(leftovers, "French UI strings on /clients/{id}/routine in an English browser").toEqual([]);
      }
    });
  });
}
