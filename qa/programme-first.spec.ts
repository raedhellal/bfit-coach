import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-342f (audit A6) — at 1024–1279 px the programme editor comes first.
 *
 *   F.1 At 1024×800 and 1180×820, FR and EN: the plan-name field and the first exercise row
 *       are inside the first viewport.
 *   F.2 The line reads « Blessures : {liste ou « aucune »} · Matériel : {n} » / "Injuries:
 *       {list or "none"} · Equipment: {n}" with a « Détails » / "Details" control that opens
 *       the full profile card in place.
 *   F.3 The plan-name input takes the full row; a 40-character name is shown entire.
 *   F.4 At ≥ 1280 px the layout is unchanged. Here as geometry (the card beside the editor,
 *       « Enregistrer comme modèle » right under it, the field's EV-337f1 width, no line);
 *       the pixel compare of c2768c2 against the branch at 1280 and 1440 (byte-identical
 *       PNGs, viewport and full page) is in the merge record. Screenshots are not committed:
 *       they are per-platform, and CI is Linux.
 *
 * F.1's exercise-row half is a `fixme` below, with the measurement that blocks it.
 *
 * "Inside the first viewport" = on a fresh load, scrolled to the top: the whole box between
 * the window's top and the sticky action bar's top, and the element itself at its centre
 * (nothing painted over it).
 *
 * Red on c2768c2: at 1024×800 the profile card and « Enregistrer comme modèle » come first
 * and Lina's plan-name field starts at y≈630, with no exercise on screen.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const TOBIAS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";

const LANG = {
  en: {
    locale: "en-US",
    planName: "Plan name",
    details: "Details",
    card: "Trainee profile",
    saveAsTemplate: "Save as template",
    lina: "Injuries: none · Equipment: 4",
    tobias: "Injuries: none · Equipment: not answered yet",
    danaStarts: "Injuries: Shoulders",
  },
  fr: {
    locale: "fr-FR",
    planName: "Nom du plan",
    details: "Détails",
    card: "Profil du client",
    saveAsTemplate: "Enregistrer comme modèle",
    lina: "Blessures\u00a0: aucune · Matériel\u00a0: 4",
    tobias: "Blessures\u00a0: aucune · Matériel\u00a0: pas encore renseigné",
    danaStarts: "Blessures\u00a0: Épaules",
  },
} as const;
type Lang = keyof typeof LANG;

const line = (page: Page) => page.locator(".prog-profile-line");
const card = (page: Page, lang: Lang) =>
  page.locator(".prog-profile-card").filter({ hasText: LANG[lang].card });

/** The first exercise of the first (open) day: a prescription is a named `group`. */
function firstExercise(page: Page): Locator {
  // The day card is a named group too ("Day 1"); the exercise rows are the groups inside it.
  return page.locator(".prog-main [role=group][aria-label] [role=group][aria-label]").first();
}

/** Fully inside [0, the sticky bar's top] at the current scroll, and hit at its centre. */
async function expectInFirstViewport(page: Page, el: Locator, label: string) {
  const r = await el.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const bar = document.querySelector(".action-bar");
    const barTop = bar ? bar.getBoundingClientRect().top : window.innerHeight;
    const floor = Math.min(window.innerHeight, barTop);
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return {
      top: Math.round(box.top),
      bottom: Math.round(box.bottom),
      floor: Math.round(floor),
      scrollY: window.scrollY,
      hit: hit !== null && (node === hit || node.contains(hit)),
    };
  });
  expect(r.scrollY, `${label}: measured at the top of the page`).toBe(0);
  expect(r.top, `${label}: top on screen`).toBeGreaterThanOrEqual(0);
  expect(r.bottom, `${label}: bottom above the action bar (${r.floor})`).toBeLessThanOrEqual(r.floor);
  expect(r.hit, `${label}: nothing painted over its centre`).toBe(true);
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`EV-342f, ${lang.toUpperCase()}`, () => {
    test.use({ locale: LANG[lang].locale });

    for (const [width, height] of [
      [1024, 800],
      [1180, 820],
    ] as const) {
      test(`F.1 + F.2 at ${width}×${height}: the line, then the editor; the plan name on the first screen`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await signInThroughForm(page, { lang });
        await page.goto(`/clients/${LINA}/routine`);
        const name = page.getByLabel(LANG[lang].planName, { exact: true });
        await expect(name).toBeVisible();
        await expectInFirstViewport(page, name, "the plan-name field");

        // F.2: the line, injuries readable without a click; the card closed, in place under it.
        await expect(line(page)).toBeVisible();
        await expect(page.locator(".prog-profile-text")).toHaveText(LANG[lang].lina);
        const toggle = line(page).getByRole("button", { name: LANG[lang].details, exact: true });
        await expect(toggle).toHaveAttribute("aria-expanded", "false");
        await expect(card(page, lang)).toBeHidden();
        // « Enregistrer comme modèle » comes AFTER the editor.
        const saveTpl = page.getByRole("button", { name: LANG[lang].saveAsTemplate });
        const [nameY, tplY] = await Promise.all([name.boundingBox(), saveTpl.boundingBox()]);
        expect(tplY!.y, "« Enregistrer comme modèle » is after the editor").toBeGreaterThan(nameY!.y);
        expect(
          await page.evaluate(() => {
            const main = document.querySelector(".prog-main")!;
            const aside = document.querySelector(".prog-aside")!;
            return main.getBoundingClientRect().bottom <= aside.getBoundingClientRect().top;
          }),
          "the template card starts below the whole editor"
        ).toBe(true);

        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-expanded", "true");
        await expect(card(page, lang)).toBeVisible();
        const [lineBox, cardBox, nameBox] = await Promise.all([
          line(page).boundingBox(),
          card(page, lang).boundingBox(),
          name.boundingBox(),
        ]);
        expect(cardBox!.y, "the card opens under the line").toBeGreaterThanOrEqual(lineBox!.y + lineBox!.height);
        expect(cardBox!.y + cardBox!.height, "and above the editor (in place)").toBeLessThanOrEqual(nameBox!.y);
        expect(await toggle.getAttribute("aria-controls")).toBe(await card(page, lang).getAttribute("id"));
        await toggle.click();
        await expect(card(page, lang)).toBeHidden();
      });

      /*
       * F.1's second half is NOT met by this slice, and is recorded here rather than left out.
       * Measured on the branch (Lina, EN): with the profile and the template card out of the
       * way, the editor's plan-settings card (goal, level, minutes, summary, progression rule,
       * weekdays) still runs from y=494 to ~860, so Day 1 starts at y=878 and its first
       * exercise row at y=1041 at 1024×800 (y=1022 at 1180×820), under the action bar at
       * 700 / 720. The PO's ruling moved the profile and « Enregistrer comme modèle » only;
       * moving or folding the settings card is a product decision, not taken here. Staff's
       * arithmetic: removing the settings card alone still leaves the row's bottom under the
       * bar at 1024×800, so the ruling has to cover the day header too, or restate F.1.
       */
      test.fixme(`EV-342f F.1 exercise-row half (pending senior-po ruling): at ${width}×${height} the first exercise row on the first screen`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await signInThroughForm(page, { lang });
        await page.goto(`/clients/${LINA}/routine`);
        await expectInFirstViewport(page, firstExercise(page), "the first exercise row");
      });
    }

    test("F.2: the line's other cases: injuries by name, and equipment never answered", async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 800 });
      await signInThroughForm(page, { lang });
      await page.goto(`/clients/${DANA}/routine`);
      await expect(page.locator(".prog-profile-text")).toContainText(LANG[lang].danaStarts);
      await page.goto(`/clients/${TOBIAS}/routine`);
      await expect(page.locator(".prog-profile-text")).toHaveText(LANG[lang].tobias);
    });
  });
}

