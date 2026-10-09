import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-711 — the client nutrition page's five writes: a write whose answer was LOST is
 * not reported as a failure. In **fixture mode** (see playwright.config.ts).
 *
 * senior-po's ruling (2026-10-09, BUG-523's line extended to this page): for the targets
 * save, the week apply, the day regenerate, the swap and the recipe placement, an error
 * that is not an `ApiError`, a received `502`, `503` or `504`, and a server-action request
 * that failed in the browser (the islands' `settled()` fallback) are NO ANSWER. Each
 * shows its own sentence in place of the failure sentence. A plain `500` keeps the
 * failure sentence, and a `403` keeps the access outcome (the page leaves for
 * /clients/denied). No control is disabled, and the page does not reload itself.
 *
 * How each outcome is produced:
 *   · `502` / `503` / `504` / `thrown` / `500` — `evoli_fixture_nutrition_lost=<write>_<x>`
 *     (`src/lib/coachApi.fixture.ts`, `loseNutritionAnswer`): that one write answers the
 *     status, or throws `TypeError("fetch failed")` (the connection to b-fit-api lost).
 *   · `aborted` — the BROWSER's server-action POST is aborted (`route.abort()`), so the
 *     action never reaches the server and the island's `settled()` fallback answers.
 *   · `403` — `evoli_fixture_link=ended`, set after everything before the write was read.
 *
 * Six surfaces, because the swap is reached two ways: from the recipes-first sheet's
 * suggestions (placement flag on, Lina) and from the flag-off sheet (Pia), and the two
 * render the outcome through different code.
 *
 * Every sentence is a LITERAL here, never imported from `copy.ts`. Matched `exact`:
 * `getByText` is a case-insensitive substring otherwise.
 */

const PASSWORD = "Password123!";
const COACH = "coach@evoli.fit";
/** EV-272's C1: six recipes, Lentil bowl among them. */
const C1 = "coach.c1@evoli.fit";
/** Targets + a current week; placement flag on. */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** The one trainee the placement flag is off for (the flag-off Swap sheet). */
const PIA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0018";
/** VEGETARIAN, no allergies: Lentil bowl places on Wednesday lunch. */
const TESS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0019";

type Lang = "en" | "fr";
type Outcome = "502" | "503" | "504" | "thrown" | "aborted" | "500" | "403";
type Write = "targets" | "week" | "day" | "swap" | "place";

/* ── verbatim (BUG-711's row, hub BUGS.md) ─────────────────────────────────── */
const NO_ANSWER: Record<Write, Record<Lang, string>> = {
  targets: {
    en: "We couldn't confirm whether the targets were saved. Reload the page before you try again.",
    fr: "Nous n'avons pas pu confirmer si les objectifs ont été enregistrés. Rechargez la page avant de réessayer.",
  },
  week: {
    en: "We couldn't confirm whether the meal week was applied. Reload the page before you try again.",
    fr: "Nous n'avons pas pu confirmer si la semaine de repas a été appliquée. Rechargez la page avant de réessayer.",
  },
  day: {
    en: "We couldn't confirm whether the day was regenerated. Reload the page before you try again.",
    fr: "Nous n'avons pas pu confirmer si le jour a été régénéré. Rechargez la page avant de réessayer.",
  },
  swap: {
    en: "We couldn't confirm whether the meal was swapped. Reload the page before you try again.",
    fr: "Nous n'avons pas pu confirmer si le repas a été remplacé. Rechargez la page avant de réessayer.",
  },
  place: {
    en: "We couldn't confirm whether the recipe was used. Reload the page before you try again.",
    fr: "Nous n'avons pas pu confirmer si la recette a été utilisée. Rechargez la page avant de réessayer.",
  },
};

/** Today's failure sentences, which a lost answer must not show and a 500 still does. */
const FAILED: Record<Write, Record<Lang, string>> = {
  targets: { en: "The targets could not be saved.", fr: "Les objectifs n'ont pas pu être enregistrés." },
  week: { en: "The meal week could not be applied.", fr: "La semaine de repas n'a pas pu être appliquée." },
  day: { en: "The day could not be regenerated.", fr: "Le jour n'a pas pu être régénéré." },
  swap: { en: "The meal could not be swapped.", fr: "Le repas n'a pas pu être remplacé." },
  place: { en: "The recipe could not be used. Try again.", fr: "La recette n'a pas pu être utilisée. Réessayez." },
};

/* ── control names (the page's own labels, per language) ───────────────────── */
const L = {
  en: {
    saveTargets: "Save targets",
    applyLina: "Apply to Lina M.",
    apply: "Apply",
    regenerateMonday: "Regenerate day: Monday",
    swapPrefix: /^Swap meal: /,
    showSuggestions: "Show suggestions",
    wednesdayLunch: "Wednesday Lunch",
    search: "Search your recipes",
    chooseLentil: "Choose Lentil bowl",
    confirm: "Confirm",
  },
  fr: {
    saveTargets: "Enregistrer les objectifs",
    applyLina: "Appliquer à Lina M.",
    apply: "Appliquer",
    regenerateMonday: "Régénérer le jour\u00a0: Lundi",
    swapPrefix: /^Remplacer le repas\s: /, // U+00A0 before the colon (`common.labelled`)
    showSuggestions: "Voir des suggestions",
    wednesdayLunch: "Mercredi Déjeuner",
    search: "Rechercher dans vos recettes",
    chooseLentil: "Choisir Lentil bowl",
    confirm: "Confirmer",
  },
} as const;

/**
 * One surface: who signs in, which page, what is opened before the write, and the
 * control the write is sent from. `open` stops one click short of the write and returns
 * that click's target, so the outcome switch can be thrown at the last moment (the 403
 * must not hit a read on the way). `retry` is the control that started it, which must
 * stay usable afterwards.
 */
interface Surface {
  name: string;
  write: Write;
  coach: string;
  trainee: string;
  open: (page: Page, lang: Lang) => Promise<Locator>;
  retry: (page: Page, lang: Lang) => Locator;
  /** The outcome's sentence is in the sheet's refusal block, not on the page. */
  inSheet?: boolean;
}

/** Retried until the dialog answers: a click before hydration is a no-op. */
async function openDialog(page: Page, trigger: Locator): Promise<Locator> {
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  return dialog;
}

const SURFACES: Surface[] = [
  {
    name: "targets save",
    write: "targets",
    coach: COACH,
    trainee: LINA,
    open: async (page, lang) => {
      await page.getByLabel("Calories").fill("2300");
      const dialog = await openDialog(page, page.getByRole("button", { name: L[lang].saveTargets, exact: true }));
      return dialog.getByRole("button", { name: L[lang].saveTargets, exact: true });
    },
    retry: (page, lang) => page.getByRole("button", { name: L[lang].saveTargets, exact: true }),
  },
  {
    name: "week apply",
    write: "week",
    coach: COACH,
    trainee: LINA,
    open: async (page, lang) => {
      const dialog = await openDialog(page, page.getByRole("button", { name: L[lang].applyLina, exact: true }));
      return dialog.getByRole("button", { name: L[lang].apply, exact: true });
    },
    retry: (page, lang) => page.getByRole("button", { name: L[lang].applyLina, exact: true }),
  },
  {
    name: "day regenerate",
    write: "day",
    coach: COACH,
    trainee: LINA,
    open: async (page, lang) => {
      const button = page.getByRole("button", { name: L[lang].regenerateMonday, exact: true });
      await expect(button).toBeEnabled();
      return button;
    },
    retry: (page, lang) => page.getByRole("button", { name: L[lang].regenerateMonday, exact: true }),
  },
  {
    name: "swap (recipes-first sheet, suggestions)",
    write: "swap",
    coach: COACH,
    trainee: LINA,
    open: async (page, lang) => {
      const dialog = await openDialog(page, page.getByRole("button", { name: L[lang].swapPrefix }).first());
      const region = dialog.getByRole("region", { name: "Suggestions" });
      await region.getByRole("button", { name: L[lang].showSuggestions, exact: true }).click();
      const candidate = region.getByRole("button").filter({ hasText: /kcal · / }).first();
      await expect(candidate).toBeVisible();
      return candidate;
    },
    retry: (page, lang) => page.getByRole("button", { name: L[lang].swapPrefix }).first(),
  },
  {
    name: "swap (flag-off sheet)",
    write: "swap",
    coach: COACH,
    trainee: PIA,
    open: async (page, lang) => {
      const dialog = await openDialog(page, page.getByRole("button", { name: L[lang].swapPrefix }).first());
      const candidate = dialog.getByRole("button").filter({ hasText: /kcal · / }).first();
      await expect(candidate).toBeVisible();
      return candidate;
    },
    retry: (page, lang) => page.getByRole("button", { name: L[lang].swapPrefix }).first(),
  },
  {
    name: "recipe placement",
    write: "place",
    coach: C1,
    trainee: TESS,
    open: async (page, lang) => {
      const row = page.getByRole("group", { name: L[lang].wednesdayLunch, exact: true });
      const dialog = await openDialog(page, row.getByRole("button", { name: L[lang].swapPrefix }));
      await dialog.getByLabel(L[lang].search).fill("lent");
      await dialog.getByRole("button", { name: L[lang].chooseLentil, exact: true }).click();
      return dialog.getByRole("button", { name: L[lang].confirm, exact: true });
    },
    // The sheet stays open on the refusal (EV-256e AC3): the coach can choose again.
    retry: (page, lang) => page.getByRole("dialog").getByRole("button", { name: L[lang].chooseLentil, exact: true }),
    inSheet: true,
  },
];

async function setCookie(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, domain: "localhost", path: "/" }]);
}

