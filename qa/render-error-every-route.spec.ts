import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-704 [GUARD] — the BUG-689 render-error switch reaches EVERY signed-in coach route.
 *
 * `evoli_fixture_render_error=always` must put the root error page (`src/app/error.tsx`) on
 * each route below, EN and FR. The switch used to poison `getMe`; EV-342k removed that read
 * from every page but the roster and the switch went silent on the rest, unnoticed except
 * where a test happened to look. It now fires from `CoachShell` (`throwIfFixtureRenderError`
 * in `src/lib/fixtureFault.ts`), which every route here draws and which makes no api read.
 *
 * The list is every `page.tsx` under `src/app` that draws `CoachShell` (the coach's signed-in
 * pages; `/login`, `/activate`, `/unavailable` and the `/i` invitation pages draw no shell).
 * Populated scenario, for the seeded challenge, nutrition template and invited account.
 * One table, asserted at once: a switch that stops firing shows WHICH routes it lost.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const TEMPLATE = "7c2d0a11-0000-4000-8000-0000000000b1";
const RECIPE = "8e3f1b22-0000-4000-8000-0000000000c1";
const NUTRITION_TEMPLATE = "5e1a7c00-0000-4000-8000-0000000000d1";
const CHALLENGE = "c4a11e00-0000-4000-8000-000000000001";
const INVITED = "204b0000-0000-4000-8000-000000000001";

const ROUTES = [
  "/",
  "/challenges",
  `/challenges/${CHALLENGE}`,
  `/clients/${LINA}`,
  `/clients/${LINA}/routine`,
  `/clients/${LINA}/nutrition`,
  "/clients/denied",
  `/invited/${INVITED}`,
  "/templates",
  "/templates/new",
  `/templates/${TEMPLATE}`,
  "/recipes",
  "/recipes/new",
  `/recipes/${RECIPE}`,
  "/nutrition-templates",
  "/nutrition-templates/new",
  `/nutrition-templates/${NUTRITION_TEMPLATE}`,
];

/** The root error page's h1: the roster's own sentence on `/` (`error.tsx` `onRoster`), else the general one. */
const SENTENCE = { en: "Something went wrong.", fr: "Une erreur est survenue." } as const;
const ROSTER_SENTENCE = { en: "The roster could not be loaded.", fr: "La liste des clients n'a pas pu être chargée." } as const;
const errorSentence = (lang: "en" | "fr", route: string) => (route === "/" ? ROSTER_SENTENCE[lang] : SENTENCE[lang]);

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-704 (${lang})`, () => {
    test.use({ locale: lang === "en" ? "en-US" : "fr-FR" });

    test("with the switch on, every signed-in route shows the root error page", async ({ page }) => {
      test.setTimeout(120_000);
      await signInThroughForm(page, { lang });
      // Control first: the switch off, each route draws its own h1, never the error sentence.
      const healthy: Record<string, boolean> = {};
      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.locator("h1").first()).toBeVisible();
        healthy[route] = (await page.locator("h1").allTextContents()).includes(errorSentence(lang, route));
      }
      expect(healthy, "no route shows the error page without the switch").toEqual(
        Object.fromEntries(ROUTES.map((r) => [r, false]))
      );

      await page
        .context()
        .addCookies([{ name: "evoli_fixture_render_error", value: "always", url: new URL("/", page.url()).href }]);
      const seen: Record<string, string[]> = {};
      for (const route of ROUTES) {
        await page.goto(route);
        await expect(page.locator("h1").first()).toBeVisible();
        seen[route] = await page.locator("h1").allTextContents();
      }
      expect(seen).toEqual(Object.fromEntries(ROUTES.map((r) => [r, [errorSentence(lang, r)]])));
      // The error page, not a page's own load-error card: the boundary's « Try again » / « Reload ».
      await expect(page.locator(".app-shell")).toHaveCount(1);
    });
  });
}
