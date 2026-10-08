import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoSidewaysScroll } from "./layout";
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
 * F.1's exercise-row half is EV-344's, as `D-FOLD-1` (A) restates it (EV-344.2A, below the
 * F.1 + F.2 test): Day 1's header on the first screen and the first exercise's top within
 * 100 px of the bar. EV-344's own ACs (the folded plan settings) are the last blocks here.
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
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";

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
const settingsLine = (page: Page) => page.locator(".plan-settings-line");
const card = (page: Page, lang: Lang) =>
  page.locator(".prog-profile-card").filter({ hasText: LANG[lang].card });

/**
 * EV-344.2A — the first training day that holds an exercise (Day 1 for Lina), as a named
 * `group` whose header is the `h3.day-acc-head`; its exercise rows are the named groups in its
 * body. Returned with its name, so a failure says which day was measured (the edge case "QA
 * records which").
 */
function firstDayWithExercise(page: Page) {
  const day = page
    .locator(".prog-main [role=group][aria-label]:has(> h3.day-acc-head)")
    .filter({ has: page.locator(".day-acc-body [role=group][aria-label]") })
    .first();
  return {
    day,
    header: day.locator(":scope > h3.day-acc-head"),
    firstRow: day.locator(".day-acc-body [role=group][aria-label]").first(),
  };
}

/** EV-344.2A (3): the row's top is at most 100 px under the sticky bar's top. */
async function expectRowWithin100OfBar(page: Page, row: Locator, label: string) {
  const r = await row.evaluate((node) => {
    const bar = document.querySelector(".action-bar");
    return {
      top: Math.round(node.getBoundingClientRect().top),
      barTop: bar ? Math.round(bar.getBoundingClientRect().top) : null,
      scrollY: window.scrollY,
    };
  });
  expect(r.barTop, `${label}: the sticky action bar is on the page`).not.toBeNull();
  expect(r.scrollY, `${label}: measured at the top of the page`).toBe(0);
  expect(r.top - r.barTop!, `${label}: top ${r.top} at most 100 px under the bar's top ${r.barTop}`).toBeLessThanOrEqual(100);
}

/** EV-344.2A, (1) to (3), on a page already loaded at the top. */
async function expectDayOneOnFirstScreen(page: Page, planName: string, label: string) {
  const name = page.getByLabel(planName, { exact: true });
  await expect(name).toBeVisible();
  await expectInFirstViewport(page, name, `${label}: the plan-name field`);
  const { day, header, firstRow } = firstDayWithExercise(page);
  await expect(header).toBeVisible();
  test.info().annotations.push({ type: "EV-344.2A day", description: `${label}: ${await day.getAttribute("aria-label")}` });
  await expectInFirstViewport(page, header, `${label}: the first day's header`);
  await expectRowWithin100OfBar(page, firstRow, `${label}: the first exercise row`);
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
       * EV-344.8 — F.1's exercise-row half, as `D-FOLD-1` (A) restates it (EV-344.2A). F.1's
       * WHOLE-ROW form ("the first exercise row is inside the first viewport") cannot be met
       * without hiding content EV-344.6 keeps visible. Ruling EV-344-R1 (senior-po, 2026-10-08)
       * sent the choice to Raed as `D-FOLD-1`; option (A), which withdraws the whole-row form,
       * was taken by the orchestrating session under Raed's 2026-10-08 overnight delegation,
       * and it is reversible. Measured by EV-344.1's probe (`c736eb9`, Lina, EN = FR):
       * the first row (Barbell Bench Press) at y 779, h 319 → bottom 1098 against the bar's top
       * at 700 (1024×800), and y 779, h 245 → bottom 1024 against 720 (1180×820). These were the
       * four `test.fixme` at 6caecb8, renamed and un-fixme'd; they now assert (2) the
       * first day's header wholly between the window's top and the bar's top, hit at its
       * centre, and (3) the first row's top at most 100 px under the bar's top.
       */
      test(`EV-342f F.1 exercise-row half (EV-344): at ${width}×${height} Day 1's header on the first screen, the first exercise within 100 px of the bar`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height });
        await signInThroughForm(page, { lang });
        await page.goto(`/clients/${LINA}/routine`);
        const { day, header, firstRow } = firstDayWithExercise(page);
        await expect(header).toBeVisible();
        test.info().annotations.push({ type: "EV-344.2A day", description: String(await day.getAttribute("aria-label")) });
        await expectInFirstViewport(page, header, "the first day's header");
        await expectRowWithin100OfBar(page, firstRow, "the first exercise row");
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
      // EV-344.7: no fold from 1280 px; the plan settings are on the page as at 6caecb8.
      await expect(settingsLine(page)).toBeHidden();
      await expect(page.getByRole("button", { name: "Edit settings" })).toHaveCount(0);
      await expect(page.getByRole("spinbutton", { name: "Minutes per session", exact: true })).toBeVisible();
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

