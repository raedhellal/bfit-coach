import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, webkit, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoSidewaysScroll } from "./layout";
import { expectNoEnglish } from "./french";
import { openTargetsForm } from "./targets-card";

/**
 * EV-337g1 — the client's nutrition page in the Evoli Pro frame (`/clients/{id}/nutrition`,
 * plan §5.4, story § Split: G1.1–G1.5, ruling 16, X1–X8).
 *
 * Every sentence and label is a LITERAL, never read from copy.ts: a check derived from its
 * subject cannot witness it. The fixture's Lina holds AUTO targets 2150 kcal / 150 g / 215 g
 * / 68 g with activity MODERATE (`coachApi.fixture.ts` `nutritionState`); Nils holds neither
 * targets nor a week; Sara does not share NUTRITION. The load error is EV-337m M7's switch
 * (`evoli_fixture_summary_read=nutrition:500:<id>`): the nutrition read alone fails, the
 * overview (and so the name) is read.
 *
 * Screenshots (1440 and 390, each language, each state) are written to `$EV337G1_EVIDENCE`
 * when it is set, and nowhere otherwise.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const SARA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0003";

/** The brief's five widths, plus story X1's either side of each breakpoint. */
const WIDTHS = [1440, 1280, 1024, 768, 390] as const;
const X1_WIDTHS = [1440, 1280, 1279, 1024, 1023, 768, 767, 390, 320] as const;
/** G1.3 (BUG-252): the five phones. */
const PHONES = [320, 340, 360, 375, 390] as const;

type Lang = "en" | "fr";
const LOCALE: Record<Lang, string> = { en: "en-US", fr: "fr-FR" };
const L = {
  en: {
    title: "Nutrition",
    targets: "Daily targets",
    edit: "Edit targets",
    save: "Save targets",
    cancel: "Cancel",
    dialog: "Save targets?",
    saved: "Targets saved.",
    floor: "Calories raised to a safe minimum of 1200 kcal.",
    terms: ["Calories", "Protein", "Carbs", "Fat"],
    lina: ["2,150 kcal", "150 g", "215 g", "68 g"],
    lina2300: "2,300 kcal",
    lina1200: "1,200 kcal",
    source: "Calculated automatically",
    pill: "Activity level: Moderately active",
    macros: "Your macros add up to 2,072 kcal — 78 below the calorie target.",
    // G1.2f: 2300 typed against the stored macros' 2,072; the floor's stored 1200 against them.
    macros2300: "Your macros add up to 2,072 kcal — 228 below the calorie target.",
    macros1200: "Your macros add up to 2,072 kcal — 872 above the calorie target.",
    refused: "Enter a number above 0.",
    failed: "The targets could not be saved.",
    noAnswer: "We couldn't confirm whether the targets were saved. Reload the page before you try again.",
    profile: "Trainee profile",
    profileNote: "From the trainee's profile — you cannot change these here.",
    routineTab: "Routine",
    leave: "Leave with unsaved changes?",
    noTargets: "No targets set.",
    empty: "No nutrition set up yet",
    scope: "This trainee has not shared their nutrition with you.",
    loadError: "This trainee's nutrition could not be loaded.",
    foodLog: "Food log",
    restDay: /rest day/i,
  },
  fr: {
    title: "Nutrition",
    targets: "Objectifs quotidiens",
    edit: "Modifier les objectifs",
    save: "Enregistrer les objectifs",
    cancel: "Annuler",
    dialog: "Enregistrer les objectifs ?",
    saved: "Objectifs enregistrés.",
    floor: "Calories relevées au minimum sûr de 1 200 kcal.",
    terms: ["Calories", "Protéines", "Glucides", "Lipides"],
    lina: ["2 150 kcal", "150 g", "215 g", "68 g"],
    lina2300: "2 300 kcal",
    lina1200: "1 200 kcal",
    source: "Calculés automatiquement",
    pill: "Niveau d'activité : Modérément actif",
    macros: "Vos macros totalisent 2 072 kcal — 78 en dessous de l'objectif calorique.",
    macros2300: "Vos macros totalisent 2 072 kcal — 228 en dessous de l'objectif calorique.",
    macros1200: "Vos macros totalisent 2 072 kcal — 872 au-dessus de l'objectif calorique.",
    refused: "Saisissez un nombre supérieur à 0.",
    failed: "Les objectifs n'ont pas pu être enregistrés.",
    noAnswer: "Nous n'avons pas pu confirmer si les objectifs ont été enregistrés. Rechargez la page avant de réessayer.",
    profile: "Profil du client",
    profileNote: "Issu du profil du client — vous ne pouvez pas le modifier ici.",
    routineTab: "Programme",
    leave: "Quitter sans enregistrer ?",
    noTargets: "Aucun objectif défini.",
    empty: "Aucune nutrition configurée pour l'instant",
    scope: "Ce client n'a pas partagé sa nutrition avec vous.",
    loadError: "La nutrition de ce client n'a pas pu être chargée.",
    foodLog: "Journal alimentaire",
    restDay: /jours? de repos/i,
  },
} as const;

