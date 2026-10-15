import { expect } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  appPages,
  beforeFilesRewrites,
  destinationPath,
  resolvePage,
  sourceMatches,
  urlPattern,
} from "./app-pages";
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
 * EV-349 349.1: the list is BOUND to `src/app`. Every page file under it is either in
 * `ROUTES` (a page that draws `CoachShell`, with the URL that reaches it) or in `NO_SHELL`
 * (with the reason it draws none); the first test below enumerates the files at run time and
 * names any page in neither, so a new page cannot pass by not being listed. A page file is
 * `page.tsx`, `page.ts`, `page.jsx` or `page.js` (EV-352 352.2): Next's default
 * `pageExtensions`, which `next.config.mjs` does not change. That is pinned, not assumed
 * (EV-353 353.3): the third static test fails, naming `next.config.mjs`, if its exported
 * config sets `pageExtensions`.
 *
 * EV-352 352.4: each `ROUTE_FILES` URL is checked against its file, statically (second test):
 * the URL must be one that Next's FILE-SYSTEM ROUTER serves from THAT file, so a URL copied
 * onto the wrong entry, or two entries' URLs swapped, is red by name instead of testing some
 * other page twice. Only the file-system router is modelled (EV-353 353.4): `middleware.ts`
 * (its redirects and rewrites) and any `rewrites` / `redirects` in `next.config.mjs` are NOT,
 * so a URL that such a rule sends elsewhere would still pass this check.
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

/**
 * Every shell page: its file under `src/app` → the URL the test opens.
 *
 * EV-362 AC6: `/recipes/new`, `/recipes/[id]`, `/templates/new` and `/templates/[id]` have no
 * page file. They are served by `recipes/editor/page.tsx` and `templates/editor/page.tsx` through
 * `next.config.mjs`'s `beforeFiles` rewrites (BUG-739), and this file mapping does not model
 * rewrites (353.4), so it lists the editor files under the URLs their own folder serves. The
 * addresses a coach uses are opened too, from `REWRITTEN` below.
 */
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
  "templates/editor/page.tsx": "/templates/editor",
  "recipes/page.tsx": "/recipes",
  "recipes/editor/page.tsx": "/recipes/editor",
  "nutrition-templates/page.tsx": "/nutrition-templates",
  "nutrition-templates/new/page.tsx": "/nutrition-templates/new",
  "nutrition-templates/[id]/page.tsx": `/nutrition-templates/${NUTRITION_TEMPLATE}`,
};

/** The pages that draw no `CoachShell`, so the switch cannot reach them: one reason each. */
const NO_SHELL: { route: string; files: RegExp; reason: string }[] = [
  { route: "/login", files: /^login\/page\.tsx$/, reason: "the sign-in form: no session yet, so no shell" },
  { route: "/activate", files: /^activate\/page\.tsx$/, reason: "EV-278c's activation: a PENDING session only, before the coach has a portal" },
  { route: "/unavailable", files: /^unavailable\/page\.tsx$/, reason: "middleware's 503 when the api gave no session verdict: one card, no api call" },
  {
    route: "/clients/[id]/intake",
    files: /^clients\/\[id\]\/intake\/page\.tsx$/,
    reason:
      "EV-341b, dark behind COACH_INTAKE_REQUEST, which this suite's server (roster config) leaves unset: the route is " +
      "notFound() before its shell renders (G3). With the switch on it draws CoachShell like its sibling tabs.",
  },
  {
    route: "/i/*",
    files: /^i\//,
    reason:
      "EVERY page under src/app/i/, present and future: the pattern is the prefix, not a list of files, so a page " +
      "added under i/ is exempt without being named here. They are the public invitation pages a trainee reads " +
      "without a coach session, drawn under the /i head (i/layout.tsx), never inside CoachShell.",
  },
];

/**
 * EV-362 AC6: the editor addresses a coach uses, which reach their page only through a
 * `next.config.mjs` rewrite → the page file the rewrite serves. Opened like `ROUTES`, so the
 * switch is still asserted on both of the editor pages' branches (new, and an existing record)
 * at the canonical addresses. Checked statically against the rules themselves (EV-362 test
 * below): every `beforeFiles` rule takes one of these URLs, each target is its rule's
 * destination page and a `ROUTE_FILES` page, and the file-system router alone reaches NO page
 * from the URL (else it belongs in `ROUTE_FILES`).
 */
const REWRITTEN: Record<string, string> = {
  "/templates/new": "templates/editor/page.tsx",
  [`/templates/${TEMPLATE}`]: "templates/editor/page.tsx",
  "/recipes/new": "recipes/editor/page.tsx",
  [`/recipes/${RECIPE}`]: "recipes/editor/page.tsx",
};

const ROUTES = [...Object.values(ROUTE_FILES), ...Object.keys(REWRITTEN)];

test("349.1: every page under src/app is in ROUTES or in NO_SHELL, and every listed file exists", () => {
  const pages = appPages();
  // Pinned: an enumeration that found nothing would pass the check below vacuously.
  expect(pages.length).toBeGreaterThanOrEqual(Object.keys(ROUTE_FILES).length + NO_SHELL.length);
  const unlisted = pages.filter((p) => !(p in ROUTE_FILES) && !NO_SHELL.some((n) => n.files.test(p)));
  expect(unlisted, "src/app pages in neither ROUTES nor NO_SHELL").toEqual([]);
  const both = pages.filter((p) => p in ROUTE_FILES && NO_SHELL.some((n) => n.files.test(p)));
  expect(both, "pages listed as a shell page AND as a no-shell page").toEqual([]);
  const stale = Object.keys(ROUTE_FILES).filter((f) => !pages.includes(f));
  expect(stale, "ROUTES entries whose page file no longer exists").toEqual([]);
  const emptyNoShell = NO_SHELL.filter((n) => !pages.some((p) => n.files.test(p))).map((n) => n.route);
  expect(emptyNoShell, "NO_SHELL entries that match no page").toEqual([]);
});