test.describe("F.3 the plan name takes the row", () => {
  for (const width of [1024, 1180] as const) {
    test(`a 40-character name is shown entire at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await signInThroughForm(page);
      await page.goto(`/clients/${LINA}/routine`);
      const name = page.getByLabel("Plan name", { exact: true });
      const forty = "Intermediate Muscle Building Routine B2";
      expect(forty.length + 1).toBe(40);
      await name.fill(`${forty}!`);
      await expect(name).toHaveValue(`${forty}!`);
      const m = await name.evaluate((el) => {
        const input = el as HTMLInputElement;
        const row = input.closest(".prog-name")!.parentElement!.getBoundingClientRect();
        const box = input.getBoundingClientRect();
        return { scroll: input.scrollWidth, client: input.clientWidth, width: box.width, row: row.width };
      });
      expect(m.scroll, "the whole name fits the field: nothing scrolls inside it").toBeLessThanOrEqual(m.client);
      expect(Math.round(m.width), "the field is the whole row").toBe(Math.round(m.row));
    });
  }
});

test.describe("F.4 from 1280 px, unchanged", () => {
  for (const width of [1280, 1440] as const) {
    test(`at ${width} px: the card beside the editor, the template card under it, the field's width, no line`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await signInThroughForm(page);
      await page.goto(`/clients/${LINA}/routine`);
      await expect(line(page)).toBeHidden();
      await expect(card(page, "en")).toBeVisible();
      const g = await page.evaluate(() => {
        const r = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const main = r(".prog-main");
        const profile = r(".prog-profile");
        const aside = r(".prog-aside");
        return {
          mainTop: Math.round(main.top),
          mainRight: Math.round(main.right),
          profileTop: Math.round(profile.top),
          profileLeft: Math.round(profile.left),
          profileBottom: Math.round(profile.bottom),
          asideTop: Math.round(aside.top),
          asideLeft: Math.round(aside.left),
          input: Math.round(r("#plan-name").width),
          row: Math.round(document.querySelector("#plan-name")!.closest(".prog-name")!.parentElement!.getBoundingClientRect().width),
        };
      });
      expect(g.profileTop, "the profile card is level with the editor").toBe(g.mainTop);
      expect(g.profileLeft, "in the second column").toBeGreaterThan(g.mainRight);
      expect(g.asideLeft, "the template card in the same column").toBe(g.profileLeft);
      expect(g.asideTop, "right under the profile card").toBe(g.profileBottom);
      // EV-337f1's `min(360px, 100%)` of a shrink-to-fit box (235 px measured on c2768c2 and on
      // the branch): never the whole row, which is the narrow layout's F.3.
      expect(g.input, "the field keeps EV-337f1's width").toBeLessThanOrEqual(360);
      expect(g.input, "not the whole row").toBeLessThan(g.row);
    });
  }
});

/* The configs' project is Chromium; WebKit is launched here, like focus-clear-of-bars.spec.ts. */
test.describe("EV-342f in WebKit, French, 1024×800", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  test("the line first, the plan name on the first screen, « Détails » opens the card in place", async ({ baseURL }) => {
    const context = await browser.newContext({ baseURL, locale: "fr-FR", viewport: { width: 1024, height: 800 } });
    await context.addCookies([{ name: "evoli_pro_locale", value: "fr", url: baseURL! }]);
    const page = await context.newPage();
    try {
      await signInThroughForm(page, { lang: "fr" });
      await page.goto(`/clients/${LINA}/routine`);
      const name = page.getByLabel("Nom du plan", { exact: true });
      await expect(name).toBeVisible();
      await expectInFirstViewport(page, name, "the plan-name field");
      await expect(page.locator(".prog-profile-text")).toHaveText(LANG.fr.lina);
      await expect(card(page, "fr")).toBeHidden();
      await line(page).getByRole("button", { name: "Détails", exact: true }).click();
      await expect(card(page, "fr")).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
