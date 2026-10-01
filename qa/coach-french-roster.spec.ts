import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { FOOTER_FR, expectFooterOnScreen, expectNoEnglish, signInFrench } from "./french";

/**
 * EV-324 — the POPULATED roster in French ("qui a besoin de moi aujourd'hui", demo beat 1),
 * and the template "use on a client" dialog, which needs the roster's rows to offer anyone.
 *
 * Runs on `playwright.roster.config.ts` (`npm run test:e2e:roster`): the default suite's
 * fixture scenario serves an empty roster. The checks are `coach-french.spec.ts`'s.
 */

/** A French short date: "28 sept. 2026" (fr-FR, `month: "short"`). */
const FRENCH_DATE = /^\d{1,2} (janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.) \d{4}$/;

test.describe("a French browser (fr-FR) at 1280 × 800", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 } });

  test("the roster's triage, columns, badges and dates are French", async ({ page }) => {
    await signInFrench(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();

    const table = page.locator(".only-wide");
    for (const column of ["Client", "Dernière séance", "Série", "Alertes", "Statut"]) {
      await expect(table.getByRole("columnheader", { name: column, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("radio", { name: "À surveiller" })).toBeVisible();
    await expect(table.getByText("ACTIF", { exact: true }).first()).toBeVisible();

    // AC3 on the roster's last-session date: Lina's row carries a real one.
    const lina = table.locator("tbody tr", { hasText: "Lina M." });
    const dates = await lina.locator("td").allInnerTexts();
    expect(dates.map((t) => t.trim()).filter((t) => FRENCH_DATE.test(t)), "Lina's last-session date, fr-FR").toHaveLength(1);

    await expectFooterOnScreen(page, FOOTER_FR);
    await expectNoEnglish(page, "the populated roster");
  });

  test("the template's 'use on a client' dialog is French", async ({ page }) => {
    await signInFrench(page);
    await page.goto("/templates");
    await page.getByRole("button", { name: "Utiliser pour un client" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(
        "Cela remplit votre brouillon pour ce client. Rien ne change pour lui tant que vous n'avez pas publié.",
        { exact: true }
      )
    ).toBeVisible();
    await expectNoEnglish(page, "the use-on-a-client dialog");
  });

  /**
   * PB-4 / BUG-463 — "le matériel de Inès Moreau" read at the BUG-195c gate. Lina is
   * served as "Inès Moreau" in this context only (`evoli_fixture_display_name`); the
   * populated roster has no vowel-initial client of its own.
   */
  test("the template dialog elides before a vowel-initial client: le matériel d'Inès Moreau", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([
      {
        name: "evoli_fixture_display_name",
        value: `6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001:${encodeURIComponent("Inès Moreau")}`,
        url: baseURL as string,
      },
    ]);
    await signInFrench(page);
    await page.goto("/templates");
    await page.getByRole("button", { name: "Utiliser pour un client" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").selectOption({ label: "Inès Moreau" });
    await expect(
      dialog.getByText("Les blessures et le matériel d'Inès Moreau sont pris en compte à la publication.", {
        exact: true,
      })
    ).toBeVisible();
    await expect(dialog.getByText(/de Inès/)).toHaveCount(0);
  });
});
