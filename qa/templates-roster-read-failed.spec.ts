import { existsSync } from "node:fs";
import { expect, webkit, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-738 — /templates, « Appliquer à un client » / "Use on a trainee": a FAILED roster
 * read said « Aucun de vos clients n'a partagé ses séances avec vous. » / "You have no
 * trainees who have shared their workouts with you.", a false statement about the coach's
 * clients. The page mapped the failed `listClients` to `[]`.
 *
 * Expected, from the row:
 *   (1) with `evoli_fixture_roster=fail` (`GET /coach-portal/clients` answers 500, this
 *       browser context only), the dialog reads exactly the shipped
 *       `challenges.clientsLoadError` words, as an alert, and the apply button is disabled;
 *   (2) a coach with no sharing clients still sees the « Aucun de vos clients… » sentence.
 *       This suite's `empty` scenario serves a roster that really is empty, and the read
 *       SUCCEEDS — which the same test witnesses by finding no alert;
 *   (3) the library list, rename, duplicate and delete still work with the roster failing;
 *   (4) EN and FR, Chromium and WebKit.
 *
 * Sentences are literals, never imports from `src/lib/copy*.ts` (an import would agree
 * with the shipped string by construction).
 *
 * Red on 50f31f7: (1) finds the « Aucun de vos clients… » sentence and no alert.
 */

const T = {
  en: {
    locale: "en-US",
    use: "Use on a trainee",
    useIt: "Use this template",
    failed: "Your clients could not be loaded. Reload the page to try again.",
    none: "You have no trainees who have shared their workouts with you.",
    more: "More actions",
    rename: "Rename",
    nameLabel: "Template name",
    duplicate: "Duplicate",
    remove: "Delete",
    copySuffix: " (copy)",
  },
  fr: {
    locale: "fr-FR",
    use: "Appliquer à un client",
    useIt: "Appliquer",
    failed: "Vos clients n'ont pas pu être chargés. Rechargez la page pour réessayer.",
    none: "Aucun de vos clients n'a partagé ses séances avec vous.",
    more: "Plus d'actions",
    rename: "Renommer",
    nameLabel: "Nom du modèle",
    duplicate: "Dupliquer",
    remove: "Supprimer",
    copySuffix: " (copy)",
  },
} as const;

type Lang = keyof typeof T;

/** The fixture's seeded templates (the same names in both languages). */
const SEEDED_A = "Upper / Lower split";
const SEEDED_B = "Legacy strength";

function row(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

async function failRoster(context: BrowserContext, baseURL: string) {
  await context.addCookies([{ name: "evoli_fixture_roster", value: "fail", url: baseURL }]);
}

/** Opens « Use on a trainee » on SEEDED_A; retried until the island answers. */
async function openUse(page: Page, lang: Lang) {
  const t = T[lang];
  await page.goto("/templates");
  const dialog = page.getByRole("dialog", { name: t.use, exact: true });
  await expect(async () => {
    if (!(await dialog.isVisible())) await row(page, SEEDED_A).getByRole("button", { name: t.use, exact: true }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog;
}

/** (1) — the failed read is said as a failure, never as "no trainees". */
async function expectFailureSaid(page: Page, lang: Lang) {
  const t = T[lang];
  const dialog = await openUse(page, lang);
  await expect(dialog.getByRole("alert")).toHaveText([t.failed]);
  await expect(dialog.getByText(t.none, { exact: false })).toHaveCount(0);
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: t.useIt, exact: true })).toBeDisabled();
}

/** (2) — the control: a roster that really is empty still says so, and nothing failed. */
async function expectNoTraineesSaid(page: Page, lang: Lang) {
  const t = T[lang];
  const dialog = await openUse(page, lang);
  await expect(dialog.getByText(t.none, { exact: true })).toBeVisible();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.getByText(t.failed, { exact: false })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: t.useIt, exact: true })).toBeDisabled();
}