test("352.4: each ROUTES URL is the one Next serves from the file listed beside it (static, no page opened)", () => {
  const pages = appPages();
  const mismatched = Object.entries(ROUTE_FILES)
    .filter(([file, url]) => !urlPattern(file).test(url))
    .map(([file, url]) => `${file} -> ${url} (pattern ${urlPattern(file).source})`);
  expect(mismatched, "ROUTE_FILES entries whose URL does not match their own file's path").toEqual([]);
  // Matching is not reaching: `/templates/new` matches `templates/[id]` too, and Next serves
  // the static `templates/new`. Each URL must resolve to its own file among every page.
  const reachedElsewhere = Object.entries(ROUTE_FILES)
    .map(([file, url]) => [file, url, resolvePage(url, pages)] as const)
    .filter(([file, , served]) => served !== file)
    .map(([file, url, served]) => `${file} -> ${url} is served by ${served ?? "no page"}`);
  expect(reachedElsewhere, "ROUTE_FILES entries whose URL Next serves from another page").toEqual([]);
});

/**
 * EV-362 — `REWRITTEN` is bound to `next.config.mjs`'s `beforeFiles` rules, both ways:
 *   · every rule takes at least one `REWRITTEN` URL, so a rule cannot lose its address here
 *     (staff's M6: the `/recipes/{id}` entry deleted → the `/recipes/:id` rule is uncovered);
 *   · every URL is taken by a rule (the FIRST in order, as Next tries them), and its target is
 *     the page the file-system router serves for that rule's destination pathname (staff's M5: a
 *     swapped target is red);
 *   · and the file-system router alone reaches NO page from the URL, else it belongs in
 *     `ROUTE_FILES`; each target is a `ROUTE_FILES` page.
 * Sources are compiled as Next compiles them (`sourceMatches`, path-to-regexp).
 */
test("EV-362: REWRITTEN covers every beforeFiles rule, each URL's target is its rule's destination page, and no page file serves the URL (static)", async () => {
  const pages = appPages();
  const rules = await beforeFilesRewrites();
  expect(rules.length, "next.config.mjs declares beforeFiles rewrites").toBeGreaterThan(0);

  const uncovered = rules
    .filter((rule) => !Object.keys(REWRITTEN).some((url) => sourceMatches(rule.source, url)))
    .map((rule) => `${rule.source} -> ${rule.destination}`);
  expect(uncovered, "beforeFiles rules no REWRITTEN URL exercises").toEqual([]);

  const wrongTarget = Object.entries(REWRITTEN)
    .map(([url, file]) => {
      const rule = rules.find((r) => sourceMatches(r.source, url));
      const served = rule ? resolvePage(destinationPath(rule.destination), pages) : undefined;
      return { url, file, rule, served };
    })
    .filter(({ file, served }) => served !== file)
    .map(({ url, file, rule, served }) =>
      rule
        ? `${url} -> ${file}, but its rule ${rule.source} -> ${rule.destination} reaches ${served ?? "no page"}`
        : `${url} -> ${file}, but no beforeFiles rule takes it`
    );
  expect(wrongTarget, "REWRITTEN targets that are not their rule's destination page").toEqual([]);

  const notListed = Object.entries(REWRITTEN)
    .filter(([, file]) => !(file in ROUTE_FILES))
    .map(([url, file]) => `${url} -> ${file}`);
  expect(notListed, "REWRITTEN targets that are not ROUTE_FILES pages").toEqual([]);
  const servedByFile = Object.keys(REWRITTEN)
    .map((url) => [url, resolvePage(url, pages)] as const)
    .filter(([, served]) => served !== undefined)
    .map(([url, served]) => `${url} is served by ${served}`);
  expect(servedByFile, "REWRITTEN URLs a page file serves (list them in ROUTE_FILES)").toEqual([]);
});

/**
 * EV-353 353.3 — the default `pageExtensions` that `PAGE_FILE` (`qa/app-pages.ts`) assumes is PINNED: if
 * `next.config.mjs` sets `pageExtensions` (even to the defaults), this fails by name, and
 * whoever set it updates `PAGE_FILE` in the same change. The exported config itself is read
 * (imported, as Next imports it), not its source text, so a comment that mentions the key
 * cannot trip it and a computed key cannot slip past it. A function export (Next's
 * `(phase) => config` form) is called with the build phase.
 *
 * Mutant: add `pageExtensions: ["tsx", "ts", "jsx", "js"]` to `nextConfig` → red, naming
 * `next.config.mjs`.
 */
test("353.3: next.config.mjs leaves pageExtensions at Next's default (static, no page opened)", async () => {
  const file = join(__dirname, "..", "next.config.mjs");
  const exported: unknown = (await import(pathToFileURL(file).href)).default;
  const config =
    typeof exported === "function" ? await exported("phase-production-build", { defaultConfig: {} }) : exported;
  expect(config !== null && typeof config === "object", "next.config.mjs exports a config object").toBe(true);
  expect(
    Object.prototype.hasOwnProperty.call(config, "pageExtensions")
      ? `next.config.mjs sets pageExtensions = ${JSON.stringify((config as { pageExtensions: unknown }).pageExtensions)}`
      : "next.config.mjs does not set pageExtensions",
    "PAGE_FILE assumes Next's default pageExtensions; update it with the config"
  ).toBe("next.config.mjs does not set pageExtensions");
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