const EVIDENCE = process.env.EV337G1_EVIDENCE;
async function shot(page: Page, name: string) {
  if (!EVIDENCE) return;
  mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: join(EVIDENCE, `${name}.png`), fullPage: true });
}

async function signIn(page: Page, lang: Lang) {
  await signInThroughForm(page, { lang });
}

async function box(locator: Locator, what: string) {
  const b = await locator.boundingBox();
  expect(b, `${what} has a box`).not.toBeNull();
  return b!;
}

/** The text with every run of white space (U+00A0 and U+202F included) as one space. */
function plain(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function targetsRegion(page: Page, lang: Lang) {
  return page.getByRole("region", { name: L[lang].targets, exact: true });
}

/** The four blocks of the frame, each by its name (a region, or the page's named hook). */
function blocks(page: Page, lang: Lang) {
  return {
    targets: targetsRegion(page, lang),
    diet: page.locator('[data-nut-block="diet"]'),
    week: page.locator('[data-nut-block="week"]'),
    foodLog: page.getByRole("region", { name: L[lang].foodLog, exact: true }),
  };
}

/** Lina's targets PUTs the fixture answered since the test's reset. */
async function targetPuts(page: Page): Promise<number> {
  const res = await page.request.get("/api/fixture/calls");
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  const body = (await res.json()) as { calls: string[] };
  return body.calls.filter((c) => c.startsWith(`PUT /coach-portal/clients/${LINA}/nutrition/targets`)).length;
}

async function hydrated(page: Page) {
  await expect(page.locator("[data-nav-progress-ready]"), "hydrated").toHaveCount(1);
}

/** The `<dl>`'s terms and values, in order, as a person reads them. */
async function tiles(region: Locator) {
  const dl = region.locator("dl");
  await expect(dl, "the targets are one <dl>").toHaveCount(1);
  return dl.evaluate((el) => {
    const terms = Array.from(el.querySelectorAll("dt")).map((n) => n.textContent ?? "");
    const values = Array.from(el.querySelectorAll("dd")).map((n) => n.textContent ?? "");
    return { terms, values };
  });
}

/**
 * Every `<dd>` of the targets: its number and unit on ONE line (Range rects of the whole
 * text), nothing clipped (scrollWidth), and inside its tile and the viewport.
 */
async function tilesWhole(region: Locator) {
  return region.locator("dl").evaluate((dl) => {
    const problems: string[] = [];
    const vw = document.documentElement.clientWidth;
    for (const dd of Array.from(dl.querySelectorAll("dd"))) {
      const range = document.createRange();
      range.selectNodeContents(dd);
      // The number (20 px) and the unit (13 px) share a baseline, not a top or a centre: two
      // pieces are on one line when their boxes overlap vertically, on two when they do not.
      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0);
      const text = (dd.textContent ?? "").replace(/\s+/g, " ");
      const apart = rects.filter((r) => !rects.every((o) => r.top < o.bottom && r.bottom > o.top));
      if (apart.length > 0) problems.push(`${text}: on more than one line`);
      if (dd.scrollWidth - dd.clientWidth > 1) problems.push(`${text}: clipped by ${dd.scrollWidth - dd.clientWidth}px`);
      const tile = dd.parentElement!.getBoundingClientRect();
      const r = range.getBoundingClientRect();
      if (r.right > tile.right + 0.5 || r.left < tile.left - 0.5) problems.push(`${text}: runs out of its tile`);
      if (r.right > vw + 0.5) problems.push(`${text}: runs past the viewport`);
    }
    return problems;
  });
}

/* ═══ G1.5 — the page stays server-rendered ══════════════════════════════════════════════ */

