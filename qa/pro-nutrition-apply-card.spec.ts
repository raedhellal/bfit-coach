import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { expect, webkit, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { expectNoSidewaysScroll } from "./layout";
import { expectNoEnglish } from "./french";
import { expectStateHoldsWhatIsShown, holdHydration, waitForFiber } from "./prehydration";

/**
 * EV-337g2 — « Appliquer à la semaine », the apply card on the client's nutrition page
 * (`/clients/{id}/nutrition`, story § Split: G2.1–G2.6, ruling 17, X1–X8).
 *
 * Every sentence and label is a LITERAL, never read from copy.ts: a check derived from its
 * subject cannot witness it. The fixture's Lina (`…0001`) holds AUTO targets 2150 / 150 / 215
 * / 68 and a week, floor 1200; Nils (`…0002`) holds neither. The coach's nutrition templates
 * are the POPULATED seed's, newest first: « Cut 1800 » (1800 / 150 / 170 / 60), « Lean 1300 »,
 * « Reset 1100 » (below Lina's 1200 floor). That is why this file runs in
 * `playwright.roster.config.ts`: the default suite's `empty` scenario seeds no template.
 *
 * The write paths are driven ONCE per language and engine, and the outcome they leave is then
 * read at every width of the brief (320, 390, 768, 1024, 1279, 1280, 1440); the seven
 * outcomes of G2.3 each land at a different one of those widths, so every width sees a write.
 *
 * Fixture switches (cookies, this browser context only): `evoli_fixture_nutrition_templates`
 * (`fail` | `empty`, added by this slice for G2.5), `evoli_fixture_week`, `evoli_fixture_targets`
 * (the write outcomes, thrown once the confirm dialog's own read has answered, as
 * `template-use-no-week-card.spec.ts` does), `evoli_fixture_display_name` (the name).
 *
 * Screenshots (1440 and 390, each language) go to `$EV337G2_EVIDENCE` when it is set.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
const LONG = "Maximilian-Alexander Featherstonehaugh-Smythe";

/** The brief's seven widths. */
const WIDTHS = [320, 390, 768, 1024, 1279, 1280, 1440] as const;
/** The seed's templates in the library's order (newest first). */
const SEEDED = ["Cut 1800", "Lean 1300", "Reset 1100"] as const;

type Lang = "en" | "fr";
const LOCALE: Record<Lang, string> = { en: "en-US", fr: "fr-FR" };

const L = {
  en: {
    card: "Apply to the week",
    from: "Build the week from",
    current: "Their current targets",
    cost: "1 apply per day per client.",
    applyLina: "Apply to Lina M.",
    applyNils: "Apply to Nils K.",
    applyLong: "Apply to Maximilian-Alexander Featherstonehaugh-…",
    applyNameless: "Apply to Unnamed client",
    applyWords: /^Apply to /,
    weekDialog: "Apply this meal week?",
    weekConfirm: "Apply",
    templateDialog: (t: string, first: string) => `Use “${t}” on ${first}?`,
    templateConfirm: "Confirm",
    use: "Use on a trainee",
    cancel: "Cancel",
    loadError: "Your nutrition templates could not be loaded.",
    targets: "Daily targets",
    weekEmpty: "Set the targets, then apply a meal week.",
    regenerate: /^Regenerate day: /,
    rateLimitedLine: "A meal week can be applied once a day for each trainee. Try again tomorrow.",
    generatingLine: "Lina's meal week is still being prepared. Try again in a few minutes.",
    refusedTitle: "We couldn't build a meal week for Lina.",
    applied: (t: string) => `“${t}” is now Lina's plan.`,
    floor: "Calories raised to a safe minimum of 1200 kcal.",
    outcomes: {
      WEEK_RATE_LIMITED:
        "Lina's targets are updated. Their meals weren't rebuilt: a week has already been applied for them today. Try again tomorrow.",
      WEEK_GENERATING: "Lina's targets are updated. Lina's meal week is still being prepared. Try again in a few minutes.",
      WEEK_FAILED: "Lina's targets are updated. Their meals couldn't be rebuilt. Use “Apply to Lina M.” to try again.",
      WEEK_UNKNOWN:
        "Lina's targets are updated. We couldn't confirm whether their meals were rebuilt. Check their nutrition page before you try again.",
      TARGETS_FAILED: "Nothing was changed for Lina. Try again.",
      TARGETS_UNKNOWN: "We couldn't confirm whether Lina's targets changed. Check their nutrition page before you try again.",
    },
    weekFailed: (lead: string, label: string) => `${lead}'s targets are updated. Their meals couldn't be rebuilt. Use “${label}” to try again.`,
    namelessLead: "This trainee",
    longLead: "Maximilian-Alexander",
    kcal1800: "1,800 kcal",
    kcal1200: "1,200 kcal",
    notBuilt: [/or recipes/i, /already applied today/i, /available today/i, /resets? at/i],
    edit: "Edit targets",
  },
  fr: {
    card: "Appliquer à la semaine",
    from: "Construire la semaine à partir de",
    current: "Ses objectifs actuels",
    cost: "1 application par jour et par client.",
    applyLina: "Appliquer à Lina M.",
    applyNils: "Appliquer à Nils K.",
    applyLong: "Appliquer à Maximilian-Alexander Featherstonehaugh-…",
    applyNameless: "Appliquer à Client sans nom",
    applyWords: /^Appliquer à /,
    weekDialog: "Appliquer cette semaine de repas ?",
    weekConfirm: "Appliquer",
    templateDialog: (t: string, first: string) => `Utiliser « ${t} » pour ${first} ?`,
    templateConfirm: "Confirmer",
    use: "Utiliser pour un client",
    cancel: "Annuler",
    loadError: "Vos modèles nutrition n'ont pas pu être chargés.",
    targets: "Objectifs quotidiens",
    weekEmpty: "Définissez les objectifs, puis appliquez une semaine de repas.",
    regenerate: /^Régénérer le jour\s:\s/,
    rateLimitedLine: "Une semaine de repas peut être appliquée une fois par jour pour chaque client. Réessayez demain.",
    generatingLine: "La semaine de repas de Lina est encore en préparation. Réessayez dans quelques minutes.",
    refusedTitle: "Nous n'avons pas pu construire de semaine de repas pour Lina.",
    applied: (t: string) => `« ${t} » est désormais le plan de Lina.`,
    floor: "Calories relevées au minimum sûr de 1 200 kcal.",
    outcomes: {
      WEEK_RATE_LIMITED:
        "Les objectifs de Lina sont mis à jour. Ses repas n'ont pas été reconstruits : une semaine a déjà été appliquée pour ce client aujourd'hui. Réessayez demain.",
      WEEK_GENERATING:
        "Les objectifs de Lina sont mis à jour. La semaine de repas de Lina est encore en préparation. Réessayez dans quelques minutes.",
      WEEK_FAILED:
        "Les objectifs de Lina sont mis à jour. Ses repas n'ont pas pu être reconstruits. Utilisez « Appliquer à Lina M. » pour réessayer.",
      WEEK_UNKNOWN:
        "Les objectifs de Lina sont mis à jour. Nous n'avons pas pu confirmer si ses repas ont été reconstruits. Vérifiez sa page nutrition avant de réessayer.",
      TARGETS_FAILED: "Rien n'a été modifié pour Lina. Réessayez.",
      TARGETS_UNKNOWN:
        "Nous n'avons pas pu confirmer si les objectifs de Lina ont changé. Vérifiez sa page nutrition avant de réessayer.",
    },
    weekFailed: (lead: string, label: string) =>
      `Les objectifs ${lead} sont mis à jour. Ses repas n'ont pas pu être reconstruits. Utilisez « ${label} » pour réessayer.`,
    namelessLead: "de ce client",
    longLead: "de Maximilian-Alexander",
    kcal1800: "1 800 kcal",
    kcal1200: "1 200 kcal",
    notBuilt: [/ou recettes/i, /déjà appliqué aujourd/i, /disponible aujourd/i, /réinitialis/i],
    edit: "Modifier les objectifs",
  },
} as const;

type OutcomeKind = keyof (typeof L)["en"]["outcomes"];

/** The text with every run of white space (U+00A0 and U+202F included) as one space. */
function plain(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

const EVIDENCE = process.env.EV337G2_EVIDENCE;
async function shot(page: Page, name: string) {
  if (!EVIDENCE) return;
  mkdirSync(EVIDENCE, { recursive: true });
  await page.screenshot({ path: join(EVIDENCE, `${name}.png`), fullPage: true });
}

async function setSwitch(context: BrowserContext, baseURL: string, name: string, value: string) {
  await context.addCookies([{ name, value, url: baseURL }]);
}
async function clearSwitch(context: BrowserContext, name: string) {
  await context.clearCookies({ name });
}

function card(page: Page, lang: Lang) {
  return page.getByRole("region", { name: L[lang].card, exact: true });
}
function selector(page: Page, lang: Lang) {
  return card(page, lang).getByRole("combobox", { name: L[lang].from, exact: true });
}
function outcome(page: Page) {
  return page.getByTestId("template-use-outcome");
}

async function open(page: Page, lang: Lang, id = LINA) {
  await page.goto(`/clients/${id}/nutrition`);
  await expect(card(page, lang)).toBeVisible();
  await expect(page.locator("[data-nav-progress-ready]"), "hydrated").toHaveCount(1);
  await waitForFiber(selector(page, lang));
}

async function box(locator: Locator, what: string) {
  const b = await locator.boundingBox();
  expect(b, `${what} has a box`).not.toBeNull();
  return b!;
}

async function optionTexts(page: Page, lang: Lang): Promise<string[]> {
  return selector(page, lang).evaluate((el) =>
    Array.from((el as HTMLSelectElement).options).map((o) => (o.textContent ?? "").replace(/\s+/g, " ").trim())
  );
}

/** Clicks the card's button, retried until `dialog` shows (a click before hydration does nothing). */
async function pressApply(page: Page, lang: Lang, button: string, dialog: Locator) {
  const b = card(page, lang).getByRole("button", { name: button, exact: true });
  await expect(async () => {
    await b.click({ timeout: 2_000 });
    await expect(dialog).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
}

/** The template path's dialog, open and READ (its Confirm is enabled once the read answered). */
async function openTemplateDialog(page: Page, lang: Lang, template: string, button = L[lang].applyLina, first = "Lina") {
  await selector(page, lang).selectOption({ label: template });
  const dialog = page.getByRole("dialog", { name: L[lang].templateDialog(template, first) });
  await pressApply(page, lang, button, dialog);
  await expect(dialog.getByRole("button", { name: L[lang].templateConfirm, exact: true })).toBeEnabled();
  return dialog;
}

/** Lina's meals as the week block lists them (id and name), in order. */
async function meals(page: Page): Promise<string[]> {
  return page
    .locator('[data-nut-block="week"] [data-meal-id]')
    .evaluateAll((nodes) => nodes.map((n) => `${n.getAttribute("data-meal-id")}|${(n.textContent ?? "").replace(/\s+/g, " ").trim()}`));
}

async function calls(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/fixture/calls");
  expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
  return ((await res.json()) as { calls: string[] }).calls;
}

/** Marks the current document: a reload or a navigation drops the mark. */
async function markDocument(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __g2doc?: number }).__g2doc = 337;
  });
}
async function sameDocument(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __g2doc?: number }).__g2doc === 337);
}