/* EV-344.2A in WebKit: the same four cases as the Chromium tests above. `next dev` (this
   config) serves the session cookie without `Secure`, which WebKit needs on http://localhost. */
test.describe("EV-344.2A in WebKit", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  for (const lang of ["en", "fr"] as const) {
    for (const [width, height] of [
      [1024, 800],
      [1180, 820],
    ] as const) {
      test(`${lang.toUpperCase()} ${width}×${height}: the plan name and Day 1's header on the first screen, the first exercise within 100 px of the bar`, async ({
        baseURL,
      }) => {
        const context = await browser.newContext({
          baseURL,
          locale: LANG[lang].locale,
          extraHTTPHeaders: { "Accept-Language": LANG[lang].locale },
          viewport: { width, height },
        });
        await context.addCookies([{ name: "evoli_pro_locale", value: lang, url: baseURL! }]);
        const page = await context.newPage();
        try {
          await signInThroughForm(page, { lang });
          await page.goto(`/clients/${LINA}/routine`);
          await expectDayOneOnFirstScreen(page, LANG[lang].planName, `WebKit ${lang} ${width}×${height}`);
        } finally {
          await context.close();
        }
      });
    }
  }
});

/* ── EV-344: the plan settings folded to one line below 1280 px ───────────────────────────── */

const FOLD = {
  en: {
    // EV-344's ruling records it: the card prints the api's goal and level tokens in English.
    line: "BUILD_MUSCLE · INTERMEDIATE · 45\u00a0min",
    toggle: "Edit settings",
    goal: "Goal",
    level: "Level",
    minutes: "Minutes per session",
    summary: "Summary",
    heading: "Training days — Evoli enforces these.",
    bar: "Routine actions",
    publish: "Publish",
    published: /^Published\. /,
    saveDraft: "Save draft",
    saved: /^Draft saved /,
    build: "Build a plan",
    // EV-344-R2, verbatim.
    outOfRange: "Minutes per session: enter a value between 20 and 90.",
    // EV-344-R3, verbatim.
    pendingSentence: "Set from their profile when you save.",
  },
  fr: {
    line: "Prise de muscle · Intermédiaire · 45\u00a0min",
    toggle: "Modifier les réglages",
    goal: "Objectif",
    level: "Niveau",
    minutes: "Minutes par séance",
    summary: "Résumé",
    heading: "Jours d'entraînement — Evoli les applique.",
    bar: "Actions du programme",
    publish: "Publier",
    published: /^Publié\. /,
    saveDraft: "Enregistrer le brouillon",
    saved: /^Brouillon enregistré à /,
    build: "Créer un plan",
    // EV-344-R2, verbatim; U+00A0 before the colon is the house rule (BUG-462).
    outOfRange: "Minutes par séance\u00a0: indiquez une valeur entre 20 et 90.",
    pendingSentence: "Repris de son profil à l'enregistrement.",
  },
} as const;

const settingsToggle = (page: Page, lang: Lang) =>
  settingsLine(page).getByRole("button", { name: FOLD[lang].toggle, exact: true });
const settingsCard = (page: Page) => page.locator(".plan-settings-card");

