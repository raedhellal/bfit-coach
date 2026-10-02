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

/** A French short date: "28 sept. 2026" (fr-FR, `month: "short"`), "1er oct. 2026" on a 1st (BUG-491). */
const FRENCH_DATE = /^(?:1er|\d{1,2}) (janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.) \d{4}$/;

test.describe("a French browser (fr-FR) at 1280 × 800", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 } });

  test("the roster's triage, columns, badges and dates are French", async ({ page }) => {
    await signInFrench(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();

    // EV-337d: the table became grouped rows; each cell carries its own label.
    const lina = page.locator(".roster-row", { hasText: "Lina M." });
    for (const label of ["Série", "Dernière séance"]) {
      await expect(lina.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { level: 2, name: "À traiter" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "À surveiller" })).toBeVisible();
    await expect(lina.getByText("1 alerte", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Alertes · \d+$/ })).toBeVisible();

    // AC3 on the roster's last-session date: Lina trained yesterday — « Hier », with the
    // api's day as a French date in the tooltip and as the machine-readable `dateTime`.
    const when = lina.locator("time");
    await expect(when).toHaveText("Hier");
    expect(await when.getAttribute("title"), "Lina's last-session date, fr-FR").toMatch(FRENCH_DATE);
    expect(await when.getAttribute("datetime")).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await expectFooterOnScreen(page, FOOTER_FR);
    await expectNoEnglish(page, "the populated roster");
  });

  test("the template's 'use on a client' dialog is French", async ({ page }) => {
    await signInFrench(page);
    await page.goto("/templates");
    await page.getByRole("button", { name: "Appliquer à un client" }).first().click();
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
    await page.getByRole("button", { name: "Appliquer à un client" }).first().click();
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

/**
 * BUG-461 — the roster's PHONE card wrote "Dernière séance: 21 sept. 2026", the colon glued
 * to the word (composed in JSX). EV-337d draws the label on its own line above the value, so
 * no colon is composed at all: the label is exactly « Dernière séance » and the value sits
 * BELOW it, on every card.
 */
test.describe("a French browser (fr-FR) at 390 × 844", () => {
  test.use({ locale: "fr-FR", viewport: { width: 390, height: 844 } });

  test("BUG-461 — every card's last-session label is its own line, with no glued colon", async ({ page }) => {
    await signInFrench(page);
    const cells = page.locator(".roster-row .roster-last");
    await expect(cells).toHaveCount(6);
    const read = await cells.evaluateAll((els) =>
      els.map((el) => {
        const label = el.querySelector(".roster-cell-label")!;
        const value = el.querySelector(".roster-cell-value")!;
        return {
          label: label.textContent,
          below: value.getBoundingClientRect().top >= label.getBoundingClientRect().bottom - 0.5,
          text: el.textContent ?? "",
        };
      })
    );
    for (const cell of read) {
      expect(cell.label).toBe("Dernière séance");
      expect(cell.below, JSON.stringify(cell)).toBe(true);
      expect(cell.text).not.toContain("séance:");
    }
  });
});