async function rowAction(page: Page, lang: Lang, name: string, action: "duplicate" | "rename" | "remove") {
  const t = T[lang];
  const more = row(page, name).getByRole("button", { name: t.more, exact: true });
  await expect(async () => {
    if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass();
  await row(page, name).getByRole("button", { name: t[action], exact: true }).click();
}

for (const lang of ["en", "fr"] as const) {
  const t = T[lang];

  test.describe(`BUG-738 Chromium (${lang})`, () => {
    test.use({ locale: t.locale });

    test("a failed roster read says the clients could not be loaded, as an alert, and nothing can be applied", async ({
      page,
      context,
      baseURL,
    }) => {
      await signInThroughForm(page, { lang });
      await failRoster(context, baseURL!);
      await expectFailureSaid(page, lang);
    });

    test("control: a roster that really is empty still says no trainee has shared their workouts", async ({ page }) => {
      await signInThroughForm(page, { lang });
      await expectNoTraineesSaid(page, lang);
    });

    test("with the roster failing, the library lists, renames, duplicates and deletes", async ({
      page,
      context,
      baseURL,
    }) => {
      await signInThroughForm(page, { lang });
      await failRoster(context, baseURL!);
      await page.goto("/templates");
      await expect(row(page, SEEDED_A)).toBeVisible();
      await expect(row(page, SEEDED_B)).toBeVisible();

      const renamed = `BUG-738 ${lang}`;
      await rowAction(page, lang, SEEDED_B, "rename");
      const rename = page.getByRole("dialog");
      await rename.getByLabel(t.nameLabel).fill(renamed);
      await rename.getByRole("button", { name: t.rename, exact: true }).click();
      await expect(row(page, renamed)).toBeVisible();
      await expect(row(page, SEEDED_B)).toHaveCount(0);

      await rowAction(page, lang, SEEDED_A, "duplicate");
      const copy = `${SEEDED_A}${t.copySuffix}`;
      await expect(row(page, copy)).toBeVisible();

      await rowAction(page, lang, copy, "remove");
      await page.getByRole("dialog").getByRole("button", { name: t.remove, exact: true }).click();
      await expect(row(page, copy)).toHaveCount(0);

      // From the server, not this client's state: a reload with the roster still failing.
      await page.reload();
      await expect(row(page, renamed)).toBeVisible();
      await expect(row(page, SEEDED_A)).toBeVisible();
      await expect(row(page, copy)).toHaveCount(0);
      await expect(row(page, SEEDED_B)).toHaveCount(0);
    });
  });
}

test.describe("BUG-738 WebKit", () => {
  let browser: Browser;
  test.beforeAll(async () => {
    expect(existsSync(webkit.executablePath()), "WebKit is not installed: npx playwright install webkit").toBe(true);
    browser = await webkit.launch();
  });
  test.afterAll(async () => {
    await browser?.close();
  });

  for (const lang of ["en", "fr"] as const) {
    async function withPage(baseURL: string, body: (page: Page, context: BrowserContext) => Promise<void>) {
      const context = await browser.newContext({ baseURL, locale: T[lang].locale });
      /**
       * The language is stated as the switch's cookie, as every WebKit spec here does. The
       * runner applies the project's `use` (and `fixture-test`'s Accept-Language: en-US) to
       * this hand-made context too: witnessed, a `fr-FR` WebKit context got `<html lang="en">`
       * and the English login form, so the French sign-in never found its labels.
       */
      await context.addCookies([{ name: "evoli_pro_locale", value: lang, url: baseURL }]);
      try {
        await body(await context.newPage(), context);
      } finally {
        await context.close();
      }
    }

    test(`(${lang}) a failed roster read says the clients could not be loaded, as an alert`, async ({ baseURL }) => {
      await withPage(baseURL!, async (page, context) => {
        await signInThroughForm(page, { lang });
        await failRoster(context, baseURL!);
        await expectFailureSaid(page, lang);
      });
    });

    test(`(${lang}) control: a roster that really is empty still says so`, async ({ baseURL }) => {
      await withPage(baseURL!, async (page) => {
        await signInThroughForm(page, { lang });
        await expectNoTraineesSaid(page, lang);
      });
    });
  }
});
