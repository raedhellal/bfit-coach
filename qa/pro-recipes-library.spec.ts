import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { ENGINES, browserFor, closeBrowsers, waitForFiber, type Engine } from "./prehydration";
import { expectNoSidewaysScroll } from "./layout";
import { expectNoEnglish } from "./french";

/**
 * EV-337j2 — the recipe library in the Evoli Pro redesign (`/recipes`; story § Split,
 * J2.1–J2.4, R8, and X1/X3/X4/X5/X6 on the route).
 *
 *   J2.1 — rows at ≥ 768 px (one card holding the rows), one card per recipe below; each
 *          shows the name, the meal-time chips (untagged = Lunch + Dinner, marked as the
 *          default) and the macro line; the count / limit line, the limit-reached state and
 *          the meal-time filter as before.
 *   J2.2 — a search field « Rechercher une recette » / "Search recipes" filters by name in the
 *          browser, case- and accent-insensitive (« creme » finds « Crème brûlée »), combined
 *          with the meal-time filter; no match reads « Aucune recette ne correspond à
 *          « {texte} ». » / "No recipe matches “{text}”."; clearing restores the list; no
 *          request is sent while typing.
 *   J2.3 — no photo, « Sans photo », « Photo manquante », tag, tag filter, portion, prep time
 *          or usage count.
 *   J2.4 — J1.5's loading rule: while /recipes loads the navigation stays on screen, and the
 *          head and first row/card move by at most 8 px when the page lands (Chromium and
 *          WebKit, 1440 and 390, FR).
 *
 * Every test runs in BOTH engines through its own context (`qa/prehydration.ts`'s
 * launchers, locale + Accept-Language per language), signed in through `/api/auth/login`.
 * Seeds (fixture, reset before every test by `fixture-test`): the default coach's five
 * recipes; `coach.c1@evoli.fit`'s six, all untagged, one of them « Crêpes aux épinards »;
 * `coach.c0@evoli.fit` none; `coach.c100@evoli.fit` a full library (100 of 100).
 *
 * Every sentence is a LITERAL, never an import from copy.ts.
 */

type Lang = "en" | "fr";
const LANGS: Lang[] = ["en", "fr"];
const LOCALE: Record<Lang, string> = { en: "en-US", fr: "fr-FR" };

/** The brief's widths: both sides of 768, and the shell's other breakpoints. */
const WIDTHS = [320, 390, 767, 768, 1024, 1440] as const;
/** Story X1's nine widths. */
const X1_WIDTHS = [1440, 1280, 1279, 1024, 1023, 768, 767, 390, 320] as const;

const COACH = "coach@evoli.fit";
const C1 = "coach.c1@evoli.fit";
const C0 = "coach.c0@evoli.fit";
const C100 = "coach.c100@evoli.fit";

const BOWL = "Chicken rice bowl";
const OVEN = "Oven-baked sweet potato and chickpea traybake with spinach, lemon and garlic oil";
const OATS = "Overnight oats";
const QUARK = "Quark pancakes";
const WINE = "Wine-braised lentils";
const SEEDED = [BOWL, OVEN, OATS, QUARK, WINE];
const CREPES = "Crêpes aux épinards";