test("G1.5: the nutrition page is a server component (no \"use client\" in page.tsx)", () => {
  const source = readFileSync(join(__dirname, "../src/app/clients/[id]/nutrition/page.tsx"), "utf8");
  expect(source).not.toMatch(/^\s*["']use client["']/m);
});

for (const lang of ["en", "fr"] as const) {
  test.describe(`EV-337g1 (${lang})`, () => {
    test.use({ locale: LOCALE[lang] });

    /* ═══ G1.1 — two columns from 1280, one below, in the story's order ══════════════════ */

    test("G1.1: two columns at 1440 and 1280, one column below in the order targets, diet profile, meal week, food log", async ({
      page,
    }) => {
      await signIn(page, lang);
      await page.goto(`/clients/${LINA}/nutrition`);
      const b = blocks(page, lang);
      const aside = page.locator('[data-nut-column="aside"]');
      const main = page.locator('[data-nut-column="main"]');
      // Each block is in the column the story names, in its order (the DOM is the reading order).
      await expect(aside.getByRole("region", { name: L[lang].targets, exact: true })).toHaveCount(1);
      await expect(aside.locator('[data-nut-block="diet"]')).toHaveCount(1);
      await expect(main.locator('[data-nut-block="week"]')).toHaveCount(1);
      await expect(main.getByRole("region", { name: L[lang].foodLog, exact: true })).toHaveCount(1);
      const order = await page.evaluate(() => {
        const at = (sel: string) => document.querySelector(sel);
        const nodes = [
          at('[data-nut-column="aside"] section'),
          at('[data-nut-block="diet"]'),
          at('[data-nut-block="week"]'),
          at('[data-nut-column="main"] > section'),
        ];
        return nodes.slice(1).every((n, i) => !!n && !!nodes[i] && !!(nodes[i]!.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING));
      });
      expect(order, "DOM order: targets, diet profile, meal week, food log").toBe(true);

      for (const width of [...WIDTHS, 1279, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const where = `${width} (${lang})`;
        await expectNoSidewaysScroll(page, where);
        const t = await box(b.targets, `targets at ${where}`);
        const d = await box(b.diet, `diet profile at ${where}`);
        const w = await box(b.week, `meal week at ${where}`);
        const f = await box(b.foodLog, `food log at ${where}`);
        if (width >= 1280) {
          // Main column left (the week above the food log), the aside to its right, both
          // starting on the same line; the targets above the diet profile in the aside.
          expect(Math.abs(w.x - f.x), `${where}: week and food log share the main column`).toBeLessThanOrEqual(1);
          expect(Math.abs(t.x - d.x), `${where}: targets and diet share the aside`).toBeLessThanOrEqual(1);
          expect(t.x, `${where}: the aside is right of the main column`).toBeGreaterThanOrEqual(w.x + w.width);
          expect(Math.abs(t.y - w.y), `${where}: the two columns start on one line`).toBeLessThanOrEqual(1);
          expect(w.y + w.height, `${where}: the week is above the food log`).toBeLessThanOrEqual(f.y + 0.5);
          expect(t.y + t.height, `${where}: the targets are above the diet profile`).toBeLessThanOrEqual(d.y + 0.5);
        } else {
          // One column: same left edge, same width, stacked in the story's order.
          for (const [name, r] of [["diet", d], ["week", w], ["food log", f]] as const) {
            expect(Math.abs(r.x - t.x), `${where}: ${name} on the targets' left edge`).toBeLessThanOrEqual(1);
            expect(Math.abs(r.width - t.width), `${where}: ${name} as wide as the targets`).toBeLessThanOrEqual(1);
          }
          expect(t.y + t.height, `${where}: targets above the diet profile`).toBeLessThanOrEqual(d.y + 0.5);
          expect(d.y + d.height, `${where}: diet profile above the meal week`).toBeLessThanOrEqual(w.y + 0.5);
          expect(w.y + w.height, `${where}: meal week above the food log`).toBeLessThanOrEqual(f.y + 0.5);
        }
        if (width === 1440 || width === 390) await shot(page, `g1.1-loaded-${lang}-${width}`);
      }
    });

    test("G1.1: the empty-state card and the template-use outcome sit above both columns", async ({ page, context }) => {
      await signIn(page, lang);
      // Nils: no targets and no week, so the empty-state card is drawn.
      await page.goto(`/clients/${NILS}/nutrition`);
      const empty = page.getByText(L[lang].empty, { exact: true });
      await expect(empty).toBeVisible();
      for (const width of [1440, 1280, 1279, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const e = await box(empty, `empty state at ${width}`);
        for (const column of ["aside", "main"]) {
          const c = await box(page.locator(`[data-nut-column="${column}"]`), `${column} at ${width}`);
          expect(e.y + e.height, `${width} (${lang}): the empty state is above the ${column}`).toBeLessThanOrEqual(c.y + 0.5);
        }
        if (width === 1440 || width === 390) await shot(page, `g1.1-empty-${lang}-${width}`);
      }

      // The outcome of « Utiliser pour un client » (EV-273b AC5), handed off as the library's
      // dialog hands it off: one `sessionStorage` entry, read once by Lina's page.
      await addOutcome(context);
      await page.goto(`/clients/${LINA}/nutrition`);
      const outcome = page.getByRole("status").filter({ hasText: "Cut" });
      await expect(outcome).toHaveCount(1);
      for (const width of [1440, 1280, 1279, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const o = await box(outcome, `outcome at ${width}`);
        for (const column of ["aside", "main"]) {
          const c = await box(page.locator(`[data-nut-column="${column}"]`), `${column} at ${width}`);
          expect(o.y + o.height, `${width} (${lang}): the outcome is above the ${column}`).toBeLessThanOrEqual(c.y + 0.5);
        }
      }
    });

    /* ═══ G1.2 — the targets card ═══════════════════════════════════════════════════════════ */

    test("G1.2: four labelled values in a <dl>, the source line and the pill as today, « Modifier les objectifs » ≥ 44 px", async ({
      page,
    }) => {
      await signIn(page, lang);
      await page.goto(`/clients/${LINA}/nutrition`);
      const region = targetsRegion(page, lang);
      await expect(region).toHaveCount(1);
      const read = await tiles(region);
      expect(read.terms, "the four terms, in order").toEqual(L[lang].terms);
      expect(read.values.map(plain), "Lina's four stored targets").toEqual(L[lang].lina);
      await expect(region.getByText(L[lang].source, { exact: true })).toBeVisible();
      await expect(region.getByText(L[lang].pill, { exact: true })).toBeVisible();
      await expect(region.getByRole("status"), "the stored targets' arithmetic, as on load before").toHaveText(L[lang].macros);
      // Closed: no field of the form is on the page, and its Save is not either.
      await expect(region.getByRole("textbox")).toHaveCount(0);
      await expect(page.getByRole("button", { name: L[lang].save, exact: true })).toHaveCount(0);
      const edit = region.getByRole("button", { name: L[lang].edit, exact: true });
      for (const width of [...WIDTHS, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const where = `${width} (${lang})`;
        const e = await box(edit, `« ${L[lang].edit} » at ${where}`);
        expect(e.height, `${where}: the button is ≥ 44 px tall`).toBeGreaterThanOrEqual(44);
        expect(e.width, `${where}: the button is ≥ 44 px wide`).toBeGreaterThanOrEqual(44);
        expect(await tilesWhole(region), `${where}: each value whole, on one line, in its tile`).toEqual([]);
        await expectNoSidewaysScroll(page, where);
        if (width === 1440 || width === 390) await shot(page, `g1.2-closed-${lang}-${width}`);
      }
      if (lang === "fr") await expectNoEnglish(page, `/clients/{id}/nutrition, targets closed`);
    });

    test("G1.2: the button opens the form; « Annuler » closes it unchanged and sends nothing", async ({ page }) => {
      await signIn(page, lang);
      await page.goto(`/clients/${LINA}/nutrition`);
      await hydrated(page);
      const region = targetsRegion(page, lang);
      for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await region.getByRole("button", { name: L[lang].edit, exact: true }).click();
        const calories = region.getByRole("textbox", { name: "Calories", exact: true });
        // The existing form, in the card, on the stored values, and focus in its first field.
        await expect(calories).toBeVisible();
        await expect(calories).toBeFocused();
        const fields = region.getByRole("textbox");
        await expect(fields).toHaveCount(4);
        for (const [i, value] of ["2150", "150", "215", "68"].entries()) await expect(fields.nth(i)).toHaveValue(value);
        await expect(region.getByRole("button", { name: L[lang].save, exact: true })).toBeVisible();
        await expect(region.locator("dl"), "open, the inputs replace the values").toHaveCount(0);
        await shot(page, `g1.2-open-${lang}-${width}`);

        // G1.2f: open, the line follows what is typed (EV-190, unchanged)…
        await calories.fill("2300");
        await expect(region.getByRole("status")).toHaveText(L[lang].macros2300);
        await region.getByRole("button", { name: L[lang].cancel, exact: true }).click();
        await expect(region.getByRole("textbox")).toHaveCount(0);
        // …and after « Annuler » it is the stored values' line again, exactly.
        await expect(region.getByRole("status")).toHaveText(L[lang].macros);
        const read = await tiles(region);
        expect(read.values.map(plain), `${width}: unchanged after « ${L[lang].cancel} »`).toEqual(L[lang].lina);
        await expect(region.getByRole("button", { name: L[lang].edit, exact: true })).toBeFocused();
        // Reopened, the form holds the stored value, not what was typed before the cancel.
        await region.getByRole("button", { name: L[lang].edit, exact: true }).click();
        await expect(calories).toHaveValue("2150");
        await region.getByRole("button", { name: L[lang].cancel, exact: true }).click();
        await expect(region.getByRole("textbox")).toHaveCount(0);
      }
      expect(await targetPuts(page), "« Annuler » sent no targets write").toBe(0);
    });

    test("G1.2: a save goes through the confirm dialog, closes the form, and the card shows what was stored", async ({ page }) => {
      await signIn(page, lang);
      await page.goto(`/clients/${LINA}/nutrition`);
      await hydrated(page);
      const region = targetsRegion(page, lang);
      await region.getByRole("button", { name: L[lang].edit, exact: true }).click();
      await region.getByRole("textbox", { name: "Calories", exact: true }).fill("2300");
      await region.getByRole("button", { name: L[lang].save, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: L[lang].dialog, exact: true });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: L[lang].save, exact: true }).click();
      await expect(region.getByText(L[lang].saved, { exact: true })).toBeVisible();
      await expect(region.getByRole("textbox"), "a save that landed closes the form").toHaveCount(0);
      await expect(region.getByRole("button", { name: L[lang].edit, exact: true })).toBeFocused();
      expect((await tiles(region)).values.map(plain)[0]).toBe(L[lang].lina2300);
      expect(await targetPuts(page), "one targets write").toBe(1);
      await shot(page, `g1.2-saved-${lang}`);
      await page.reload();
      expect((await tiles(targetsRegion(page, lang))).values.map(plain)[0], "the server holds it").toBe(L[lang].lina2300);
    });

    test("G1.2c: a save raised to the floor closes the form on the STORED 1 200, not the typed 800; G1.2f's line follows it", async ({ page }) => {
      await signIn(page, lang);
      await page.goto(`/clients/${LINA}/nutrition`);
      await hydrated(page);
      const region = targetsRegion(page, lang);
      await openTargetsForm(page);
      await region.getByRole("textbox", { name: "Calories", exact: true }).fill("800");
      await region.getByRole("button", { name: L[lang].save, exact: true }).click();
      await page.getByRole("dialog", { name: L[lang].dialog, exact: true }).getByRole("button", { name: L[lang].save, exact: true }).click();
      await expect(region.getByText(L[lang].floor, { exact: true })).toBeVisible();
      await expect(region.getByText(L[lang].saved, { exact: true })).toBeVisible();
      await expect(region.getByRole("textbox"), "the save landed: the form is closed").toHaveCount(0);
      const values = (await tiles(region)).values.map(plain);
      expect(values[0], "the <dl> shows what was stored").toBe(L[lang].lina1200);
      expect(values.join(" | "), "never the typed 800").not.toMatch(/\b800\b/);
      await expect(region.getByRole("status"), "G1.2f: the line against the stored 1 200").toHaveText(L[lang].macros1200);
      await shot(page, `g1.2-floor-${lang}`);
    });

    test("G1.2a: with no targets stored (Nils), the card is closed on the sentence alone; open shows four empty fields; « Annuler » returns, nothing sent", async ({
      page,
    }) => {
      await signIn(page, lang);
      await page.goto(`/clients/${NILS}/nutrition`);
      await hydrated(page);
      const region = targetsRegion(page, lang);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const where = `${width} (${lang})`;
        await expect(region.locator("dl"), `${where}: no <dl>`).toHaveCount(0);
        await expect(region.getByRole("textbox"), `${where}: no field`).toHaveCount(0);
        await expect(region.getByText(L[lang].noTargets, { exact: true }), where).toBeVisible();
        // No source line, no activity pill, no macro line: nothing the api did not return (X7).
        await expect(region.getByText(L[lang].source, { exact: true }), `${where}: no source line`).toHaveCount(0);
        await expect(region.getByText(/^(Activity level: |Niveau d.activité)/), `${where}: no pill`).toHaveCount(0);
        await expect(region.getByRole("status"), `${where}: no macro line`).toHaveCount(0);
        // The empty-state card above both columns (G1.1) stays: two sentences for one fact, accepted.
        await expect(page.getByText(L[lang].empty, { exact: true }), `${where}: the empty state`).toBeVisible();
        const e = await box(region.getByRole("button", { name: L[lang].edit, exact: true }), `« ${L[lang].edit} » at ${where}`);
        if (width === 390) {
          expect(e.width, `${where}: ≥ 44 wide`).toBeGreaterThanOrEqual(44);
          expect(e.height, `${where}: ≥ 44 tall`).toBeGreaterThanOrEqual(44);
        }
        await shot(page, `g1.2a-nils-${lang}-${width}`);

        await region.getByRole("button", { name: L[lang].edit, exact: true }).click();
        const fields = region.getByRole("textbox");
        await expect(fields).toHaveCount(4);
        for (const field of await fields.all()) await expect(field).toHaveValue("");
        await region.getByRole("button", { name: L[lang].cancel, exact: true }).click();
        await expect(region.getByRole("textbox")).toHaveCount(0);
        await expect(region.getByText(L[lang].noTargets, { exact: true }), `${where}: back to the sentence`).toBeVisible();
      }
      const res = await page.request.get("/api/fixture/calls");
      const calls = ((await res.json()) as { calls: string[] }).calls;
      expect(calls.filter((c) => c.startsWith(`PUT /coach-portal/clients/${NILS}/nutrition/targets`)), "no targets write").toEqual([]);
    });

    test("G1.2d: refused client-side, failed, lost answer: the form stays open with the coach's text, no « saved »", async ({
      page,
      context,
      baseURL,
    }) => {
      await signIn(page, lang);
      await page.goto(`/clients/${LINA}/nutrition`);
      await hydrated(page);
      const region = targetsRegion(page, lang);
      const fields = region.getByRole("textbox");
      const typed = ["2300", "155", "220", "70"];
      await openTargetsForm(page);

      // (i) refused client-side: AC2's sentence, nothing sent, every field kept.
      await fields.nth(0).fill("0");
      await region.getByRole("button", { name: L[lang].save, exact: true }).click();
      await expect(region.locator('p[role="alert"]')).toHaveText(L[lang].refused);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(fields).toHaveCount(4);
      await expect(fields.nth(0)).toHaveValue("0");
      expect(await targetPuts(page), "(i) a refused value sends no PUT").toBe(0);
      await expect(region.getByText(L[lang].saved, { exact: true })).toHaveCount(0);

      // (ii) a failed save (b-fit-api's 500) and (iii) a lost answer (a gateway 502, BUG-711).
      for (const [outcome, sentence] of [
        ["500", L[lang].failed],
        ["502", L[lang].noAnswer],
      ] as const) {
        await context.addCookies([{ name: "evoli_fixture_nutrition_lost", value: `targets_${outcome}`, url: baseURL! }]);
        for (const [i, value] of typed.entries()) await fields.nth(i).fill(value);
        await region.getByRole("button", { name: L[lang].save, exact: true }).click();
        await page.getByRole("dialog", { name: L[lang].dialog, exact: true }).getByRole("button", { name: L[lang].save, exact: true }).click();
        await expect(region.getByText(sentence, { exact: true }), outcome).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(fields, `${outcome}: the form stays open`).toHaveCount(4);
        for (const [i, value] of typed.entries()) await expect(fields.nth(i), `${outcome}: field ${i} keeps its text`).toHaveValue(value);
        await expect(region.locator("dl"), `${outcome}: no <dl>`).toHaveCount(0);
        await expect(region.getByText(L[lang].saved, { exact: true }), `${outcome}: no « saved »`).toHaveCount(0);
      }
    });

    test("G1.2e: a field typed while the save is in flight keeps the form open on it, and the leave guard asks", async ({ page }) => {
      await signIn(page, lang);
      await page.goto(`/clients/${LINA}/nutrition`);
      await hydrated(page);
      const region = targetsRegion(page, lang);
      // The server action is a POST to the page's own URL: hold each one 2.5 s.
      let held = 0;
      await page.route(`**/clients/${LINA}/nutrition`, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        held += 1;
        await new Promise((r) => setTimeout(r, 2_500));
        await route.continue().catch(() => {});
      });
      await openTargetsForm(page);
      await region.getByRole("textbox", { name: "Calories", exact: true }).fill("2300");
      await region.getByRole("button", { name: L[lang].save, exact: true }).click();
      await page.getByRole("dialog", { name: L[lang].dialog, exact: true }).getByRole("button", { name: L[lang].save, exact: true }).click();
      // During the hold (fill needs no pointer, so the dialog's overlay does not stop it).
      const protein = region.getByRole("textbox").nth(1);
      await protein.fill("160");
      await expect(region.getByText(L[lang].saved, { exact: true }), "the save landed").toBeVisible({ timeout: 15_000 });
      expect(held, "the save went through the held route").toBeGreaterThanOrEqual(1);
      await expect(region.getByRole("textbox"), "the form stays open on unsaved text").toHaveCount(4);
      await expect(protein).toHaveValue("160");
      await expect(region.locator("dl")).toHaveCount(0);
      await page.unroute(`**/clients/${LINA}/nutrition`);
      // BUG-665: the typed text is unsaved, so leaving by the Programme tab asks first.
      await page.getByRole("main").getByRole("link", { name: L[lang].routineTab, exact: true }).click();
      await expect(page.getByRole("dialog", { name: L[lang].leave, exact: true })).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(`/clients/${LINA}/nutrition`);
    });

    /* ═══ G1.4a (337g1-R4) — one « Nutrition » title ══════════════════════════════════════ */

    test("G1.4a: the diet card is « Profil du client », and below the tab bar only the h2 reads « Nutrition »", async ({ page }) => {
      await signIn(page, lang);
      for (const client of [LINA, NILS]) {
        await page.goto(`/clients/${client}/nutrition`);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 900 });
          const where = `${client === LINA ? "Lina" : "Nils"} at ${width} (${lang})`;
          const diet = page.locator('[data-nut-block="diet"]');
          await expect(diet.locator(".dt").first(), `${where}: the card's title`).toHaveText(L[lang].profile, { useInnerText: true });
          // The groups, the empty sentence and the footnote, unchanged.
          if (client === LINA) {
            await expect(diet.locator("[data-profile-group]"), where).toHaveCount(3);
          } else {
            await expect(diet.getByText(lang === "en" ? "No dietary restrictions recorded." : "Aucune restriction alimentaire enregistrée.", { exact: true }), where).toBeVisible();
          }
          await expect(diet.getByText(L[lang].profileNote, { exact: true }), where).toBeVisible();
          const exact = await page.evaluate(() => {
            const tabs = document.querySelector('main a[href$="/nutrition"]')?.closest("nav");
            if (!tabs) return ["(no client tab bar)"];
            return Array.from(document.querySelectorAll("body *"))
              .filter((el) => tabs.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !tabs.contains(el))
              .filter((el) => (el.textContent ?? "").trim() === "Nutrition")
              // the innermost element holding the whole text
              .filter((el) => !Array.from(el.children).some((c) => (c.textContent ?? "").trim() === "Nutrition"))
              .map((el) => el.tagName);
          });
          expect(exact, `${where}: the only element whose whole text is « Nutrition »`).toEqual(["H2"]);
          if (client === LINA) await shot(page, `g1.4a-${lang}-${width}`);
        }
      }
    });

    /* ═══ G1.3 — BUG-252 stays fixed ═══════════════════════════════════════════════════════ */

    test("G1.3: at 320–390 the whole activity pill shows, wrapped if need be, and nothing scrolls sideways", async ({ page }) => {
      await signIn(page, lang);
      await page.goto(`/clients/${LINA}/nutrition`);
      // Found on the page, not through the card's region: G1.3 is "as at a862698", so this
      // test must hold on the base too (it is green there), and a region the base lacks
      // would make it red for the wrong reason.
      const pill = page.getByText(L[lang].pill, { exact: true });
      await expect(pill, "Lina is MODERATE: the pill names it").toBeVisible();
      for (const width of PHONES) {
        await page.setViewportSize({ width, height: 900 });
        const where = `${width} (${lang})`;
        await expectNoSidewaysScroll(page, where);
        const seen = await pill.evaluate((el) => {
          const cs = getComputedStyle(el);
          const range = document.createRange();
          range.selectNodeContents(el);
          const text = range.getBoundingClientRect();
          const own = el.getBoundingClientRect();
          // Every ancestor that could clip it: the text box must sit inside each.
          let clippedBy: string | null = null;
          for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
            const s = getComputedStyle(a);
            if (s.overflowX !== "visible" || s.overflowY !== "visible") {
              const r = a.getBoundingClientRect();
              if (text.left < r.left - 0.5 || text.right > r.right + 0.5) clippedBy = a.tagName;
            }
          }
          return {
            ellipsis: cs.textOverflow === "ellipsis",
            clipped: el.scrollWidth - el.clientWidth,
            inside: text.left >= own.left - 0.5 && text.right <= own.right + 0.5,
            right: text.right,
            vw: document.documentElement.clientWidth,
            clippedBy,
          };
        });
        expect(seen.ellipsis, `${where}: no ellipsis`).toBe(false);
        expect(seen.clipped, `${where}: the pill's text is not cut`).toBeLessThanOrEqual(1);
        expect(seen.inside, `${where}: the text is inside the pill`).toBe(true);
        expect(seen.right, `${where}: the pill ends inside the viewport`).toBeLessThanOrEqual(seen.vw + 0.5);
        expect(seen.clippedBy, `${where}: no ancestor clips the pill`).toBeNull();
        if (width === 320 || width === 390) await shot(page, `g1.3-pill-${lang}-${width}`);
      }
    });

    /* ═══ G1.4 + X1/X2/X4 — one h1, the tab's h2, in four states ═══════════════════════════ */

    test("G1.4: loaded, empty, scope missing, load error: one h1 (the name), the h2 « Nutrition », no sideways scroll", async ({
      page,
      context,
      baseURL,
    }) => {
      await signIn(page, lang);
      const states: [string, string, string, string, () => Promise<void>][] = [
        ["loaded", `/clients/${LINA}/nutrition`, "Lina M.", L[lang].targets, async () => {}],
        ["empty", `/clients/${NILS}/nutrition`, "Nils K.", L[lang].empty, async () => {}],
        ["scope-missing", `/clients/${SARA}/nutrition`, "Sara P.", L[lang].scope, async () => {}],
        [
          "load-error",
          `/clients/${LINA}/nutrition`,
          "Lina M.",
          L[lang].loadError,
          () => context.addCookies([{ name: "evoli_fixture_summary_read", value: `nutrition:500:${LINA}`, url: baseURL! }]),
        ],
      ];
      for (const [state, path, name, sentinel, arrange] of states) {
        await arrange();
        for (const width of X1_WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          if (width === X1_WIDTHS[0]) {
            await page.goto(path);
            await expect(page.getByText(sentinel, { exact: true }).first(), `${state} is the state it claims`).toBeVisible();
          }
          const where = `${state} at ${width} (${lang})`;
          await expectNoSidewaysScroll(page, where);
          await expect(page.locator("h1"), where).toHaveCount(1);
          await expect(page.locator("h1"), where).toHaveText(name);
          await expect(page.getByRole("heading", { level: 2, name: L[lang].title, exact: true }), where).toHaveCount(1);
          // The h2 follows the h1 (the header) and precedes the state's content.
          const after = await page.evaluate(() => {
            const h1 = document.querySelector("h1");
            const h2 = Array.from(document.querySelectorAll("h2")).find((h) => h.textContent === "Nutrition");
            return !!h1 && !!h2 && !!(h1.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING);
          });
          expect(after, `${where}: the h2 comes after the h1`).toBe(true);
          if (width >= 1024) {
            await expect(page.locator(".shell-sidebar"), where).toBeVisible();
            await expect(page.locator(".shell-tabbar"), where).toBeHidden();
          } else {
            await expect(page.locator(".shell-tabbar"), where).toBeVisible();
            await expect(page.locator(".shell-sidebar"), where).toBeHidden();
          }
          if (width === 1440 || width === 390) await shot(page, `g1.4-${state}-${lang}-${width}`);
        }
        if (lang === "fr") await expectNoEnglish(page, `/clients/{id}/nutrition (${state})`);
      }
    });

    test("G1.4 + BUG-713: the overview read fails too: the one h1 is the load-error sentence, and the h2 « Nutrition » is drawn", async ({ page, context, baseURL }) => {
      await signIn(page, lang);
      await context.addCookies([{ name: "evoli_fixture_overview", value: "fail", url: baseURL! }]);
      await page.goto(`/clients/${LINA}/nutrition`);
      await expect(page.getByText(L[lang].loadError, { exact: true })).toBeVisible();
      // BUG-713: no name to show, so the one h1 is the tab's load-error sentence; the h2 comes
      // before it (accepted: X4 counts h1s only, the story's pointer at G1.4 / F1.6).
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(L[lang].loadError);
      await expect(page.getByRole("heading", { level: 2, name: L[lang].title, exact: true })).toHaveCount(1);
    });

    /* ═══ G1.5 — no rest-day target (G15) ══════════════════════════════════════════════════ */

    test("G1.5: no rest-day target anywhere on the page", async ({ page }) => {
      await signIn(page, lang);
      await page.goto(`/clients/${LINA}/nutrition`);
      // The card's title as the sentinel that the page rendered (present on the base too).
      await expect(page.getByText(L[lang].targets, { exact: true })).toBeVisible();
      await expect(page.getByText(L[lang].restDay)).toHaveCount(0);
    });
  });
}