async function openLina(page: Page, lang: Lang, width: number, height = 800) {
  await page.setViewportSize({ width, height });
  await signInThroughForm(page, { lang });
  await page.goto(`/clients/${LINA}/routine`);
  await expect(settingsLine(page)).toBeVisible();
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`EV-344, ${lang.toUpperCase()}`, () => {
    test.use({ locale: LANG[lang].locale });

    test("EV-344.3: the folded line reads the card's values; the button is ≥ 44 px, reached by Tab, and toggles in place", async ({
      page,
    }) => {
      await openLina(page, lang, 1024);
      await expect(page.locator(".plan-settings-text")).toHaveText(FOLD[lang].line);
      const toggle = settingsToggle(page, lang);
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(await toggle.getAttribute("aria-controls")).toBe(await settingsCard(page).getAttribute("id"));
      await expect(settingsCard(page)).toBeHidden();
      expect((await toggle.boundingBox())!.height, "the button is at least 44 px high").toBeGreaterThanOrEqual(44);

      // Reached by Tab: the next stop after the plan name.
      await page.getByLabel(LANG[lang].planName, { exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(settingsCard(page)).toBeVisible();
      await expect(toggle, "focus stays on the button").toBeFocused();

      // The same values as the open card, read from the card's own fields.
      const goal = await page.getByLabel(FOLD[lang].goal, { exact: true }).inputValue();
      const level = await page.getByLabel(FOLD[lang].level, { exact: true }).inputValue();
      const minutes = await page.getByRole("spinbutton", { name: FOLD[lang].minutes, exact: true }).inputValue();
      expect(goal.length * level.length * minutes.length, "the card's three values were read").toBeGreaterThan(0);
      await expect(page.locator(".plan-settings-text")).toHaveText(`${goal} · ${level} · ${minutes}\u00a0min`);

      // In place: under the line, above « Jours d'entraînement ».
      const [lineBox, cardBox, headingBox] = await Promise.all([
        settingsLine(page).boundingBox(),
        settingsCard(page).boundingBox(),
        page.getByRole("heading", { name: FOLD[lang].heading, exact: true }).boundingBox(),
      ]);
      expect(cardBox!.y, "the card opens under the line").toBeGreaterThanOrEqual(lineBox!.y + lineBox!.height);
      expect(cardBox!.y + cardBox!.height, "and above the training days").toBeLessThanOrEqual(headingBox!.y);
      // Edge case: with the card open, the bar does not cover the button that folds it.
      await expectInFirstViewport(page, toggle, "the open card's fold button");

      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(settingsCard(page)).toBeHidden();
      await expect(toggle).toBeFocused();
      // A click does the same.
      await toggle.click();
      await expect(settingsCard(page)).toBeVisible();
      await toggle.click();
      await expect(settingsCard(page)).toBeHidden();
    });

    test("EV-344.3: folded at 1279; at 768 and 390 px the line wraps, nothing is cut, nothing scrolls sideways", async ({ page }) => {
      // 1279: the last width of the fold (staff nit 4; a `max-width: 1199px` rule goes red here).
      await openLina(page, lang, 1279);
      await expect(page.locator(".plan-settings-text")).toHaveText(FOLD[lang].line);
      await expect(settingsCard(page), "1279: the card is folded").toBeHidden();
      for (const width of [768, 390] as const) {
        await page.setViewportSize({ width, height: 800 });
        await expect(settingsLine(page)).toBeVisible();
        const m = await settingsLine(page).evaluate((el) => {
          const text = el.querySelector(".plan-settings-text") as HTMLElement;
          const button = el.querySelector("button") as HTMLElement;
          const cut = (n: HTMLElement) =>
            n.scrollWidth > n.clientWidth + 1 || getComputedStyle(n).textOverflow === "ellipsis";
          const line = el.getBoundingClientRect();
          return {
            textCut: cut(text),
            buttonCut: cut(button),
            lineCut: cut(el as HTMLElement),
            inside: button.getBoundingClientRect().right <= line.right + 0.5 && text.getBoundingClientRect().right <= line.right + 0.5,
            wrapped: button.getBoundingClientRect().top >= text.getBoundingClientRect().bottom - 0.5,
            text: text.textContent,
          };
        });
        expect(m.text, `${width}: the whole line is there`).toBe(FOLD[lang].line);
        expect(m.textCut, `${width}: the values are not cut`).toBe(false);
        expect(m.buttonCut, `${width}: the button's label is not cut`).toBe(false);
        expect(m.lineCut, `${width}: the line does not overflow`).toBe(false);
        expect(m.inside, `${width}: text and button inside the line`).toBe(true);
        if (width === 390) expect(m.wrapped, "390: the button wraps under the values").toBe(true);
        await expectNoSidewaysScroll(page, `EV-344.3 ${lang} ${width}`);
      }
    });

    test("EV-344.4: an edit is kept through a fold, shows on the line, and leaving still asks", async ({ page }) => {
      await openLina(page, lang, 1024);
      const toggle = settingsToggle(page, lang);
      await toggle.click();
      const minutes = page.getByRole("spinbutton", { name: FOLD[lang].minutes, exact: true });
      const summary = page.getByRole("textbox", { name: FOLD[lang].summary, exact: true });
      await minutes.fill("50");
      await summary.fill("EV-344 summary kept through a fold");
      await toggle.click();
      await expect(settingsCard(page)).toBeHidden();
      await expect(page.locator(".plan-settings-text")).toHaveText(FOLD[lang].line.replace("45", "50"));
      await toggle.click();
      await expect(minutes).toHaveValue("50");
      await expect(summary).toHaveValue("EV-344 summary kept through a fold");
      await toggle.click();
      await expect(settingsCard(page)).toBeHidden();

      // `useUnsavedChanges` still guards the folded edit.
      await page.getByRole("link", { name: "Nutrition", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveAccessibleName(
        lang === "en" ? "Leave with unsaved changes?" : "Quitter sans enregistrer ?"
      );
    });

    test("EV-344.4: a change that reaches a folded field opens the card (a restore, BUG-687's replay)", async ({ page }) => {
      await openLina(page, lang, 1024);
      // Not a coach's typing: nobody can type into a `display: none` field. Written past React's
      // value tracker, then an `input` event, the way a Back/Forward restore or the replay lands.
      const hidden = await page.getByLabel(FOLD[lang].minutes, { exact: true }).elementHandle();
      await expect(settingsCard(page)).toBeHidden();
      await hidden!.evaluate((el) => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        set.call(el, "55");
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await expect(settingsToggle(page, lang)).toHaveAttribute("aria-expanded", "true");
      await expect(settingsCard(page)).toBeVisible();
      await expect(page.getByRole("spinbutton", { name: FOLD[lang].minutes, exact: true })).toHaveValue("55");
      await expect(page.locator(".plan-settings-text")).toHaveText(FOLD[lang].line.replace("45", "55"));
    });

    /*
     * EV-344-R2 / EV-344.5A — b-fit-api's database refuses a published plan whose session is
     * outside 20–90 min (V11 `chk_plans_session_minutes`), so the editor lists the reason and
     * sends nothing, as it does for every other refusal it can foresee (ADR-0016 V1b). The
     * request log is a server action POST (`next-action` header); 90 at the end is the
     * control that the log does see a save.
     */
    test("EV-344.5A: minutes at 120 are listed, aria-invalid, and neither Save nor Publish is sent; 90 clears it", async ({
      page,
    }) => {
      await openLina(page, lang, 1024);
      const actions: string[] = [];
      page.on("request", (r) => {
        if (r.method() === "POST" && r.headers()["next-action"] !== undefined) actions.push(r.url());
      });
      const toggle = settingsToggle(page, lang);
      await toggle.click();
      const minutes = page.getByRole("spinbutton", { name: FOLD[lang].minutes, exact: true });
      await expect(minutes).not.toHaveAttribute("aria-invalid", "true");
      await minutes.fill("120");
      const reason = page.getByText(FOLD[lang].outOfRange, { exact: true });
      await expect(reason).toBeVisible();
      await expect(reason).toHaveText(FOLD[lang].outOfRange);
      await expect(minutes).toHaveAttribute("aria-invalid", "true");

      const bar = page.getByRole("region", { name: FOLD[lang].bar, exact: true });
      for (const name of [FOLD[lang].saveDraft, FOLD[lang].publish]) {
        const button = bar.getByRole("button", { name, exact: true });
        await expect(button, `${name} is not offered while the reason stands`).toBeDisabled();
        await button.click({ force: true });
      }
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.waitForTimeout(500);
      expect(actions, "no Save or Publish request was sent at 120").toEqual([]);

      // Folded: the line carries the value as typed, and the reason is still listed.
      await toggle.click();
      await expect(settingsCard(page)).toBeHidden();
      await expect(page.locator(".plan-settings-text")).toHaveText(new RegExp(` · 120\u00a0min$`));
      await expect(reason).toBeVisible();

      await toggle.click();
      await minutes.fill("90");
      await expect(reason).toHaveCount(0);
      await expect(minutes).not.toHaveAttribute("aria-invalid", "true");
      // Control: the log sees a save once the reason is gone.
      await bar.getByRole("button", { name: FOLD[lang].saveDraft, exact: true }).click();
      await expect.poll(() => actions.length, { message: "the save at 90 was sent" }).toBeGreaterThan(0);
      await expect(page.getByText(FOLD[lang].saved)).toBeVisible();
    });

    test("EV-344.5A item 3: a draft that loads at 120 opens the card on load; the toggle still folds it", async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([{ name: "evoli_fixture_draft_minutes", value: `${LINA}:120`, url: baseURL! }]);
      await openLina(page, lang, 1024);
      const toggle = settingsToggle(page, lang);
      await expect(toggle, "open on load").toHaveAttribute("aria-expanded", "true");
      await expect(settingsCard(page)).toBeVisible();
      await expect(page.getByRole("spinbutton", { name: FOLD[lang].minutes, exact: true })).toHaveValue("120");
      await expect(page.getByText(FOLD[lang].outOfRange, { exact: true })).toBeVisible();
      await expect(toggle).toBeEnabled();
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(settingsCard(page)).toBeHidden();
      await expect(page.locator(".plan-settings-text")).toHaveText(new RegExp(` · 120\u00a0min$`));
      await expect(page.getByText(FOLD[lang].outOfRange, { exact: true })).toBeVisible();
    });

    test("EV-344-R3: a plan built from scratch says the profile sentence once on the folded line", async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 800 });
      await signInThroughForm(page, { lang });
      await page.goto(`/clients/${NILS}/routine`);
      await page.getByRole("button", { name: FOLD[lang].build, exact: true }).click();
      const text = page.locator(".plan-settings-text");
      await expect(text).toHaveText(`${FOLD[lang].pendingSentence} · 45\u00a0min`);
      const shown = (await text.textContent()) ?? "";
      expect(shown.split(FOLD[lang].pendingSentence).length - 1, "the sentence occurs exactly once").toBe(1);
    });

    /*
     * Staff S1 (review of 889598f): the open state is held by `RoutineEditor`, so the remount
     * after a publish (`loads`, BUG-490) does not fold the card the coach is working in. Red
     * with `settingsOpen` / `onSettingsOpenChange` no longer passed (the editor's own state
     * restarts closed on the remount).
     */
    test("EV-344: the open settings card stays open through the publish re-seed (Yusuf's long plan, 1024)", async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([{ name: "evoli_fixture_long_plan", value: YUSUF, url: baseURL! }]);
      await page.setViewportSize({ width: 1024, height: 800 });
      await signInThroughForm(page, { lang });
      await page.goto(`/clients/${YUSUF}/routine`);
      const toggle = settingsToggle(page, lang);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      const minutes = page.getByRole("spinbutton", { name: FOLD[lang].minutes, exact: true });
      await minutes.fill("50");
      // Held across the publish: if it is detached afterwards, the editor DID remount.
      const before = await minutes.elementHandle();
      const bar = page.getByRole("region", { name: FOLD[lang].bar, exact: true });
      await bar.getByRole("button", { name: FOLD[lang].publish, exact: true }).click();
      await page.getByRole("dialog").getByRole("button", { name: FOLD[lang].publish, exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByText(FOLD[lang].published)).toBeVisible();
      await expect
        .poll(() => before!.evaluate((el) => el.isConnected), { message: "the publish re-seed remounted the editor" })
        .toBe(false);
      await expect(toggle, "still open after the re-seed").toHaveAttribute("aria-expanded", "true");
      await expect(settingsCard(page)).toBeVisible();
      await expect(minutes).toHaveValue("50");
    });

    test("EV-344.6: below 1280 px nothing is lost — names, ≥ 44 px, the Tab order of 1440, the heading verbatim", async ({
      page,
    }) => {
      // The Tab order from the plan name at 1440 (no fold): the reference.
      await page.setViewportSize({ width: 1440, height: 900 });
      await signInThroughForm(page, { lang });
      await page.goto(`/clients/${LINA}/routine`);
      const wide = await tabOrderFromPlanName(page, lang, 14);
      // Not vacuous: the card's four fields are the first stops after the plan name.
      expect(wide.slice(0, 4)).toEqual([
        `input:${FOLD[lang].goal}`,
        `input:${FOLD[lang].level}`,
        `input:${FOLD[lang].minutes}`,
        `textarea:${FOLD[lang].summary}`,
      ]);

      await page.setViewportSize({ width: 1024, height: 800 });
      await page.reload();
      await expect(settingsLine(page)).toBeVisible();
      await expect(page.getByRole("heading", { name: FOLD[lang].heading, exact: true })).toBeVisible();
      await settingsToggle(page, lang).click();
      const narrow = await tabOrderFromPlanName(page, lang, 15);
      expect(narrow[0], "the fold's button comes right after the plan name").toBe(FOLD[lang].toggle);
      expect(narrow.slice(1), "the same controls in the same order as at 1440").toEqual(wide);

      // The card's fields and Day 1's, each visible with its name and at least 44 px high.
      const day = firstDayWithExercise(page).day;
      const controls: Array<[string, Locator]> = [
        ["goal", page.getByLabel(FOLD[lang].goal, { exact: true })],
        ["level", page.getByLabel(FOLD[lang].level, { exact: true })],
        ["minutes", page.getByRole("spinbutton", { name: FOLD[lang].minutes, exact: true })],
        ["summary", page.getByRole("textbox", { name: FOLD[lang].summary, exact: true })],
        ["Day 1's header", day.locator(":scope > h3.day-acc-head button")],
        ["Day 1's weekday", day.locator(".day-acc-body select").first()],
        ["Day 1's remove", day.locator(".day-acc-body button").first()],
      ];
      for (const [label, control] of controls) {
        await expect(control, `${label} is on the page`).toBeVisible();
        expect((await control.boundingBox())!.height, `${label} is at least 44 px high`).toBeGreaterThanOrEqual(44);
      }
      const dayFields = day.locator(".day-acc-body input");
      expect(await dayFields.count(), "Day 1's fields and its exercises' fields").toBeGreaterThan(3);
      for (const field of await dayFields.all()) {
        if (!(await field.isVisible())) continue;
        expect((await field.boundingBox())!.height, "every Day 1 field is at least 44 px high").toBeGreaterThanOrEqual(44);
      }
    });
  });
}