/* ═══ G2.1 — one card, one control ═══════════════════════════════════════════════════════════ */

async function g21Structure(page: Page, lang: Lang, tag: string) {
  const t = L[lang];
  // The library's order, read off the library page itself (and pinned to the seed).
  await page.goto("/nutrition-templates");
  const libraryOrder = await page
    .locator('main ul > li [role="group"]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("aria-label") ?? ""));
  expect(libraryOrder, "the seeded library, newest first").toEqual([...SEEDED]);

  await open(page, lang);
  const c = card(page, lang);
  // Its title, in the aside, between the targets card and the diet profile in the DOM.
  await expect(c.getByText(t.card, { exact: true })).toBeVisible();
  await expect(page.locator('[data-nut-column="aside"]').getByRole("region", { name: t.card, exact: true })).toHaveCount(1);
  const order = await page.evaluate((cardName) => {
    const aside = document.querySelector('[data-nut-column="aside"]')!;
    const sections = Array.from(aside.querySelectorAll("section[aria-labelledby]"));
    const named = sections.map((s) => document.getElementById(s.getAttribute("aria-labelledby")!)?.textContent?.trim());
    const applyCard = sections[named.indexOf(cardName)];
    const targets = sections[0];
    const diet = document.querySelector('[data-nut-block="diet"]')!;
    const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    return { found: !!applyCard, afterTargets: !!applyCard && follows(targets, applyCard), beforeDiet: !!applyCard && follows(applyCard, diet) };
  }, t.card);
  expect(order, "DOM: targets, the apply card, the diet profile").toEqual({ found: true, afterTargets: true, beforeDiet: true });

  // One select, labelled; its first option, then each template by name in the library's order.
  await expect(c.getByRole("combobox")).toHaveCount(1);
  expect(await optionTexts(page, lang)).toEqual([t.current, ...libraryOrder]);
  await expect(selector(page, lang)).toHaveValue(/.+/);
  expect(await selector(page, lang).evaluate((el) => (el as HTMLSelectElement).selectedIndex), "the first option is selected").toBe(0);

  // The cost sentence before any click; the button by today's label.
  await expect(c.getByText(t.cost, { exact: true })).toBeVisible();
  await expect(c.getByRole("button", { name: t.applyLina, exact: true })).toBeVisible();
  // Exactly one apply control on the page, and none in the meal week's head.
  await expect(page.getByRole("button", { name: t.applyWords })).toHaveCount(1);
  await expect(page.locator('[data-nut-block="week"]').getByRole("button", { name: t.applyWords })).toHaveCount(0);
  // X4: one h1.
  await expect(page.locator("h1")).toHaveCount(1);
  if (lang === "fr") await expectNoEnglish(page, `/clients/{id}/nutrition, the apply card (${tag})`);

  const targets = page.getByRole("region", { name: t.targets, exact: true });
  const diet = page.locator('[data-nut-block="diet"]');
  const week = page.locator('[data-nut-block="week"]');
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const where = `${width} (${tag})`;
    await expectNoSidewaysScroll(page, where);
    const k = await box(c, `card at ${where}`);
    const tg = await box(targets, `targets at ${where}`);
    const d = await box(diet, `diet at ${where}`);
    const w = await box(week, `week at ${where}`);
    // In the aside, under the targets card and above the diet profile, at every width.
    expect(Math.abs(k.x - tg.x), `${where}: on the targets' left edge`).toBeLessThanOrEqual(1);
    expect(Math.abs(k.width - tg.width), `${where}: as wide as the targets`).toBeLessThanOrEqual(1);
    expect(tg.y + tg.height, `${where}: under the targets card`).toBeLessThanOrEqual(k.y + 0.5);
    expect(k.y + k.height, `${where}: above the diet profile`).toBeLessThanOrEqual(d.y + 0.5);
    if (width >= 1280) {
      expect(k.x, `${where}: the aside is right of the main column`).toBeGreaterThanOrEqual(w.x + w.width);
    } else {
      expect(k.y + k.height, `${where}: one column, before the meal week`).toBeLessThanOrEqual(w.y + 0.5);
    }
    // Everything in the card inside the viewport; the controls at least 44 px tall (X3 at 390:
    // 44 x 44, measured).
    for (const [name, el] of [
      ["select", selector(page, lang)],
      ["button", c.getByRole("button", { name: t.applyLina, exact: true })],
    ] as const) {
      const b = await box(el, `${name} at ${where}`);
      expect(b.x + b.width, `${where}: the ${name} runs past the viewport`).toBeLessThanOrEqual(width + 0.5);
      expect(b.height, `${where}: the ${name} is under 44 px tall`).toBeGreaterThanOrEqual(44);
      if (width === 390) expect(b.width, `${where}: the ${name} is under 44 px wide`).toBeGreaterThanOrEqual(44);
    }
    await expect(c.getByText(t.cost, { exact: true })).toBeVisible();
    if (width === 1440 || width === 390) await shot(page, `g2.1-loaded-${tag}-${width}`);
  }
}

