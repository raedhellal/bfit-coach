import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-718 (ruling 718-R1) — a "Use on a trainee" outcome of WEEK_FAILED names the week card's
 * « Apply to … » button ONLY when the page it lands on draws that card.
 *
 * The button is drawn by `NutritionWeekCard` alone, and `/clients/[id]/nutrition` draws that
 * card only when the overview read succeeded, the NUTRITION scope is shared and the nutrition
 * read succeeded. On every other branch the outcome prints its two lead sentences and stops:
 * no instruction, no quoted label, no new wording.
 *
 * Reached in the roster config (the picker is built from the populated roster), with the
 * fixture's cookie switches thrown once the confirm dialog is open (the dialog-open read
 * must succeed, the landing's reads must not):
 *
 *   (1) `evoli_fixture_week=fail` + `evoli_fixture_overview=fail` — the landing's overview
 *       read fails: the name is unknown, the week card is not drawn.
 *   (3) `evoli_fixture_week=fail` + `evoli_fixture_summary_read=nutrition:500:<Petra>` — the
 *       overview read succeeds, the NUTRITION read fails: the header names Petra, the week
 *       card is still not drawn. The rule follows the card, not the overview.
 *   (2) control: `evoli_fixture_week=fail` alone — unchanged, the button is quoted and drawn.
 *   control: `evoli_fixture_display_name=<Petra>:__null__` + week fail — a NAMELESS trainee's
 *       page draws the week card ("Apply to Unnamed client"), so the instruction stays.
 *
 * Sentences are literals, never imported from `src/lib/copy.ts`. The French lead of (1) says
 * « de ce client » with the case of the first letter left open on purpose: BUG-720 (ruling
 * 720-R1) lower-cases that fallback mid-sentence on its own branch, and this spec must hold on
 * either side of that merge. BUG-720's own spec pins the lower case.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";
const PETRA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0006";
const CUT = "Cut 1800";

type Lang = "en" | "fr";

const L = {
  en: {
    locale: "en-US",
    use: "Use on a trainee",
    confirm: "Confirm",
    confirmTitle: (first: string) => `Use “${CUT}” on ${first}?`,
    loadError: "This trainee's nutrition could not be loaded.",
    /** (1) — the overview failed: the fallback leads the sentence. */
    outageLead: /^This trainee's targets are updated\. Their meals couldn't be rebuilt\.$/,
    /** (3) — the overview named Petra. */
    petraLead: "Petra's targets are updated. Their meals couldn't be rebuilt.",
    petraFull: "Petra's targets are updated. Their meals couldn't be rebuilt. Use “Apply to Petra L.” to try again.",
    petraButton: "Apply to Petra L.",
    namelessFull:
      "This trainee's targets are updated. Their meals couldn't be rebuilt. Use “Apply to Unnamed client” to try again.",
    namelessButton: "Apply to Unnamed client",
    unnamed: "Unnamed client",
    namelessTitle: /^Use “Cut 1800” on [Tt]his trainee\?$/,
    applyWords: /Apply to/,
    applyButton: /^Apply to\b/,
  },
  fr: {
    locale: "fr-FR",
    use: "Utiliser pour un client",
    confirm: "Confirmer",
    confirmTitle: (first: string) => `Utiliser « ${CUT} » pour ${first} ?`,
    loadError: "La nutrition de ce client n'a pas pu être chargée.",
    outageLead: /^Les objectifs de [Cc]e client sont mis à jour\. Ses repas n'ont pas pu être reconstruits\.$/,
    petraLead: "Les objectifs de Petra sont mis à jour. Ses repas n'ont pas pu être reconstruits.",
    petraFull:
      "Les objectifs de Petra sont mis à jour. Ses repas n'ont pas pu être reconstruits. Utilisez « Appliquer à Petra L. » pour réessayer.",
    petraButton: "Appliquer à Petra L.",
    namelessFull:
      /^Les objectifs de [Cc]e client sont mis à jour\. Ses repas n'ont pas pu être reconstruits\. Utilisez «\sAppliquer à Client sans nom\s» pour réessayer\.$/,
    namelessButton: "Appliquer à Client sans nom",
    unnamed: "Client sans nom",
    namelessTitle: /^Utiliser «\sCut 1800\s» pour [Cc]e client\s\?$/,
    applyWords: /Appliquer à|Apply to/,
    applyButton: /^(Appliquer à|Apply to)\b/,
  },
} as const;