const T = {
  en: {
    heading: "Recipes",
    search: "Search recipes",
    filter: "Meal time",
    count: (n: number, limit: number) => `${n} of ${limit} recipes`,
    limitReached: "You can keep up to 100 recipes. Delete one to make room.",
    macroBowl: "560 kcal · P 50 g · C 62 g · F 12 g",
    untagged: "Lunch, Dinner (default)",
    oats: ["Breakfast", "Snack"],
    noMatch: (text: string) => `No recipe matches “${text}”.`,
    filterEmpty: "No recipe for this meal time yet.",
    empty: "No recipes yet.",
    loadError: "Your recipes could not be loaded.",
    newRecipe: "New recipe",
    edit: "Edit",
    remove: "Delete",
    clear: "Clear the search",
  },
  fr: {
    heading: "Recettes",
    search: "Rechercher une recette",
    filter: "Moment du repas",
    count: (n: number, limit: number) => `${n} recettes sur ${limit}`,
    limitReached: "Vous pouvez conserver jusqu'à 100 recettes. Supprimez-en une pour faire de la place.",
    macroBowl: "560 kcal · P 50 g · G 62 g · L 12 g",
    untagged: "Déjeuner, Dîner (par défaut)",
    oats: ["Petit-déjeuner", "Collation"],
    // `toHaveText` normalises U+00A0 to a space, so the guillemets' no-break spaces read as spaces.
    noMatch: (text: string) => `Aucune recette ne correspond à « ${text} ».`,
    filterEmpty: "Aucune recette pour ce moment du repas.",
    empty: "Aucune recette pour l'instant.",
    loadError: "Vos recettes n'ont pas pu être chargées.",
    newRecipe: "Nouvelle recette",
    edit: "Modifier",
    remove: "Supprimer",
    clear: "Effacer la recherche",
  },
} as const;

test.afterAll(closeBrowsers);

/** A context of its own: the engine, the language, the width, signed in as `email`. */
async function open(
  engine: Engine,
  lang: Lang,
  width: number,
  baseURL: string | undefined,
  options: { email?: string; cookies?: Record<string, string> } = {}
): Promise<Page> {
  const browser = await browserFor(engine);
  const context = await browser.newContext({
    baseURL,
    locale: LOCALE[lang],
    extraHTTPHeaders: { "Accept-Language": LOCALE[lang] },
    viewport: { width, height: 900 },
  });
  const login = await context.request.post("/api/auth/login", {
    data: { email: options.email ?? COACH, password: "Password123!" },
    maxRedirects: 0,
  });
  expect(login.status(), `fixture sign-in as ${options.email ?? COACH}`).toBe(200);
  const cookies = Object.entries(options.cookies ?? {});
  // At the ROOT: a cookie scoped to a page's path would not reach the others.
  if (cookies.length) await context.addCookies(cookies.map(([name, value]) => ({ name, value, url: baseURL! })));
  return context.newPage();
}

function main(page: Page) {
  return page.locator("main");
}
function row(page: Page, name: string) {
  return main(page).getByRole("group", { name, exact: true });
}
/** The recipes listed, in order (each row is a group named by its recipe). */
function listed(page: Page): Promise<string[]> {
  return main(page)
    .getByRole("group")
    .evaluateAll((groups) => groups.map((g) => g.getAttribute("aria-label") ?? ""));
}
function search(page: Page, lang: Lang) {
  return page.getByRole("searchbox", { name: T[lang].search, exact: true });
}
async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "has a box").not.toBeNull();
  return b!;
}

/**
 * The library has hydrated: a search typed now reaches state (a fill before it is no-op'd).
 * `via: "filter"` waits on the meal-time filter instead, for the tests of what was ALREADY
 * on the page before J2.2 (so they say whether the restyle kept it, not whether a search exists).
 */
async function ready(page: Page, lang: Lang, via: "search" | "filter" = "search") {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(T[lang].heading);
  await waitForFiber(via === "search" ? search(page, lang) : page.getByLabel(T[lang].filter, { exact: true }));
}