/** G2.1 — the label wraps at 320 as today: the longest name the portal prints. */
async function g21LongName(page: Page, context: BrowserContext, baseURL: string, lang: Lang, tag: string) {
  const t = L[lang];
  await setSwitch(context, baseURL, "evoli_fixture_display_name", `${LINA}:${encodeURIComponent(LONG)}`);
  await open(page, lang);
  const button = card(page, lang).getByRole("button", { name: t.applyLong, exact: true });
  await expect(button).toBeVisible();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSidewaysScroll(page, `${width} with a 40-character name (${tag})`);
    const b = await box(button, `button at ${width}`);
    expect(b.x + b.width, `${width}: the button runs past the viewport`).toBeLessThanOrEqual(width + 0.5);
    expect(b.height, `${width}: the button is under 44 px tall`).toBeGreaterThanOrEqual(44);
    const clipped = await button.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(clipped, `${width}: the label is clipped`).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  const lines = await button.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return new Set(Array.from(range.getClientRects()).filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
  });
  expect(lines, "at 320 the label wraps inside the button").toBeGreaterThan(1);
}

/* ═══ G2.2 — current targets = today's apply ═════════════════════════════════════════════════ */

async function g22CurrentTargets(page: Page, context: BrowserContext, baseURL: string, lang: Lang, tag: string) {
  const t = L[lang];
  const weekDialog = page.getByRole("dialog", { name: t.weekDialog });

  // Success, on Nils (no week): the dialog, then the week the action returned.
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, lang, NILS);
  await expect(page.getByText(t.weekEmpty, { exact: true }).first()).toBeVisible();
  await pressApply(page, lang, t.applyNils, weekDialog);
  await weekDialog.getByRole("button", { name: t.weekConfirm, exact: true }).click();
  await expect(weekDialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: t.regenerate })).toHaveCount(7);
  await expect(outcome(page), "no template outcome on today's apply").toHaveCount(0);

  // 429, 409 « still being prepared » (EV-332i), 422 refusal, each from the card's button, each
  // shown where it was at a862698 (the week card), at its own width.
  const cases: { value: string; width: number; check: () => Promise<void> }[] = [
    {
      value: "rate_limited",
      width: 1440,
      check: async () => {
        await expect(page.locator('[data-nut-block="week"]').getByRole("alert").filter({ hasText: t.rateLimitedLine })).toHaveCount(1);
      },
    },
    {
      value: "generating",
      width: 1024,
      check: async () => {
        await expect(page.getByTestId("week-generating")).toHaveText(t.generatingLine);
      },
    },
    {
      value: "no_safe_plan",
      width: 320,
      check: async () => {
        await expect(page.getByTestId("week-refusal")).toBeVisible();
        await expect(page.getByTestId("week-refusal").locator("p").first()).toHaveText(t.refusedTitle);
      },
    },
  ];
  for (const { value, width, check } of cases) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, lang);
    await setSwitch(context, baseURL, "evoli_fixture_week", value);
    await pressApply(page, lang, t.applyLina, weekDialog);
    await weekDialog.getByRole("button", { name: t.weekConfirm, exact: true }).click();
    await expect(weekDialog).toHaveCount(0);
    await check();
    await expect(outcome(page)).toHaveCount(0);
    await expectNoSidewaysScroll(page, `${width} after ${value} (${tag})`);
    await clearSwitch(context, "evoli_fixture_week");
  }
}

