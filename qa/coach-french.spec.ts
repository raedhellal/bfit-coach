import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { FOOTER_EN, FOOTER_FR, expectFooterOnScreen, expectNoEnglish, signInFrench } from "./french";

/**
 * EV-324 — the portal in French for a French browser (AC1, AC3, AC5b), and English for
 * everyone else.
 *
 * `locale: "fr-FR"` makes Chromium send `Accept-Language: fr-FR` and report
 * `navigator.language === "fr-FR"`, which is what a coach's Chrome with Français (France)
 * first does.
 *
 * Each demo page is checked three ways:
 *   · `<html lang="fr">` (AC3);
 *   · one French sentence that only that page renders (a LITERAL, not read from copy.fr.ts);
 *   · NO ENGLISH LEFTOVER: no text node and no aria-label / title / placeholder / alt on the
 *     page equals a string of the English dictionary that French translates differently —
 *     and none CONTAINS one of those strings that is 20 characters or longer (a composed
 *     sentence). Coach-authored text, trainee names and api-served names (meals, exercises,
 *     recipes) are content, not UI, and are not in the dictionary, so they cannot trip it.
 *
 * The populated roster lives in `coach-french-roster.spec.ts` (roster config); this
 * suite's fixture scenario serves an empty roster.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const CHICKEN_RICE_BOWL = "8e3f1b22-0000-4000-8000-0000000000c1";
const UPPER_LOWER = "7c2d0a11-0000-4000-8000-0000000000b1";

test.describe("a French browser (fr-FR) at 1280 × 800", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1280, height: 800 } });

  test("login: French, lang=fr, and the legal line", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
    await expectFooterOnScreen(page, FOOTER_FR);
    await expectNoEnglish(page, "/login");
  });

  // The fixture signs in any credentials, so the refusal reached here is middleware's
  // redirect reason — the sentence a coach whose session ended lands on.
  test("the sign-in page's refusal line is French too", async ({ page }) => {
    await page.goto("/login?error=expired");
    await expect(page.getByText("Votre session a été fermée.", { exact: true })).toBeVisible();
    await expectNoEnglish(page, "/login?error=expired");
  });

  test("roster (empty in this suite's scenario)", async ({ page }) => {
    await signInFrench(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Portail" })).toBeVisible();
    await expectFooterOnScreen(page, FOOTER_FR);
    await expectNoEnglish(page, "the roster");
  });

  test("a client's overview", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/clients/${LINA}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByText("Assiduité, 8 dernières semaines", { exact: true }).first()).toBeVisible();
    // The French navigation: « Programme » / « Nutrition », links of the tab bar the overview
    // shares with the other client pages since EV-342e (EV-337e had made them two buttons).
    await expect(page.getByRole("main").getByRole("link", { name: "Programme", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Nutrition", exact: true })).toBeVisible();
    await expectFooterOnScreen(page, FOOTER_FR);
    await expectNoEnglish(page, "the overview");
  });

  test("the client's routine, with the publish preview open", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/clients/${LINA}/routine`);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByText("Jours d'entraînement — Evoli les applique.", { exact: true })).toBeVisible();
    await expectFooterOnScreen(page, FOOTER_FR);
    await expectNoEnglish(page, "the routine tab");

    await page.getByRole("button", { name: "Publier", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Aucune modification nécessaire", { exact: true })).toBeVisible();
    await expectNoEnglish(page, "the publish preview");
  });

  test("the client's nutrition — AC3's grouped number, and the swap sheet open", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/clients/${LINA}/nutrition`);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByText("Objectifs quotidiens", { exact: true })).toBeVisible();
    // AC3: 150 g protein, 215 g carbs, 68 g fat → 2072 kcal, grouped with U+202F in French.
    await expect(
      page.getByText("Vos macros totalisent 2\u202f072 kcal — 78 en dessous de l'objectif calorique.", { exact: true })
    ).toBeVisible();
    await expectFooterOnScreen(page, FOOTER_FR);
    await expectNoEnglish(page, "the nutrition tab");

    await page.getByRole("button", { name: /^Remplacer le repas/ }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Rechercher dans vos recettes", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Voir des suggestions" })).toBeVisible();
    await expectNoEnglish(page, "the swap sheet");
  });

  test("the apply-week confirm", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/clients/${LINA}/nutrition`);
    await page.getByRole("button", { name: /^Appliquer à / }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Appliquer cette semaine de repas ?", { exact: true })).toBeVisible();
    await expectNoEnglish(page, "the apply confirm");
  });

  test("recipes: the list, a recipe, and a new one", async ({ page }) => {
    await signInFrench(page);
    await page.goto("/recipes");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { name: "Recettes", exact: true })).toBeVisible();
    await expectFooterOnScreen(page, FOOTER_FR);
    await expectNoEnglish(page, "the recipe library");

    await page.goto(`/recipes/${CHICKEN_RICE_BOWL}`);
    // An existing recipe is titled with its own name; the editor's section headings are the UI.
    await expect(page.getByRole("heading", { name: "Macros par portion" })).toBeVisible();
    await expectFooterOnScreen(page, FOOTER_FR);
    await expectNoEnglish(page, "the recipe editor");

    await page.goto("/recipes/new");
    await expect(page.getByRole("heading", { name: "Nouvelle recette" })).toBeVisible();
    await expect(page.getByPlaceholder("En anglais : chicken, rice, oats…")).toBeVisible();
    await expectNoEnglish(page, "a new recipe");
  });

  test("templates: the list and the editor", async ({ page }) => {
    await signInFrench(page);
    await page.goto("/templates");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1, name: "Modèles d'entraînement", exact: true })).toBeVisible();
    await expectFooterOnScreen(page, FOOTER_FR);
    await expectNoEnglish(page, "the template library");

    await page.goto(`/templates/${UPPER_LOWER}`);
    // An existing template is titled with its own name; the weekday heading is the UI.
    await expect(page.getByRole("heading", { name: "Jours d'entraînement — Evoli les applique." })).toBeVisible();
    await expectFooterOnScreen(page, FOOTER_FR);
    await expectNoEnglish(page, "the template editor");

    await page.goto("/templates/new");
    await expect(page.getByRole("heading", { name: "Nouveau modèle" })).toBeVisible();
    await expectNoEnglish(page, "a new template");
  });
});

test.describe("an English browser (en-US)", () => {
  test.use({ locale: "en-US", viewport: { width: 1280, height: 800 } });

  test("lang=en and the English legal line", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expectFooterOnScreen(page, FOOTER_EN);
  });
});

/**
 * RE-PINNED 2026-10-02 (Evoli Pro redesign, branch 1). Under EV-324's R1 this browser was
 * English ("only the first entry decides"). The rule that replaced R1 picks the
 * highest-weighted French or English entry and defaults to French, so it is French now.
 */
test.describe("a German-first browser that also lists French (edge case 2)", () => {
  test.use({ locale: "de-DE", extraHTTPHeaders: { "Accept-Language": "de-DE,fr;q=0.9" } });

  test("is French: French is the only entry the portal speaks", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  });
});