/* ═══ G1.1 + G1.2 + G1.3 in real WebKit (X1–X8: Chromium and WebKit) ═════════════════════ */

test.describe("G1.1 + G1.2 + G1.3 WebKit", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  for (const lang of ["en", "fr"] as const) {
    test(`WebKit (${lang}): two columns at 1440 and 1280, one below in order; the tiles whole; the pill whole at 320–390`, async ({
      baseURL,
    }) => {
      // The runner hands its own en-US Accept-Language to contexts it did not create: say it.
      const context = await browser.newContext({
        baseURL,
        locale: LOCALE[lang],
        extraHTTPHeaders: { "Accept-Language": LOCALE[lang] },
      });
      const page = await context.newPage();
      await signInThroughForm(page, { lang, landing: `${baseURL}/` });
      await page.goto(`/clients/${LINA}/nutrition`);
      const b = blocks(page, lang);
      const region = targetsRegion(page, lang);
      await expect(region).toHaveCount(1);
      for (const width of [1440, 1280, 1279, 1024, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        const where = `WebKit ${width} (${lang})`;
        await expectNoSidewaysScroll(page, where);
        const t = await box(b.targets, `targets at ${where}`);
        const d = await box(b.diet, `diet at ${where}`);
        const w = await box(b.week, `week at ${where}`);
        const f = await box(b.foodLog, `food log at ${where}`);
        if (width >= 1280) {
          expect(t.x, `${where}: the aside is right of the main column`).toBeGreaterThanOrEqual(w.x + w.width);
          expect(Math.abs(t.y - w.y), `${where}: the columns start on one line`).toBeLessThanOrEqual(1);
          expect(w.y + w.height, `${where}: week above food log`).toBeLessThanOrEqual(f.y + 0.5);
          expect(t.y + t.height, `${where}: targets above diet`).toBeLessThanOrEqual(d.y + 0.5);
        } else {
          expect(t.y + t.height, `${where}: targets above diet`).toBeLessThanOrEqual(d.y + 0.5);
          expect(d.y + d.height, `${where}: diet above week`).toBeLessThanOrEqual(w.y + 0.5);
          expect(w.y + w.height, `${where}: week above food log`).toBeLessThanOrEqual(f.y + 0.5);
          expect(Math.abs(w.x - t.x), `${where}: one column`).toBeLessThanOrEqual(1);
        }
        expect(await tilesWhole(region), `${where}: each value whole, on one line, in its tile`).toEqual([]);
        if (width <= 390) {
          const e = await box(region.getByRole("button", { name: L[lang].edit, exact: true }), `edit at ${where}`);
          expect(e.height, `${where}: « ${L[lang].edit} » ≥ 44 px tall`).toBeGreaterThanOrEqual(44);
        }
      }
      const pill = page.getByText(L[lang].pill, { exact: true });
      for (const width of PHONES) {
        await page.setViewportSize({ width, height: 900 });
        const where = `WebKit ${width} (${lang})`;
        await expectNoSidewaysScroll(page, where);
        const seen = await pill.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const text = range.getBoundingClientRect();
          const own = el.getBoundingClientRect();
          return {
            ellipsis: getComputedStyle(el).textOverflow === "ellipsis",
            clipped: el.scrollWidth - el.clientWidth,
            inside: text.left >= own.left - 0.5 && text.right <= own.right + 0.5,
            right: text.right,
            vw: document.documentElement.clientWidth,
          };
        });
        expect(seen.ellipsis, `${where}: no ellipsis`).toBe(false);
        expect(seen.clipped, `${where}: the pill's text is not cut`).toBeLessThanOrEqual(1);
        expect(seen.inside, `${where}: the text is inside the pill`).toBe(true);
        expect(seen.right, `${where}: the pill ends inside the viewport`).toBeLessThanOrEqual(seen.vw + 0.5);
      }
      await context.close();
    });
  }
});

/** EV-273b's hand-off, as `handOffOutcome` writes it, for Lina and a template named "Cut". */
async function addOutcome(context: BrowserContext) {
  await context.addInitScript((clientId: string) => {
    if (sessionStorage.getItem("ev337g1.outcome.planted")) return;
    sessionStorage.setItem("ev337g1.outcome.planted", "1");
    sessionStorage.setItem(
      "evoli.coach.nutritionTemplateOutcome",
      JSON.stringify({ clientId, template: "Cut", kind: "APPLIED", floorCalories: null, at: Date.now() })
    );
  }, LINA);
}
