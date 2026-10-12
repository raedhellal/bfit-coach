import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-341j J4 — the roster's one pill per client: « Programme à préparer », « Séance d'essai
 * assignée », « Séance d'essai faite », and none for PUBLISHED or for a link without WORKOUTS.
 * On the POPULATED roster (playwright.roster.config.ts). From the seed: Tobias has all scopes
 * and no plan (AWAITING_PROGRAMME), Lina and Yusuf have a plan this coach published
 * (PUBLISHED), and Petra, Sara and Mara do not share their workouts (null).
 */

const TOBIAS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0009";

const PILLS = {
  en: { awaiting: "Programme to prepare", assigned: "Trial session assigned", done: "Trial session done" },
  fr: { awaiting: "Programme à préparer", assigned: "Séance d'essai assignée", done: "Séance d'essai faite" },
} as const;

function row(page: Page, name: string): Locator {
  return page.locator("a.roster-row").filter({ has: page.getByText(name, { exact: true }) });
}

function pill(page: Page, name: string): Locator {
  return row(page, name).locator("[data-programme-status]");
}

async function roster(page: Page): Promise<void> {
  await page.goto("/");
  await expect(row(page, "Tobias R.")).toBeVisible();
}

async function complete(page: Page): Promise<void> {
  const res = await page.request.post("/api/fixture/trial", { data: { clientId: TOBIAS, action: "complete" }, maxRedirects: 0 });
  expect(await res.json()).toEqual({ changed: true });
}

async function assignGoblet(page: Page, prepareLabel: string): Promise<void> {
  const card = page.getByRole("region", { name: "Trial session", exact: true });
  if (prepareLabel) await card.getByRole("button", { name: prepareLabel, exact: true }).click();
  await card.getByRole("button", { name: "Add exercise", exact: true }).click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel("Search the catalog").fill("Goblet Squat");
  await picker.getByRole("button", { name: /^Goblet Squat/ }).click();
  await picker.getByRole("button", { name: "Done", exact: true }).click();
  await card.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(card.getByText(/^Assigned on /)).toBeVisible();
}

test.describe("J4 (EN)", () => {
  test.use({ locale: "en-US" });

  test("one pill for AWAITING_PROGRAMME, none for PUBLISHED or not shared", async ({ page }) => {
    await signInThroughForm(page);
    await roster(page);
    await expect(pill(page, "Tobias R.")).toHaveText(PILLS.en.awaiting);
    await expect(pill(page, "Tobias R.")).toHaveAttribute("data-programme-status", "AWAITING_PROGRAMME");
    for (const name of ["Lina M.", "Yusuf A.", "Petra L.", "Sara P.", "Mara D."]) {
      await expect(row(page, name), `${name}'s row`).toHaveCount(1);
      await expect(pill(page, name), `${name}: no programme pill`).toHaveCount(0);
    }
    await expect(page.locator("[data-programme-status]")).toHaveCount(1);
    // The pill is part of what the row's link describes.
    const described = await row(page, "Tobias R.").getAttribute("aria-describedby");
    expect(described).toContain(`roster-${TOBIAS}-status`);
  });

  test("assigned, then done", async ({ page }) => {
    await signInThroughForm(page);
    await page.goto(`/clients/${TOBIAS}/routine`);
    await assignGoblet(page, "Prepare a trial session");
    await roster(page);
    await expect(pill(page, "Tobias R.")).toHaveText(PILLS.en.assigned);

    await complete(page);
    await roster(page);
    await expect(pill(page, "Tobias R.")).toHaveText(PILLS.en.done);
  });
});

test.describe("J4 (FR)", () => {
  test.use({ locale: "fr-FR" });

  test("the three pills in French", async ({ page }) => {
    await signInThroughForm(page, { lang: "fr" });
    await roster(page);
    await expect(pill(page, "Tobias R.")).toHaveText(PILLS.fr.awaiting);
    // The trial is assigned through the English portal's twin in the fixture store; the pill is what is under test.
    const origin = new URL(page.url()).origin;
    const en = await page.context().browser()!.newContext({ locale: "en-US", baseURL: origin });
    // The language switch's cookie, not `locale` alone: in this hand-made context Chromium sent
    // `Accept-Language: en-US` on navigations but `fr-FR` on the server actions' fetches
    // (measured on train/coach-s3p), so the assign's revalidated render came back French and
    // « Assigned on » was a race against it. The cookie wins over the header (`getLocale`).
    await en.addCookies([{ name: "evoli_pro_locale", value: "en", url: origin }]);
    const other = await en.newPage();
    try {
      await signInThroughForm(other);
      await other.goto(`/clients/${TOBIAS}/routine`);
      await assignGoblet(other, "Prepare a trial session");
    } finally {
      await en.close();
    }
    await roster(page);
    await expect(pill(page, "Tobias R.")).toHaveText(PILLS.fr.assigned);
    await complete(page);
    await roster(page);
    await expect(pill(page, "Tobias R.")).toHaveText(PILLS.fr.done);
  });
});