/* ═══ G2.3 — a template = the library's composition ═══════════════════════════════════════════ */

/** The dialog's whole visible text and its name, white space folded. */
async function dialogText(dialog: Locator) {
  return plain(await dialog.innerText());
}

async function g23LibraryComposition(page: Page, lang: Lang, tag: string) {
  const t = L[lang];
  // The library's own dialog for Lina and each template: the reference.
  const reference: Record<string, string> = {};
  for (const template of ["Cut 1800", "Reset 1100"]) {
    await page.goto("/nutrition-templates");
    const picker = page.getByRole("dialog", { name: t.use });
    await expect(async () => {
      await page.getByRole("group", { name: template, exact: true }).getByRole("button", { name: t.use }).click({ timeout: 2_000 });
      await expect(picker).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    await picker.getByRole("button", { name: "Lina M.", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: t.templateDialog(template, "Lina") });
    await expect(dialog.getByRole("button", { name: t.templateConfirm, exact: true })).toBeEnabled();
    reference[template] = await dialogText(dialog);
  }

  // The same dialog from the card, for this client, without the picker.
  await open(page, lang);
  for (const template of ["Cut 1800", "Reset 1100"]) {
    const dialog = await openTemplateDialog(page, lang, template);
    await expect(page.getByRole("dialog", { name: t.use }), "no client picker").toHaveCount(0);
    expect(await dialogText(dialog), `« ${template} »: the library's dialog, word for word`).toBe(reference[template]);
    await shot(page, `g2.3-dialog-${template.replace(" ", "")}-${tag}`);
    await expect(dialog.getByRole("table")).toHaveCount(1);
    await dialog.getByRole("button", { name: t.cancel, exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  // The floor warning is there for « Reset 1100 » (below 1500) and not for « Cut 1800 »: the
  // reference texts differ by exactly that, so the comparison above covers both.
  expect(reference["Reset 1100"].length).toBeGreaterThan(reference["Cut 1800"].length);
}

async function g23Applied(page: Page, context: BrowserContext, baseURL: string, lang: Lang, tag: string) {
  const t = L[lang];
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, lang);
  const before = await meals(page);
  expect(before.length, "Lina has a week to replace").toBeGreaterThan(0);
  // The week card remembers a 429 on « Régénérer le jour » (EV-242b's cap line). A week apply
  // writes the counter back to zero, so after the template's week lands the line must go, as
  // after today's apply.
  await setSwitch(context, baseURL, "evoli_fixture_regen", "capped");
  await page.getByRole("button", { name: t.regenerate }).first().click();
  await expect(page.getByTestId("day-regen-capped")).toBeVisible();
  await clearSwitch(context, "evoli_fixture_regen");
  const callsBefore = (await calls(page)).length;
  await markDocument(page);

  const dialog = await openTemplateDialog(page, lang, "Reset 1100");
  await dialog.getByRole("button", { name: t.templateConfirm, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(outcome(page)).toHaveCount(1);
  await expect(outcome(page).locator("p").first()).toHaveText(t.applied("Reset 1100"));
  // Step 1's floor, from the targets response (AC5).
  await expect(outcome(page).locator("p").nth(1)).toHaveText(t.floor);
  expect(await sameDocument(page), "no reload, no navigation").toBe(true);
  expect(new URL(page.url()).pathname).toBe(`/clients/${LINA}/nutrition`);

  // The writes, in order: the dialog's read, the targets, then the week.
  const writes = (await calls(page)).slice(callsBefore).filter((c) => !c.startsWith("GET "));
  expect(writes.map((c) => c.split(" ").slice(0, 2).join(" "))).toEqual([
    `PUT /coach-portal/clients/${LINA}/nutrition/targets`,
    `POST /coach-portal/clients/${LINA}/nutrition/week/apply`,
  ]);

  // The targets card and the meal week show the server's new values, without a reload.
  const targets = page.getByRole("region", { name: t.targets, exact: true });
  await expect(targets.locator("dd").first()).toHaveText(t.kcal1200);
  const after = await meals(page);
  expect(after, "the meal week is the one the apply wrote").not.toEqual(before);
  await expect(page.getByTestId("day-regen-capped"), "no cap line after the week was applied").toHaveCount(0);
  await expect(page.getByRole("button", { name: t.regenerate }).first()).toBeEnabled();

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSidewaysScroll(page, `${width} after a template apply (${tag})`);
    await expect(outcome(page)).toHaveCount(1);
    await expect(outcome(page)).toBeVisible();
    if (width === 1440 || width === 390) await shot(page, `g2.3-applied-${tag}-${width}`);
  }

  // Once: a reload shows the page alone, and the same targets and week (the server's).
  await page.reload();
  await expect(card(page, lang)).toBeVisible();
  await expect(outcome(page)).toHaveCount(0);
  await expect(targets.locator("dd").first()).toHaveText(t.kcal1200);
  expect(await meals(page), "what the page showed is what the server holds").toEqual(after);
}

/** The six partial / failed outcomes, each on this page, once, at its own width. */
async function g23Outcomes(page: Page, context: BrowserContext, baseURL: string, lang: Lang, tag: string) {
  const t = L[lang];
  const cases: { kind: OutcomeKind; cookie: string; value: string; width: number }[] = [
    { kind: "WEEK_RATE_LIMITED", cookie: "evoli_fixture_week", value: "rate_limited", width: 320 },
    { kind: "WEEK_GENERATING", cookie: "evoli_fixture_week", value: "generating", width: 390 },
    { kind: "WEEK_FAILED", cookie: "evoli_fixture_week", value: "fail", width: 768 },
    { kind: "WEEK_UNKNOWN", cookie: "evoli_fixture_week", value: "no_answer", width: 1024 },
    { kind: "TARGETS_FAILED", cookie: "evoli_fixture_targets", value: "refused", width: 1279 },
    { kind: "TARGETS_UNKNOWN", cookie: "evoli_fixture_targets", value: "no_answer", width: 1440 },
  ];
  for (const { kind, cookie, value, width } of cases) {
    await page.setViewportSize({ width, height: 900 });
    await open(page, lang);
    await markDocument(page);
    const dialog = await openTemplateDialog(page, lang, "Cut 1800");
    await setSwitch(context, baseURL, cookie, value);
    await dialog.getByRole("button", { name: t.templateConfirm, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(outcome(page), `${kind}: one sentence`).toHaveCount(1);
    await expect(outcome(page).locator("p").first(), kind).toHaveText(t.outcomes[kind]);
    expect(await sameDocument(page), `${kind}: no reload`).toBe(true);
    if (kind.startsWith("WEEK_")) {
      // Step 1 landed: the targets card shows the stored 1 800 without a reload.
      await expect(page.getByRole("region", { name: t.targets, exact: true }).locator("dd").first()).toHaveText(t.kcal1800);
    }
    await expectNoSidewaysScroll(page, `${width} after ${kind} (${tag})`);
    await clearSwitch(context, cookie);
  }
}

/* ═══ G2.4 — the outcome quotes the button as G2.1 renders it ═════════════════════════════════ */

async function g24Label(page: Page, context: BrowserContext, baseURL: string, lang: Lang, tag: string) {
  const t = L[lang];
  const names: { cookie: string | null; button: string; lead: string; first: string }[] = [
    { cookie: null, button: t.applyLina, lead: lang === "en" ? "Lina" : "de Lina", first: "Lina" },
    { cookie: `${LINA}:${encodeURIComponent(LONG)}`, button: t.applyLong, lead: t.longLead, first: "Maximilian-Alexander" },
    { cookie: `${LINA}:__null__`, button: t.applyNameless, lead: t.namelessLead, first: lang === "en" ? "this trainee" : "ce client" },
  ];
  for (const [i, { cookie, button, lead, first }] of names.entries()) {
    if (cookie) await setSwitch(context, baseURL, "evoli_fixture_display_name", cookie);
    await page.setViewportSize({ width: WIDTHS[i * 2], height: 900 });
    await open(page, lang);
    const rendered = plain(await card(page, lang).getByRole("button", { name: button, exact: true }).innerText());
    expect(rendered, "the card's button, as rendered").toBe(button);
    await selector(page, lang).selectOption({ label: "Cut 1800" });
    const dialogs = page.getByRole("dialog");
    await pressApply(page, lang, button, dialogs);
    await expect(dialogs.getByRole("button", { name: t.templateConfirm, exact: true })).toBeEnabled();
    await setSwitch(context, baseURL, "evoli_fixture_week", "fail");
    await dialogs.getByRole("button", { name: t.templateConfirm, exact: true }).click();
    await expect(outcome(page)).toHaveCount(1);
    const sentence = plain(await outcome(page).locator("p").first().innerText());
    const leadText = lang === "en" ? (first === "this trainee" ? "This trainee" : lead) : lead;
    expect(sentence, `the instruction quotes the button (${first})`).toBe(plain(t.weekFailed(leadText, rendered)));
    // And the button it quotes is still the page's one apply control, by that exact label.
    await expect(page.getByRole("button", { name: t.applyWords })).toHaveCount(1);
    await expect(card(page, lang).getByRole("button", { name: rendered, exact: true })).toBeVisible();
    await clearSwitch(context, "evoli_fixture_week");
    await clearSwitch(context, "evoli_fixture_display_name");
  }
  await expectNoSidewaysScroll(page, `after G2.4 (${tag})`);
}

/* ═══ G2.5 — read failures ═══════════════════════════════════════════════════════════════════ */

async function g25ReadFails(page: Page, context: BrowserContext, baseURL: string, lang: Lang, tag: string) {
  const t = L[lang];
  await setSwitch(context, baseURL, "evoli_fixture_nutrition_templates", "fail");
  await open(page, lang);
  expect(await optionTexts(page, lang)).toEqual([t.current]);
  await expect(card(page, lang).getByText(t.loadError, { exact: true })).toBeVisible();
  // The page still works: the targets, the week, and the current-targets apply.
  await expect(page.getByRole("region", { name: t.targets, exact: true }).locator("dl")).toHaveCount(1);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoSidewaysScroll(page, `${width}, templates unreadable (${tag})`);
    await expect(card(page, lang).getByText(t.loadError, { exact: true })).toBeVisible();
    await expect(card(page, lang).getByText(t.cost, { exact: true })).toBeVisible();
    if (width === 1440 || width === 390) await shot(page, `g2.5-read-failed-${tag}-${width}`);
  }
  const before = await meals(page);
  const weekDialog = page.getByRole("dialog", { name: t.weekDialog });
  await pressApply(page, lang, t.applyLina, weekDialog);
  await weekDialog.getByRole("button", { name: t.weekConfirm, exact: true }).click();
  await expect(weekDialog).toHaveCount(0);
  await expect.poll(() => meals(page), { message: "the current-targets apply wrote a week" }).not.toEqual(before);

  // Zero templates: the first option alone, and no error line.
  await setSwitch(context, baseURL, "evoli_fixture_nutrition_templates", "empty");
  await open(page, lang);
  expect(await optionTexts(page, lang)).toEqual([t.current]);
  await expect(page.getByText(t.loadError)).toHaveCount(0);
  await expect(card(page, lang).getByText(t.cost, { exact: true })).toBeVisible();

  // Control: with the switch cleared the templates are offered again.
  await clearSwitch(context, "evoli_fixture_nutrition_templates");
  await open(page, lang);
  expect(await optionTexts(page, lang)).toEqual([t.current, ...SEEDED]);
  await expect(page.getByText(t.loadError)).toHaveCount(0);
}

/* ═══ G2.6 — not built ═══════════════════════════════════════════════════════════════════════ */

async function g26NotBuilt(page: Page, lang: Lang, tag: string) {
  const t = L[lang];
  await open(page, lang);
  await expect(card(page, lang).getByText(t.cost, { exact: true })).toBeVisible();
  const text = plain(await page.locator("main").innerText());
  for (const pattern of t.notBuilt) expect(text, `${pattern} (${tag})`).not.toMatch(pattern);
  // No reset time: no clock time anywhere in the card.
  const cardText = plain(await card(page, lang).innerText());
  expect(cardText).not.toMatch(/\b\d{1,2}\s?(:|h)\s?\d{2}\b/);
  // Ruling 17: the selector offers the current targets and templates, nothing else.
  expect(await optionTexts(page, lang)).toEqual([t.current, ...SEEDED]);
}

/* ═══ Keyboard ═══════════════════════════════════════════════════════════════════════════════ */

async function keyboard(page: Page, lang: Lang, tag: string) {
  const t = L[lang];
  await page.setViewportSize({ width: 390, height: 900 });
  await open(page, lang);
  // Reading order: « Modifier les objectifs », then the select, then the button.
  await page.getByRole("region", { name: t.targets, exact: true }).getByRole("button", { name: t.edit, exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(selector(page, lang)).toBeFocused();
  const ring = (l: Locator) => l.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(await ring(selector(page, lang)), "the select shows a focus ring").not.toBe("none");
  await page.keyboard.press("Tab");
  const button = card(page, lang).getByRole("button", { name: t.applyLina, exact: true });
  await expect(button).toBeFocused();
  expect(await ring(button), "the button shows a focus ring").not.toBe("none");
  await shot(page, `keyboard-button-focused-${tag}`);

  // Enter opens today's dialog; leaving it puts the focus back on the button.
  await page.keyboard.press("Enter");
  const weekDialog = page.getByRole("dialog", { name: t.weekDialog });
  await expect(weekDialog).toBeVisible();
  await weekDialog.getByRole("button", { name: t.cancel, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(weekDialog).toHaveCount(0);
  await expect(button).toBeFocused();

  // A template chosen from the keyboard's select, then Enter: the library's dialog; Cancel
  // from the keyboard returns the focus to the button.
  await selector(page, lang).focus();
  await selector(page, lang).selectOption({ label: "Cut 1800" });
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: t.templateDialog("Cut 1800", "Lina") });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: t.cancel, exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(button).toBeFocused();
}

/** BUG-686's class: a template picked before hydration is the one the button applies. */
async function prehydration(page: Page, lang: Lang) {
  const t = L[lang];
  const held = await holdHydration(page);
  await page.goto(`/clients/${LINA}/nutrition`, { waitUntil: "domcontentloaded" });
  await expect(selector(page, lang)).toBeVisible();
  await selector(page, lang).selectOption({ label: "Lean 1300" });
  expect(await held.release()).toBeGreaterThan(0);
  await waitForFiber(selector(page, lang));
  await expectStateHoldsWhatIsShown(selector(page, lang), "the select chosen before hydration");
  const dialog = page.getByRole("dialog", { name: t.templateDialog("Lean 1300", "Lina") });
  await pressApply(page, lang, t.applyLina, dialog);
  await expect(page.getByRole("dialog", { name: t.weekDialog })).toHaveCount(0);
}

/* ═══ Registration: Chromium (the config's project), then WebKit ═══════════════════════════════ */

type Ctx = { page: Page; context: BrowserContext; baseURL: string; lang: Lang; tag: string };
const SCENARIOS: [string, (c: Ctx) => Promise<void>][] = [
  ["G2.1: one card in the aside under the targets, one select (current targets, then the library's templates), the cost sentence before any click, one apply control; X1/X3/X4/X6", (c) => g21Structure(c.page, c.lang, c.tag)],
  ["G2.1: a 40-character name wraps inside the button, ≥ 44 px, no sideways scroll", (c) => g21LongName(c.page, c.context, c.baseURL, c.lang, c.tag)],
  ["G2.2: « Ses objectifs actuels » is today's apply: its dialog, success, 429, 409 and 422 as at a862698", (c) => g22CurrentTargets(c.page, c.context, c.baseURL, c.lang, c.tag)],
  ["G2.3: a template opens the library's dialog for this client, word for word, without the picker", (c) => g23LibraryComposition(c.page, c.lang, c.tag)],
  ["G2.3: confirming writes the targets then the week; the outcome shows once, the cards show the server's values, no reload", (c) => g23Applied(c.page, c.context, c.baseURL, c.lang, c.tag)],
  ["G2.3: rate-limited, generating, failed, unknown, targets failed, targets unknown, each once on this page", (c) => g23Outcomes(c.page, c.context, c.baseURL, c.lang, c.tag)],
  ["G2.4: WEEK_FAILED quotes the card's button exactly as rendered (a name, a 40-character name, no name)", (c) => g24Label(c.page, c.context, c.baseURL, c.lang, c.tag)],
  ["G2.5: the template list cannot be read: the first option, the sentence, the page and today's apply still work; zero templates: no sentence", (c) => g25ReadFails(c.page, c.context, c.baseURL, c.lang, c.tag)],
  ["G2.6: no « ou recettes », « Déjà appliqué aujourd'hui », « Disponible aujourd'hui » or reset time", (c) => g26NotBuilt(c.page, c.lang, c.tag)],
  ["keyboard: Tab reaches the select then the button, each with a ring; Enter opens; leaving the dialog returns the focus", (c) => keyboard(c.page, c.lang, c.tag)],
  ["BUG-686's class: a template chosen before hydration is the one the button applies", (c) => prehydration(c.page, c.lang)],
];

for (const lang of ["en", "fr"] as const) {
  test.describe(`EV-337g2 (${lang}, Chromium)`, () => {
    test.use({ locale: LOCALE[lang] });
    test.beforeEach(async ({ page }) => {
      await signInThroughForm(page, { lang });
    });
    for (const [name, run] of SCENARIOS) {
      test(name, async ({ page, context, baseURL }) => {
        await run({ page, context, baseURL: baseURL as string, lang, tag: `${lang}-chromium` });
      });
    }
  });
}

test.describe("EV-337g2 in WebKit, EN and FR", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });
  for (const lang of ["en", "fr"] as const) {
    for (const [name, run] of SCENARIOS) {
      test(`WebKit (${lang}): ${name}`, async ({ baseURL }) => {
        const context = await browser.newContext({ baseURL, locale: LOCALE[lang], viewport: { width: 1280, height: 900 } });
        // WebKit's Accept-Language is not enough for the French portal (client-tab-bar.spec.ts).
        await context.addCookies([{ name: "evoli_pro_locale", value: lang, url: baseURL as string }]);
        const page = await context.newPage();
        try {
          await signInThroughForm(page, { lang });
          await run({ page, context, baseURL: baseURL as string, lang, tag: `${lang}-webkit` });
        } finally {
          await context.close();
        }
      });
    }
  }
});