/** Every quotation mark either language could wrap a quoted label in. */
const QUOTES = /[“”«»"]/;

async function setSwitch(context: BrowserContext, baseURL: string, name: string, value: string) {
  await context.addCookies([{ name, value, url: baseURL }]);
}

function outcome(page: Page) {
  return page.getByTestId("template-use-outcome");
}

/** Library → "Use on a trainee" on Cut 1800 → `trainee`. Returns the open confirm dialog. */
async function openConfirm(page: Page, lang: Lang, trainee: string, title: string | RegExp) {
  const t = L[lang];
  await page.goto("/nutrition-templates");
  const picker = page.getByRole("dialog", { name: t.use });
  await expect(async () => {
    await page.getByRole("group", { name: CUT, exact: true }).getByRole("button", { name: t.use }).click();
    await expect(picker).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await picker.getByRole("button", { name: trainee, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: t.confirm })).toBeEnabled();
  return dialog;
}

/** Confirm, land on Petra's nutrition page, and return the outcome's sentence paragraph. */
async function confirmAndLand(page: Page, lang: Lang, dialog: ReturnType<Page["getByRole"]>) {
  await dialog.getByRole("button", { name: L[lang].confirm }).click();
  await page.waitForURL(`/clients/${PETRA}/nutrition`);
  await expect(outcome(page)).toBeVisible();
  return outcome(page).locator("p").first();
}

/** The page drew no week card, so no « Apply to … » control exists anywhere on it. */
async function expectNoApplyButton(page: Page, lang: Lang) {
  await expect(page.getByText(L[lang].loadError, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: L[lang].applyButton })).toHaveCount(0);
}

/** (1) — the overview read fails on landing. */
async function overviewFailed(page: Page, context: BrowserContext, baseURL: string, lang: Lang) {
  const dialog = await openConfirm(page, lang, "Petra L.", L[lang].confirmTitle("Petra"));
  await setSwitch(context, baseURL, "evoli_fixture_week", "fail");
  await setSwitch(context, baseURL, "evoli_fixture_overview", "fail");
  const sentence = await confirmAndLand(page, lang, dialog);
  await expect(sentence).toHaveText(L[lang].outageLead);
  await expect(sentence).not.toHaveText(L[lang].applyWords);
  await expect(sentence).not.toHaveText(QUOTES);
  await expectNoApplyButton(page, lang);
}

/** (3) — the overview succeeds, the nutrition read fails on landing. */
async function nutritionReadFailed(page: Page, context: BrowserContext, baseURL: string, lang: Lang) {
  const dialog = await openConfirm(page, lang, "Petra L.", L[lang].confirmTitle("Petra"));
  await setSwitch(context, baseURL, "evoli_fixture_week", "fail");
  await setSwitch(context, baseURL, "evoli_fixture_summary_read", `nutrition:500:${PETRA}`);
  const sentence = await confirmAndLand(page, lang, dialog);
  await expect(sentence).toHaveText(L[lang].petraLead);
  await expect(sentence).not.toHaveText(QUOTES);
  // The overview read succeeded: the header names her, so this is not the outage branch.
  await expect(page.getByRole("heading", { level: 1, name: "Petra L." })).toBeVisible();
  await expectNoApplyButton(page, lang);
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-718 — no week card, no « Apply to » (${lang}, Chromium)`, () => {
    test.use({ locale: L[lang].locale });

    test.beforeEach(async ({ page }) => {
      await signInThroughForm(page, { email: EMAIL, password: PASSWORD, lang });
    });

    test("(1) the overview read fails on landing: the two lead sentences, and nothing after them", async ({
      page,
      context,
      baseURL,
    }) => {
      await overviewFailed(page, context, baseURL as string, lang);
    });

    test("(3) the nutrition read fails, the overview does not: the outcome still names no button", async ({
      page,
      context,
      baseURL,
    }) => {
      await nutritionReadFailed(page, context, baseURL as string, lang);
    });

    test("(2) control — the week card is drawn: the instruction quotes its button, which is there", async ({
      page,
      context,
      baseURL,
    }) => {
      const dialog = await openConfirm(page, lang, "Petra L.", L[lang].confirmTitle("Petra"));
      await setSwitch(context, baseURL as string, "evoli_fixture_week", "fail");
      const sentence = await confirmAndLand(page, lang, dialog);
      await expect(sentence).toHaveText(L[lang].petraFull);
      await expect(page.getByRole("button", { name: L[lang].petraButton, exact: true })).toBeVisible();
    });

    test("control — a nameless trainee's page draws the week card, so the instruction stays", async ({
      page,
      context,
      baseURL,
    }) => {
      await setSwitch(context, baseURL as string, "evoli_fixture_display_name", `${PETRA}:__null__`);
      // The picker lists the label; the dialog's title speaks of the fallback, whose first
      // letter's case is BUG-720's (left open here, see the header).
      const dialog = await openConfirm(page, lang, L[lang].unnamed, L[lang].namelessTitle);
      await setSwitch(context, baseURL as string, "evoli_fixture_week", "fail");
      const sentence = await confirmAndLand(page, lang, dialog);
      await expect(sentence).toHaveText(L[lang].namelessFull);
      await expect(page.getByRole("button", { name: L[lang].namelessButton, exact: true })).toBeVisible();
    });
  });
}

/* The configs' project is Chromium; WebKit is launched here, like client-tab-bar.spec.ts. */
test.describe("BUG-718 in WebKit — the two no-card branches, EN and FR", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  const branches = [
    ["(1) the overview read fails", overviewFailed],
    ["(3) the nutrition read fails", nutritionReadFailed],
  ] as const;
  for (const lang of ["en", "fr"] as const) {
    for (const [name, branch] of branches) {
      test(`${name}, WebKit, ${lang}`, async ({ baseURL }) => {
        const context = await browser.newContext({ baseURL, locale: L[lang].locale });
        // WebKit's Accept-Language is not enough for the French portal (client-tab-bar.spec.ts).
        await context.addCookies([{ name: "evoli_pro_locale", value: lang, url: baseURL as string }]);
        const page = await context.newPage();
        try {
          await signInThroughForm(page, { email: EMAIL, password: PASSWORD, lang });
          await branch(page, context, baseURL as string, lang);
        } finally {
          await context.close();
        }
      });
    }
  }
});
