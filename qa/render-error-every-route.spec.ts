import { expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
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
 * EV-349 349.1: the list is BOUND to `src/app`. Every `page.tsx` under it is either in
 * `ROUTES` (a page that draws `CoachShell`, with the URL that reaches it) or in `NO_SHELL`
 * (with the reason it draws none); the first test below enumerates the files at run time and
 * names any page in neither, so a new page cannot pass by not being listed.
 *
 * Populated scenario, for the seeded challenge and nutrition template. `/invited/[userId]` is
 * reached with `LAPSED_INVITATION` (349.4): the fixture's LAPSED invitation (`seedInvited`,
 * AC-P14: past `expiresAt`, `lapsed.invite@example.com`), which is absent from the Invited
 * list, so the page renders its not-found branch inside the shell (senior-qa, `48077bb` gate).
 * One table, asserted at once: a switch that stops firing shows WHICH routes it lost.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const TEMPLATE = "7c2d0a11-0000-4000-8000-0000000000b1";
const RECIPE = "8e3f1b22-0000-4000-8000-0000000000c1";
const NUTRITION_TEMPLATE = "5e1a7c00-0000-4000-8000-0000000000d1";
const CHALLENGE = "c4a11e00-0000-4000-8000-000000000001";
/** The seeded LAPSED invitation (AC-P14), not an Invited account on the list. */
const LAPSED_INVITATION = "204b0000-0000-4000-8000-000000000001";

/** Every shell page: its file under `src/app` → the URL the test opens. */
const ROUTE_FILES: Record<string, string> = {
  "(roster)/page.tsx": "/",
  "challenges/(list)/page.tsx": "/challenges",
  "challenges/[id]/page.tsx": `/challenges/${CHALLENGE}`,
  "clients/[id]/page.tsx": `/clients/${LINA}`,
  "clients/[id]/routine/page.tsx": `/clients/${LINA}/routine`,
  "clients/[id]/nutrition/page.tsx": `/clients/${LINA}/nutrition`,
  "clients/denied/page.tsx": "/clients/denied",
  "invited/[userId]/page.tsx": `/invited/${LAPSED_INVITATION}`,
  "templates/page.tsx": "/templates",
  "templates/new/page.tsx": "/templates/new",
  "templates/[id]/page.tsx": `/templates/${TEMPLATE}`,
  "recipes/page.tsx": "/recipes",
  "recipes/new/page.tsx": "/recipes/new",
  "recipes/[id]/page.tsx": `/recipes/${RECIPE}`,
  "nutrition-templates/page.tsx": "/nutrition-templates",
  "nutrition-templates/new/page.tsx": "/nutrition-templates/new",
  "nutrition-templates/[id]/page.tsx": `/nutrition-templates/${NUTRITION_TEMPLATE}`,
};

/** The pages that draw no `CoachShell`, so the switch cannot reach them: one reason each. */
const NO_SHELL: { route: string; files: RegExp; reason: string }[] = [
  { route: "/login", files: /^login\/page\.tsx$/, reason: "the sign-in form: no session yet, so no shell" },
  { route: "/activate", files: /^activate\/page\.tsx$/, reason: "EV-278c's activation: a PENDING session only, before the coach has a portal" },
  { route: "/unavailable", files: /^unavailable\/page\.tsx$/, reason: "middleware's 503 when the api gave no session verdict: one card, no api call" },
  { route: "/i/*", files: /^i\//, reason: "the public invitation pages, read by a trainee, under the /i head" },
];

const ROUTES = Object.values(ROUTE_FILES);

/** Every `page.tsx` under `src/app`, as a `/`-separated path relative to it. */
function appPages(): string[] {
  const root = join(__dirname, "..", "src", "app");
  return (readdirSync(root, { recursive: true }) as string[])
    .filter((p) => p === "page.tsx" || p.endsWith(`${sep}page.tsx`))
    .map((p) => relative(root, join(root, p)).split(sep).join("/"))
    .sort();
}

test("349.1: every page under src/app is in ROUTES or in NO_SHELL, and every listed file exists", () => {
  const pages = appPages();
  // Pinned: an enumeration that found nothing would pass the check below vacuously.
  expect(pages.length).toBeGreaterThanOrEqual(Object.keys(ROUTE_FILES).length + NO_SHELL.length);
  const unlisted = pages.filter((p) => !(p in ROUTE_FILES) && !NO_SHELL.some((n) => n.files.test(p)));
  expect(unlisted, "src/app pages in neither ROUTES nor NO_SHELL").toEqual([]);
  const both = pages.filter((p) => p in ROUTE_FILES && NO_SHELL.some((n) => n.files.test(p)));
  expect(both, "pages listed as a shell page AND as a no-shell page").toEqual([]);
  const stale = Object.keys(ROUTE_FILES).filter((f) => !pages.includes(f));
  expect(stale, "ROUTES entries whose page.tsx no longer exists").toEqual([]);
  const emptyNoShell = NO_SHELL.filter((n) => !pages.some((p) => n.files.test(p))).map((n) => n.route);
  expect(emptyNoShell, "NO_SHELL entries that match no page").toEqual([]);
});

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