for (const engine of Object.keys(ENGINES) as Engine[]) {
  for (const lang of LANGS) {
    const t = T[lang];

    test.describe(`${engine} · ${lang}`, () => {
      /* ── J2.1 ─────────────────────────────────────────────────────────────── */

      test("J2.1 — one card of rows from 768 px, one card per recipe below it", async ({ baseURL }) => {
        const page = await open(engine, lang, 1440, baseURL);
        try {
          await page.goto("/recipes");
          await expect(row(page, BOWL)).toBeVisible();
          const list = main(page).getByRole("list").filter({ has: page.getByRole("group") });
          await expect(list, "one list holds the recipe rows").toHaveCount(1);
          const items = list.locator(":scope > li");
          await expect(items).toHaveCount(5);
          const look = (l: Locator) =>
            l.evaluate((el) => {
              const s = getComputedStyle(el);
              return { radius: parseFloat(s.borderTopLeftRadius), border: parseFloat(s.borderTopWidth) };
            });
          /**
           * The card a recipe is drawn in, if any: the `li` itself or any box between it and the
           * row's group (inclusive) that has both a radius and a border. Not tied to a class, so
           * the same question is asked of the base (a kit Card inside each `li`) and of the tip.
           */
          const cardOf = (item: Locator) =>
            item.evaluate((li) => {
              const group = li.querySelector('[role="group"]');
              const chain: Element[] = [];
              for (let el = group; el && el !== li.parentElement; el = el.parentElement) chain.push(el);
              const card = chain.find((el) => {
                const s = getComputedStyle(el);
                return parseFloat(s.borderTopLeftRadius) > 0 && parseFloat(s.borderTopWidth) > 0;
              });
              return card ? { radius: parseFloat(getComputedStyle(card).borderTopLeftRadius) } : null;
            });

          for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            const outer = await look(list);
            const first = await cardOf(items.first());
            const a = await box(items.nth(0));
            const b = await box(items.nth(1));
            const bowl = row(page, BOWL);
            const name = await box(bowl.getByTitle(BOWL, { exact: true }));
            const edit = await box(bowl.getByRole("link", { name: t.edit, exact: true }));
            const del = await box(bowl.getByRole("button", { name: t.remove, exact: true }));
            if (width >= 768) {
              // ROWS: the list is the card, a row is not one, and rows touch (a rule between them).
              expect(outer.radius, `the list is a card at ${width}`).toBeGreaterThan(0);
              expect(outer.border, `the list card has its border at ${width}`).toBeGreaterThan(0);
              expect(first, `a row is not a card of its own at ${width}`).toBeNull();
              expect(Math.abs(b.y - (a.y + a.height)), `rows touch at ${width}`).toBeLessThanOrEqual(1.5);
              // A row: the actions beside the name, on its line.
              expect(edit.x, `Edit is beside the name at ${width}`).toBeGreaterThan(name.x + name.width - 1);
            } else {
              // CARDS: no outer card, each recipe is one, and they stack with a gap.
              expect(outer.radius, `no outer card at ${width}`).toBe(0);
              expect(outer.border, `no outer border at ${width}`).toBe(0);
              expect(first, `each recipe is a card at ${width}`).not.toBeNull();
              expect(b.y, `cards stack with a gap at ${width}`).toBeGreaterThanOrEqual(a.y + a.height + 8);
              // A card: the actions under the name block.
              expect(edit.y, `Edit sits under the name at ${width}`).toBeGreaterThanOrEqual(name.y + name.height);
            }
            // Every row/card holds both actions inside the viewport, Delete clear of Edit.
            expect(del.x + del.width, `Delete inside the viewport at ${width}`).toBeLessThanOrEqual(width);
            expect(del.x >= edit.x + edit.width || del.y >= edit.y + edit.height, `Delete clear of Edit at ${width}`).toBe(
              true
            );
            await expectNoSidewaysScroll(page, `/recipes at ${width}`);
          }
        } finally {
          await page.context().close();
        }
      });

      test("J2.1 — each row: the name, the meal-time chips (untagged = the default) and the macro line; the count and the filter as before", async ({
        baseURL,
      }) => {
        for (const width of [1440, 390] as const) {
          const page = await open(engine, lang, width, baseURL);
          try {
            await page.goto("/recipes");
            await ready(page, lang, "filter");
            expect(await listed(page), `alphabetical at ${width}`).toEqual(SEEDED);

            const bowl = row(page, BOWL);
            await expect(bowl.getByTitle(BOWL, { exact: true })).toHaveText(BOWL);
            await expect(bowl.getByText(t.macroBowl, { exact: true })).toBeVisible();
            const chips = (name: string) => row(page, name).getByTestId("recipe-slots");
            await expect(chips(BOWL).getByRole("listitem")).toHaveText([t.untagged]);
            await expect(chips(BOWL)).toHaveAttribute("data-default", "true");
            await expect(chips(OATS).getByRole("listitem")).toHaveText([...t.oats]);
            await expect(chips(OATS)).toHaveAttribute("data-default", "false");
            for (const name of SEEDED) await expect(chips(name), `${name} chips at ${width}`).toBeVisible();

            await expect(page.getByTestId("recipe-count")).toHaveText(t.count(5, 100));
            await expect(page.getByText(t.limitReached, { exact: true })).toHaveCount(0);
            await expect(page.getByRole("button", { name: t.newRecipe, exact: true })).toBeVisible();

            // The meal-time filter, as before: untagged counts as lunch and dinner.
            const filter = page.getByLabel(t.filter, { exact: true });
            await filter.selectOption("BREAKFAST");
            await expect.poll(() => listed(page)).toEqual([OATS, QUARK]);
            await filter.selectOption("LUNCH");
            await expect.poll(() => listed(page)).toEqual([BOWL, OVEN]);
            await expect(page.getByTestId("recipe-count"), "the count is the library's, not the filter's").toHaveText(
              t.count(5, 100)
            );
          } finally {
            await page.context().close();
          }
        }
      });

      test("J2.1 — a full library says so before the refusal; an empty one and a failed read as before", async ({ baseURL }) => {
        const full = await open(engine, lang, 390, baseURL, { email: C100 });
        try {
          await full.goto("/recipes");
          await expect(full.getByTestId("recipe-count")).toHaveText(t.count(100, 100));
          await expect(full.getByText(t.limitReached, { exact: true })).toBeVisible();
          await expect(full.locator("h1")).toHaveCount(1);
        } finally {
          await full.context().close();
        }
        const empty = await open(engine, lang, 390, baseURL, { email: C0 });
        try {
          await empty.goto("/recipes");
          await expect(empty.getByText(t.empty, { exact: true })).toBeVisible();
          await expect(empty.getByRole("button", { name: t.newRecipe, exact: true })).toBeVisible();
          // No list to search: no search field on an empty library.
          await expect(empty.getByRole("searchbox")).toHaveCount(0);
          await expect(empty.locator("h1")).toHaveCount(1);
        } finally {
          await empty.context().close();
        }
        const failed = await open(engine, lang, 390, baseURL, { cookies: { evoli_fixture_recipes: "fail" } });
        try {
          await failed.goto("/recipes");
          await expect(failed.getByText(t.loadError, { exact: true })).toBeVisible();
          await expect(failed.getByRole("searchbox")).toHaveCount(0);
          await expect(failed.locator("h1")).toHaveCount(1);
        } finally {
          await failed.context().close();
        }
      });

      /* ── J2.2 ─────────────────────────────────────────────────────────────── */

      test("J2.2 — the search: labelled, by name, case- and accent-insensitive; no match quotes the text; clearing restores", async ({
        baseURL,
      }) => {
        const page = await open(engine, lang, 390, baseURL, { email: C1 });
        try {
          await page.goto("/recipes");
          await ready(page, lang);
          const field = search(page, lang);
          await expect(main(page).getByRole("searchbox"), "one search field").toHaveCount(1);
          const all = await listed(page);
          expect(all).toContain(CREPES);
          expect(all.length).toBe(6);

          // Accents and case ignored, on both sides.
          for (const query of ["crepes", "CRÊPES", "epinards", "ÉPINARDS", "  crêpes  "]) {
            await field.fill(query);
            await expect.poll(() => listed(page), `« ${query} »`).toEqual([CREPES]);
          }
          await field.fill("SALMON");
          await expect.poll(() => listed(page)).toEqual(["Salmon quinoa"]);

          // No match: the sentence, quoting what was typed (trimmed).
          await field.fill("  zzz ");
          await expect.poll(() => listed(page)).toEqual([]);
          const status = main(page).getByRole("status").filter({ hasText: t.noMatch("zzz") });
          await expect(status).toHaveText(t.noMatch("zzz"));
          await expect(page.getByText(t.empty, { exact: true }), "a search is not the empty library").toHaveCount(0);
          await expect(page.getByTestId("recipe-count"), "the count is the library's").toHaveText(t.count(6, 100));

          // Clearing the field restores the list.
          await field.fill("");
          await expect.poll(() => listed(page)).toEqual(all);
          await expect(main(page).getByText(t.noMatch("zzz"))).toHaveCount(0);

          // So does the no-match card's own control, which hands focus back to the field.
          await field.fill("zzz");
          await main(page).getByRole("button", { name: t.clear, exact: true }).click();
          await expect(field).toHaveValue("");
          await expect(field).toBeFocused();
          await expect.poll(() => listed(page)).toEqual(all);
        } finally {
          await page.context().close();
        }
      });

      test("J2.2 — combined with the meal-time filter, both ways", async ({ baseURL }) => {
        const page = await open(engine, lang, 1440, baseURL);
        try {
          await page.goto("/recipes");
          await ready(page, lang);
          const field = search(page, lang);
          const filter = page.getByLabel(t.filter, { exact: true });

          await filter.selectOption("BREAKFAST");
          await field.fill("OAT");
          await expect.poll(() => listed(page)).toEqual([OATS]);
          await filter.selectOption("LUNCH");
          await expect.poll(() => listed(page), "LUNCH + oat").toEqual([]);
          await expect(main(page).getByRole("status").filter({ hasText: t.noMatch("OAT") })).toHaveText(t.noMatch("OAT"));
          await field.fill("bowl");
          await expect.poll(() => listed(page), "LUNCH + bowl").toEqual([BOWL]);
          await filter.selectOption("DINNER");
          await field.fill("");
          await expect.poll(() => listed(page), "DINNER, search cleared: the filter stays").toEqual([BOWL, OVEN, WINE]);
          await filter.selectOption("ALL");
          await expect.poll(() => listed(page)).toEqual(SEEDED);
        } finally {
          await page.context().close();
        }
      });

      test("J2.2 — a meal time with no recipe keeps its own sentence while a search is typed", async ({ baseURL }) => {
        // C1's six recipes are all untagged: none is for breakfast.
        const page = await open(engine, lang, 390, baseURL, { email: C1 });
        try {
          await page.goto("/recipes");
          await ready(page, lang);
          await page.getByLabel(t.filter, { exact: true }).selectOption("BREAKFAST");
          await search(page, lang).fill("salmon");
          await expect.poll(() => listed(page)).toEqual([]);
          await expect(main(page).getByText(t.filterEmpty, { exact: true })).toBeVisible();
          await expect(main(page).getByText(t.noMatch("salmon"))).toHaveCount(0);
        } finally {
          await page.context().close();
        }
      });

      test("J2.2 — no request is sent while typing, filtering or clearing", async ({ baseURL }) => {
        const page = await open(engine, lang, 1440, baseURL);
        try {
          await page.goto("/recipes");
          await ready(page, lang);
          await page.waitForLoadState("networkidle");
          const journal = async () => {
            const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
            expect(res.status(), "GET /api/fixture/calls (fixture mode only)").toBe(200);
            const body = (await res.json()) as { api?: Array<{ op: string }> };
            return body.api!.length;
          };
          const before = await journal();
          const sent: string[] = [];
          const record = (r: { url(): string; method(): string }) => sent.push(`${r.method()} ${r.url()}`);
          page.on("request", record);

          const field = search(page, lang);
          await field.pressSequentially("Chi", { delay: 60 });
          await expect.poll(() => listed(page)).toEqual([BOWL]);
          await field.pressSequentially("ckpea zzz", { delay: 40 });
          await expect.poll(() => listed(page)).toEqual([]);
          await page.getByLabel(t.filter, { exact: true }).selectOption("DINNER");
          await field.fill("");
          await expect.poll(() => listed(page)).toEqual([BOWL, OVEN, WINE]);
          await page.waitForTimeout(800);

          page.off("request", record);
          expect(sent, "requests the page sent while searching").toEqual([]);
          expect(await journal(), "api calls the fixture answered while searching").toBe(before);
        } finally {
          await page.context().close();
        }
      });

      /* ── J2.3 ─────────────────────────────────────────────────────────────── */

      test("J2.3 — no photo, tag, tag filter, portion, prep time or usage count (R8)", async ({ baseURL }) => {
        for (const width of [1440, 390] as const) {
          const page = await open(engine, lang, width, baseURL);
          try {
            await page.goto("/recipes");
            await ready(page, lang, "filter");
            const scope = main(page);
            await expect(scope.locator("img, picture, video, canvas"), "no image").toHaveCount(0);
            await expect(scope.locator('[role="img"]:not([aria-hidden="true"])'), "no image role").toHaveCount(0);
            await expect(scope.locator('input[type="file"]'), "no upload").toHaveCount(0);
            // One filter, the meal time: no tag filter beside it (J2.2's search is asserted there).
            await expect(scope.locator("select")).toHaveCount(1);
            await expect(scope.locator('[role="checkbox"], [role="switch"], [aria-pressed]'), "no filter chips").toHaveCount(0);
            const text = await scope.evaluate((el) => (el as HTMLElement).innerText);
            const attrs = await scope.evaluate((el) =>
              Array.from(el.querySelectorAll("[aria-label], [title], [placeholder], [alt]"))
                .flatMap((n) => ["aria-label", "title", "placeholder", "alt"].map((a) => n.getAttribute(a) ?? ""))
                .join("\n")
            );
            const forbidden = [
              /photo/i,
              /sans photo|photo manquante|no photo|missing photo/i,
              /\bportions?\b/i,
              /pr[ée]paration|\bprep\b|\d+\s*min\b/i,
              /\btags?\b|[ée]tiquette|v[ée]g[ée]tarien|vegetarian|sans gluten|gluten[- ]free|riche en prot|high[- ]protein/i,
              /utilis[ée]+e? (dans|par|chez)|used (in|by)|\buses?\b \d/i,
            ];
            for (const rule of forbidden) {
              expect(text, `visible text at ${width} matches ${rule}`).not.toMatch(rule);
              // Recipe names are the coach's content; none of the seeds trips these rules.
              expect(attrs, `an attribute at ${width} matches ${rule}`).not.toMatch(rule);
            }
          } finally {
            await page.context().close();
          }
        }
      });

      /* ── X1, X3, X4, X5, X6 on the route ──────────────────────────────────── */

      test("X1 + X4 + X5 — nine widths: no sideways scroll, one h1, one legal footer", async ({ baseURL }) => {
        const page = await open(engine, lang, 1440, baseURL);
        try {
          await page.goto("/recipes");
          await ready(page, lang, "filter");
          for (const width of X1_WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            await expectNoSidewaysScroll(page, `/recipes (${lang}, ${engine})`);
            await expect(page.locator("h1"), `one h1 at ${width}`).toHaveCount(1);
            await expect(page.locator("footer.legal-footer"), `one legal footer at ${width}`).toHaveCount(1);
          }
        } finally {
          await page.context().close();
        }
      });

      test("X1 + X4 — J2.2's no-match state: no sideways scroll, one h1", async ({ baseURL }) => {
        const page = await open(engine, lang, 1440, baseURL);
        try {
          await page.goto("/recipes");
          await ready(page, lang);
          await search(page, lang).fill("zzz");
          await expect.poll(() => listed(page)).toEqual([]);
          for (const width of [1440, 390, 320]) {
            await page.setViewportSize({ width, height: 900 });
            await expectNoSidewaysScroll(page, `/recipes no match at ${width}`);
            await expect(page.locator("h1")).toHaveCount(1);
          }
        } finally {
          await page.context().close();
        }
      });

      test("X3 — at 390 px every control of the library, the search and its clear included, is at least 44 × 44", async ({
        baseURL,
      }) => {
        const page = await open(engine, lang, 390, baseURL);
        try {
          await page.goto("/recipes");
          await ready(page, lang);
          const small = () =>
            main(page)
              .locator("a, button, input, select, textarea")
              .evaluateAll((els) =>
                els
                  .map((el) => {
                    const b = el.getBoundingClientRect();
                    const name = el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.tagName;
                    return { name: name.slice(0, 50), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 };
                  })
                  .filter((c) => c.w > 0 && c.h > 0 && (c.w < 44 || c.h < 44))
              );
          expect(await small(), "the list").toEqual([]);
          await search(page, lang).fill("zzz");
          await expect(main(page).getByRole("button", { name: t.clear, exact: true })).toBeVisible();
          expect(await small(), "the no-match state").toEqual([]);
        } finally {
          await page.context().close();
        }
      });

      test("X6 — the library and its new states read in one language", async ({ baseURL }) => {
        const page = await open(engine, lang, 1440, baseURL);
        try {
          await page.goto("/recipes");
          await ready(page, lang);
          await search(page, lang).fill("zzz");
          await expect(main(page).getByRole("button", { name: t.clear, exact: true })).toBeVisible();
          if (lang === "fr") {
            await expectNoEnglish(page, "/recipes with no match");
          } else {
            const text = await page.evaluate(() => document.body.innerText);
            for (const french of ["Rechercher", "recette", "Aucune", "Effacer", "Moment du repas"]) {
              expect(text, `French « ${french} » on the English page`).not.toContain(french);
            }
          }
          await expect(search(page, lang)).toHaveAttribute("placeholder", t.search);
        } finally {
          await page.context().close();
        }
      });
    });
  }

  /* ── J2.2's own example, and J2.4 (FR, per the story) ──────────────────── */

  test.describe(`${engine}`, () => {
    test("J2.2 — « creme » finds « Crème brûlée » (the story's example, a recipe written through the editor)", async ({
      baseURL,
    }) => {
      const writer = await open(engine, "en", 1440, baseURL);
      try {
        await writer.goto("/recipes/new");
        const name = writer.getByLabel("Recipe name");
        await waitForFiber(name);
        await expect(async () => {
          await name.fill("Crème brûlée");
          await expect(writer.getByText("Unsaved changes", { exact: true })).toBeVisible({ timeout: 1_000 });
        }).toPass({ timeout: 20_000 });
        await writer.getByLabel("Find an ingredient").fill("chicken");
        await writer.getByRole("button", { name: "Add chicken breast", exact: true }).click();
        await writer.getByRole("group", { name: "chicken breast", exact: true }).getByLabel("Quantity").fill("150");
        await writer.getByLabel("Calories (kcal)").fill("560");
        await writer.getByLabel("Protein (g)").fill("50");
        await writer.getByLabel("Carbs (g)").fill("62");
        await writer.getByLabel("Fat (g)").fill("12");
        await writer.getByRole("button", { name: "Save recipe" }).click();
        await expect(writer.getByText("Recipe saved.", { exact: true })).toBeVisible();
      } finally {
        await writer.context().close();
      }

      for (const lang of LANGS) {
        const page = await open(engine, lang, 390, baseURL);
        try {
          await page.goto("/recipes");
          await ready(page, lang);
          for (const query of ["creme", "CREME BRULEE", "brûlée"]) {
            await search(page, lang).fill(query);
            await expect.poll(() => listed(page), `${lang}: « ${query} »`).toEqual(["Crème brûlée"]);
          }
        } finally {
          await page.context().close();
        }
      }
    });

    for (const width of [1440, 390] as const) {
      test(`J2.4 — FR ${width} px: while /recipes loads the navigation stays, and the head and first card move ≤ 8 px`, async ({
        baseURL,
      }) => {
        const HELD_MS = 700;
        const page = await open(engine, "fr", width, baseURL);
        try {
          await page.goto("/templates");
          await expect(page.getByRole("heading", { level: 1 })).toHaveText("Modèles d'entraînement");
          // Warm the route's code (next dev compiles on first request), so the hold is the wait.
          expect((await page.request.get("/recipes")).status()).toBe(200);
          await page.waitForLoadState("networkidle");
          await page.context().addCookies([{ name: "evoli_fixture_recipes_delay", value: String(HELD_MS), url: baseURL! }]);

          const seen = await page.evaluate(async () => {
            const visible = (el: Element | null) => {
              if (!el) return false;
              const r = el.getBoundingClientRect();
              const s = getComputedStyle(el);
              return (
                r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" &&
                r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
              );
            };
            const navLink = () =>
              Array.from(document.querySelectorAll('nav a[href="/recipes"]')).find((a) => visible(a)) ?? null;
            const top = (el: Element) => el.getBoundingClientRect().top + scrollY;
            const facts = {
              navLostAt: null as number | null,
              shimmerEver: false,
              headAt: null as number | null,
              headTop: null as number | null,
              cardAt: null as number | null,
              cardTop: null as number | null,
              mutations: 0,
            };
            const t0 = performance.now();
            await new Promise<void>((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error("no /recipes content after 15 s")), 15_000);
              const check = () => {
                facts.mutations += 1;
                const now = performance.now() - t0;
                if (facts.navLostAt === null && navLink() === null) facts.navLostAt = now;
                if (
                  !facts.shimmerEver &&
                  Array.from(document.querySelectorAll("main *")).some((el) => getComputedStyle(el).animationName === "shimmer")
                )
                  facts.shimmerEver = true;
                if (location.pathname !== "/recipes") return;
                const h1 = document.querySelector("main h1");
                if (facts.headTop === null && h1 && (h1.textContent ?? "").trim() === "Recettes") {
                  facts.headAt = now;
                  facts.headTop = top(h1);
                }
                const card = document.querySelector('main [role="group"]');
                if (facts.cardTop === null && card) {
                  facts.cardAt = now;
                  facts.cardTop = top(card);
                }
                if (facts.headTop !== null && facts.cardTop !== null) {
                  observer.disconnect();
                  clearTimeout(timer);
                  resolve();
                }
              };
              const observer = new MutationObserver(check);
              observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
              (navLink() as HTMLAnchorElement).click();
            });
            return facts;
          });

          expect(seen.navLostAt, "the navigation left the screen while /recipes loaded").toBeNull();
          expect(seen.shimmerEver, "no skeleton is drawn").toBe(false);
          expect(seen.cardAt!, "the read really was held").toBeGreaterThan(HELD_MS);
          await expect(page).toHaveURL(/\/recipes$/);
          await expect(page.locator(".nav-progress")).toBeHidden();
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(500);
          const landed = await page.evaluate(() => {
            const top = (el: Element | null) => (el ? el.getBoundingClientRect().top + scrollY : null);
            return { head: top(document.querySelector("main h1")), card: top(document.querySelector('main [role="group"]')) };
          });
          expect(Math.abs(landed.head! - seen.headTop!), "the head moved when the page landed").toBeLessThanOrEqual(8);
          expect(Math.abs(landed.card! - seen.cardTop!), "the first card moved when the page landed").toBeLessThanOrEqual(8);
        } finally {
          await page.context().close();
        }
      });
    }
  });
}