/** Aborts every server-action POST the browser sends from now on. */
async function abortActions(page: Page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
      await route.abort("connectionreset");
    } else {
      await route.fallback();
    }
  });
}

/**
 * Every text the page shows from now on, collected on the NODE side so that neither a
 * re-render nor a navigation can erase a sentence that flashed (the 403 run).
 */
async function recordTexts(page: Page): Promise<string[]> {
  const seen: string[] = [];
  await page.exposeFunction("__bug711Saw", (text: string) => void seen.push(text));
  await page.evaluate(() => {
    const report = (window as unknown as { __bug711Saw: (t: string) => void }).__bug711Saw;
    new MutationObserver(() => report(document.body.innerText)).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  return seen;
}

async function signIn(page: Page, email: string, lang: Lang) {
  await signInThroughForm(page, { email, password: PASSWORD, lang });
}

async function run(page: Page, surface: Surface, lang: Lang, outcome: Outcome) {
  await signIn(page, surface.coach, lang);
  const res = await page.goto(`/clients/${surface.trainee}/nutrition`);
  expect(res?.status()).toBe(200);
  const commit = await surface.open(page, lang);

  if (outcome === "aborted") await abortActions(page);
  else if (outcome === "403") await setCookie(page, "evoli_fixture_link", "ended");
  else await setCookie(page, "evoli_fixture_nutrition_lost", `${surface.write}_${outcome}`);

  // The page must not reload itself: a hard load would drop this marker.
  await page.evaluate(() => void ((window as unknown as { __bug711: boolean }).__bug711 = true));
  const seen = await recordTexts(page);
  const url = page.url();
  await commit.click();

  const noAnswer = NO_ANSWER[surface.write][lang];
  const failed = FAILED[surface.write][lang];

  if (outcome === "403") {
    // (d) the access outcome, unchanged: the link ended, the page leaves.
    await page.waitForURL("**/clients/denied");
    expect(seen.join(" | "), "a 403 is never called a lost answer").not.toContain(noAnswer);
    return;
  }

  const expected = outcome === "500" ? failed : noAnswer;
  const other = outcome === "500" ? noAnswer : failed;
  // (c) b-fit-api's own 500 is a known failure: today's sentence, and not the new one.
  // (a) 502/503/504, (b) a thrown non-ApiError, and the `settled()` fallback: the reverse.
  if (surface.inSheet) await expect(page.getByTestId("placement-refusal")).toHaveText(expected);
  else await expect(page.getByText(expected, { exact: true })).toBeVisible();
  await expect(page.getByText(other, { exact: true })).toHaveCount(0);
  if (outcome !== "500") {
    expect(seen.join(" | "), "the failure sentence never flashed").not.toContain(failed);
  }

  // No control is disabled, and the page did not reload or move.
  if (outcome === "aborted") await page.unroute("**/*");
  await expect(surface.retry(page, lang)).toBeEnabled();
  expect(page.url()).toBe(url);
  expect(await page.evaluate(() => (window as unknown as { __bug711?: boolean }).__bug711)).toBe(true);
}

const EN_OUTCOMES: Outcome[] = ["502", "503", "504", "thrown", "aborted", "500", "403"];
const FR_OUTCOMES: Outcome[] = ["502", "503", "504", "thrown", "500"];

for (const surface of SURFACES) {
  test.describe(`BUG-711 — ${surface.name}`, () => {
    for (const outcome of EN_OUTCOMES) {
      test(`EN ${outcome}`, async ({ page }) => {
        await run(page, surface, "en", outcome);
      });
    }
  });
  test.describe(`BUG-711 — ${surface.name}, in French`, () => {
    // `Accept-Language: fr-FR`: the portal speaks French from the sign-in form on.
    test.use({ locale: "fr-FR" });
    for (const outcome of FR_OUTCOMES) {
      test(`FR ${outcome}`, async ({ page }) => {
        await run(page, surface, "fr", outcome);
      });
    }
  });
}