/** The accessible names of the next `n` Tab stops after the plan-name field. */
async function tabOrderFromPlanName(page: Page, lang: Lang, n: number): Promise<string[]> {
  await page.getByLabel(LANG[lang].planName, { exact: true }).focus();
  const names: string[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    names.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return "(none)";
        const labelled = el.getAttribute("aria-label");
        const label = (el as HTMLInputElement).labels?.[0]?.textContent;
        return `${el.tagName.toLowerCase()}:${(labelled ?? label ?? el.textContent ?? "").trim()}`;
      })
    );
  }
  return names.map((name) => (name.endsWith(`:${FOLD[lang].toggle}`) ? FOLD[lang].toggle : name));
}

test.describe("EV-344: the template editor is not folded", () => {
  test("at 1024 px a template's goal, level and minutes are on the page without a click, and no 20–90 reason", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await signInThroughForm(page);
    await page.goto("/templates/7c2d0a11-0000-4000-8000-0000000000b1");
    await expect(page.getByRole("combobox", { name: "Goal", exact: true })).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: "Minutes per session", exact: true })).toBeVisible();
    await expect(settingsLine(page)).toHaveCount(0);
    await expect(page.locator(".prog-doc")).toHaveCount(0);
    // EV-344.5A item 4: a template has no 20–90 reason at any value.
    const minutes = page.getByRole("spinbutton", { name: "Minutes per session", exact: true });
    await minutes.fill("120");
    await expect(minutes).toHaveValue("120");
    await expect(page.getByText("Minutes per session: enter a value between 20 and 90.")).toHaveCount(0);
    await expect(minutes).not.toHaveAttribute("aria-invalid", /.*/);
  });
});
