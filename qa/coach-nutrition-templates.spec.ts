import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoEnglish, signInFrench } from "./french";
import { atEachWidth, expectNoSidewaysScroll, expectUnoccluded } from "./layout";

/**
 * EV-273b AC1, AC2, AC3's empty branch and AC8's width sweep — the nutrition template
 * library and editor, in fixture mode (`playwright.config.ts`, EMPTY scenario: no
 * trainees and no nutrition templates, which is AC1's empty state).
 *
 * The apply half (AC3-AC5, AC7) needs trainees, so it lives in
 * `coach-nutrition-templates-apply.spec.ts` under `playwright.roster.config.ts`.
 *
 * Every AC sentence is a LITERAL here, never imported from `src/lib/copy.ts`: a test
 * that imports the string it asserts agrees with the product by construction.
 *
 * The api-side witness is the fixture's call journal (`/api/fixture/calls`): it records
 * each api request with the KEY SET of the body as it went over the wire, so "a save
 * sends exactly `name` and `targets`" is read off the request, not off the portal's type.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

const PRIVATE = "Nutrition templates are yours. No trainee ever sees them.";
const EMPTY = "You have no nutrition templates yet.";
const NEW_TEMPLATE = "New template";
const ABOVE_ZERO = "Enter a number above 0.";
const STANDING =
  "Evoli checks calories against a safe minimum when you use this template. It does not yet check protein or fat.";
const NO_TRAINEES = "You have no trainees who have shared their nutrition with you.";
const deleteBody = (name: string) =>
  `Delete “${name}”? Trainees you already used it on keep their targets and meals.`;

/** A realistic long name that must WRAP at 320 px, not be cut (AC8). 78 characters. */
const LONG_NAME = "Twelve-week recomposition phase for returning intermediate lifters, weeks 1-4";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

async function calls(page: Page): Promise<string[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { calls: string[] }).calls;
}
const writes = async (page: Page) =>
  (await calls(page)).filter((c) => /^(POST|PUT|DELETE) \/coach-portal\/nutrition-templates/.test(c));

function row(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

/** New template → fill → Save, and back on the library. Retried until hydrated. */
async function createTemplate(
  page: Page,
  name: string,
  [kcal, p, c, f]: [string, string, string, string]
) {
  await page.goto("/nutrition-templates/new");
  await page.getByLabel("Template name").fill(name);
  await page.getByLabel("Calories", { exact: true }).fill(kcal);
  await page.getByLabel("Protein", { exact: true }).fill(p);
  await page.getByLabel("Carbs", { exact: true }).fill(c);
  await page.getByLabel("Fat", { exact: true }).fill(f);
  await page.getByRole("button", { name: "Save template" }).click();
  await page.waitForURL("/nutrition-templates");
  await expect(row(page, name)).toBeVisible();
}

test.describe("AC1 — the nav and the empty library", () => {
  test("Nutrition templates sits next to Templates and Recipes, and opens the library", async ({ page }) => {
    await signIn(page);
    const nav = page.getByRole("navigation", { name: "Portal" });
    await expect(nav.getByRole("link")).toHaveText(["Roster", "Templates", "Recipes", "Nutrition templates", "Challenges"]);
    await nav.getByRole("link", { name: "Nutrition templates", exact: true }).click();
    await page.waitForURL("/nutrition-templates");
    await expect(page.getByRole("heading", { name: "Nutrition templates", level: 1 })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Nutrition templates", exact: true })).toHaveAttribute(
      "aria-current",
      "page"
    );
  });

  test("an empty library states privacy once, says it is empty, and offers New template", async ({ page }) => {
    await signIn(page);
    const res = await page.goto("/nutrition-templates");
    expect(res?.status()).toBe(200);
    await expect(page.getByText(PRIVATE, { exact: true })).toHaveCount(1);
    await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: NEW_TEMPLATE })).toHaveCount(1);
    await page.getByRole("button", { name: NEW_TEMPLATE }).click();
    await page.waitForURL("/nutrition-templates/new");
  });
});

test.describe("AC2 — the editor: a name and four targets, and nothing else", () => {
  test("a new template saves exactly {name, targets} and lists name, kcal and P/C/F", async ({ page }) => {
    await signIn(page);
    await page.goto("/nutrition-templates/new");
    // The fields ARE the name and the four targets: five text inputs, no select, no
    // checkbox, and no word about meals per day, snacks or "Meal k".
    await expect(page.locator("main input")).toHaveCount(5);
    await expect(page.locator("main select, main input[type=checkbox]")).toHaveCount(0);
    const text = await page.locator("main").innerText();
    expect(text).not.toMatch(/meals? (a|per) day|snack|Meal \d/i);
    await expect(page.getByText(STANDING, { exact: true })).toBeVisible();
    // An empty form: Save is disabled AND says why (staff review nit).
    await expect(page.getByRole("button", { name: "Save template" })).toBeDisabled();
    await expect(page.getByText("Give the template a name.", { exact: true })).toBeVisible();

    await createTemplate(page, "Cut 1800", ["1800", "150", "170", "60"]);
    const cut = row(page, "Cut 1800");
    await expect(cut.getByText("1800 kcal · P 150 g · C 170 g · F 60 g", { exact: true })).toBeVisible();
    expect(await writes(page)).toEqual(["POST /coach-portal/nutrition-templates {name,targets}"]);
    await expect(page.getByText(EMPTY, { exact: true })).toHaveCount(0);
  });

  test("a zero or a word is refused on the page with the targets form's sentence, and nothing is sent", async ({ page }) => {
    await signIn(page);
    await page.goto("/nutrition-templates/new");
    await page.getByLabel("Template name").fill("Zero fat");
    await page.getByLabel("Calories", { exact: true }).fill("1800");
    await page.getByLabel("Protein", { exact: true }).fill("150");
    await page.getByLabel("Carbs", { exact: true }).fill("170");
    // A zero ALONE — every other field valid — so the rule under test is "above 0",
    // not "is a number" (mutant M14 survived a version of this test that mixed the two).
    await page.getByLabel("Fat", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByRole("alert").filter({ hasText: ABOVE_ZERO })).toBeVisible();
    await page.waitForTimeout(400);
    expect(await writes(page)).toEqual([]);

    await page.getByLabel("Fat", { exact: true }).fill("60");
    await page.getByLabel("Carbs", { exact: true }).fill("abc");
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByRole("alert").filter({ hasText: ABOVE_ZERO })).toBeVisible();
    await page.waitForTimeout(400);
    expect(await writes(page)).toEqual([]);
  });

  test("a value the api refuses (calories 9000) is said, and the template is not listed", async ({ page }) => {
    await signIn(page);
    await page.goto("/nutrition-templates/new");
    await page.getByLabel("Template name").fill("Too much");
    await page.getByLabel("Calories", { exact: true }).fill("9000");
    await page.getByLabel("Protein", { exact: true }).fill("150");
    await page.getByLabel("Carbs", { exact: true }).fill("170");
    await page.getByLabel("Fat", { exact: true }).fill("60");
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(
      page.getByText(
        "Use whole numbers: calories 800 to 8000 kcal, protein up to 500 g, carbs up to 1200 g and fat up to 400 g.",
        { exact: true }
      )
    ).toBeVisible();
    await page.goto("/nutrition-templates");
    await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
  });

  test("edit saves {name, targets} again; duplicate, rename and a taken name behave", async ({ page }) => {
    await signIn(page);
    await createTemplate(page, "Cut 1800", ["1800", "150", "170", "60"]);

    // Edit
    await row(page, "Cut 1800").getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/nutrition-templates\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Calories", { exact: true })).toHaveValue("1800");
    await page.getByLabel("Calories", { exact: true }).fill("1750");
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText("Template saved.", { exact: true })).toBeVisible();
    const edited = (await writes(page)).at(-1) ?? "";
    expect(edited).toMatch(/^PUT \/coach-portal\/nutrition-templates\/[0-9a-f-]{36} \{name,targets\}$/);

    // Duplicate
    await page.goto("/nutrition-templates");
    await row(page, "Cut 1800").getByRole("button", { name: "Duplicate" }).click();
    await expect(row(page, "Cut 1800 (copy)")).toBeVisible();
    await expect(
      row(page, "Cut 1800 (copy)").getByText("1750 kcal · P 150 g · C 170 g · F 60 g", { exact: true })
    ).toBeVisible();

    // Rename to a taken name: refused, both unchanged
    await row(page, "Cut 1800 (copy)").getByRole("button", { name: "Rename" }).click();
    await page.getByRole("dialog").getByLabel("Template name").fill("  cut 1800 ");
    await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
    await expect(
      page.getByRole("dialog").getByText("You already have a nutrition template called that.", { exact: true })
    ).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();

    // Rename properly: a whole PUT of {name, targets}
    await row(page, "Cut 1800 (copy)").getByRole("button", { name: "Rename" }).click();
    await page.getByRole("dialog").getByLabel("Template name").fill("Cut 1750 travel");
    await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
    await expect(row(page, "Cut 1750 travel")).toBeVisible();
    const renamed = (await writes(page)).at(-1) ?? "";
    expect(renamed).toMatch(/^PUT \/coach-portal\/nutrition-templates\/[0-9a-f-]{36} \{name,targets\}$/);
    await expect(row(page, "Cut 1800")).toBeVisible();
  });

  test("a rename from a STALE tab keeps the targets another tab saved since (staff follow-up)", async ({ page, context }) => {
    await signIn(page);
    await createTemplate(page, "Cut 1800", ["1800", "150", "170", "60"]);
    // Tab A: the library as rendered now, 1800 kcal, and left open.
    await expect(row(page, "Cut 1800").getByText("1800 kcal · P 150 g · C 170 g · F 60 g", { exact: true })).toBeVisible();

    // Tab B (same session): edit the calories to 2000 and save.
    const b = await context.newPage();
    await b.goto("/nutrition-templates");
    await row(b, "Cut 1800").getByRole("link", { name: "Edit" }).click();
    await b.waitForURL(/\/nutrition-templates\/[0-9a-f-]{36}$/);
    await b.getByLabel("Calories", { exact: true }).fill("2000");
    await b.getByRole("button", { name: "Save template" }).click();
    await expect(b.getByText("Template saved.", { exact: true })).toBeVisible();
    await b.close();

    // Tab A, never reloaded, renames. Before the fix it PUT the row's 1800 back.
    await row(page, "Cut 1800").getByRole("button", { name: "Rename" }).click();
    await page.getByRole("dialog").getByLabel("Template name").fill("Cut travel");
    await page.getByRole("dialog").getByRole("button", { name: "Rename" }).click();
    await expect(row(page, "Cut travel")).toBeVisible();

    await page.reload();
    await expect(row(page, "Cut travel").getByText("2000 kcal · P 150 g · C 170 g · F 60 g", { exact: true })).toBeVisible();
    // The rename read the template before writing it: GET, then a whole PUT of {name, targets}.
    const journal = await calls(page);
    const put = journal.findLastIndex((c) => /^PUT \/coach-portal\/nutrition-templates\/[0-9a-f-]{36} \{name,targets\}$/.test(c));
    expect(put).toBeGreaterThan(0);
    expect(journal[put - 1]).toMatch(/^GET \/coach-portal\/nutrition-templates\/[0-9a-f-]{36}$/);
  });

  test("delete names the template and says trainees keep what they have", async ({ page }) => {
    await signIn(page);
    await createTemplate(page, "Cut 1800", ["1800", "150", "170", "60"]);
    await row(page, "Cut 1800").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("dialog").getByText(deleteBody("Cut 1800"), { exact: true })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(EMPTY, { exact: true })).toBeVisible();
  });
});

test.describe("AC3 — with nobody to use it on", () => {
  test("a coach with no NUTRITION trainees is told so, and nothing is read", async ({ page }) => {
    await signIn(page);
    await createTemplate(page, "Cut 1800", ["1800", "150", "170", "60"]);
    const before = await calls(page);
    await row(page, "Cut 1800").getByRole("button", { name: "Use on a trainee" }).click();
    await expect(page.getByRole("dialog").getByText(NO_TRAINEES, { exact: true })).toBeVisible();
    await page.waitForTimeout(400);
    expect(await calls(page)).toEqual(before);
  });
});

test.describe("AC8 — 320 / 360 / 390 / 414", () => {
  test("the five-link nav wraps: every link is whole, on screen and unoccluded", async ({ page }) => {
    await signIn(page);
    await page.goto("/nutrition-templates");
    const nav = page.getByRole("navigation", { name: "Portal" });
    const signOut = page.getByRole("button", { name: "Sign out" });
    await atEachWidth(page, async (width) => {
      for (const name of ["Roster", "Templates", "Recipes", "Nutrition templates", "Challenges"]) {
        const link = nav.getByRole("link", { name, exact: true });
        await expectUnoccluded(page, link, { over: signOut, label: `${name} nav link` });
        const box = await link.boundingBox();
        const right = box ? Math.round(box.x + box.width) : NaN;
        expect(box && box.x >= 0 && right <= width, `${name}: right edge at ${right}px in a ${width}px viewport`).toBe(true);
      }
      await expectNoSidewaysScroll(page, "the nutrition library");
    });
  });

  test("a long name wraps in the list and the editor, never cut, and nothing scrolls sideways", async ({ page }) => {
    await signIn(page);
    await createTemplate(page, LONG_NAME, ["1800", "150", "170", "60"]);
    await atEachWidth(page, async (width) => {
      await expectNoSidewaysScroll(page, "library with a long name");
      const title = row(page, LONG_NAME).getByText(LONG_NAME, { exact: true });
      await expect(title).toBeVisible();
      const cut = await title.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(cut, `the name is cut at ${width}px`).toBeLessThanOrEqual(0);
      await expectUnoccluded(page, row(page, LONG_NAME).getByRole("button", { name: "Use on a trainee" }), {
        label: "Use on a trainee",
      });
    });
    await row(page, LONG_NAME).getByRole("link", { name: "Edit" }).click();
    await page.waitForURL(/\/nutrition-templates\/[0-9a-f-]{36}$/);
    await atEachWidth(page, async () => {
      await expectNoSidewaysScroll(page, "the editor");
      await expectUnoccluded(page, page.getByRole("button", { name: "Save template" }), { label: "Save" });
    });
  });
});

/* ── EV-273a AC5 — the cap, as the portal says it ────────────────────────────
 * `evoli_fixture_nutrition_template_cap=reached` makes the fixture's `requireRoom` refuse
 * without changing what the list served: another tab filled the library after this page
 * read `remaining`. The sentence names the limit the api SERVED (50), never a constant. */
const LIMIT_EN = "You can keep up to 50 nutrition templates. Delete one to make room.";

test.describe("EV-273a AC5 — the 51st template", () => {
  test("duplicate and create past the cap are refused with the served limit, and nothing is added", async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(page);
    await createTemplate(page, "Cut 1800", ["1800", "150", "170", "60"]);
    await context.addCookies([{ name: "evoli_fixture_nutrition_template_cap", value: "reached", url: baseURL! }]);

    await row(page, "Cut 1800").getByRole("button", { name: "Duplicate" }).click();
    await expect(page.getByRole("alert").filter({ hasText: LIMIT_EN })).toBeVisible();
    await expect(row(page, "Cut 1800 (copy)")).toHaveCount(0);

    await page.goto("/nutrition-templates/new");
    await page.getByLabel("Template name").fill("Bulk 3000");
    await page.getByLabel("Calories", { exact: true }).fill("3000");
    await page.getByLabel("Protein", { exact: true }).fill("180");
    await page.getByLabel("Carbs", { exact: true }).fill("380");
    await page.getByLabel("Fat", { exact: true }).fill("85");
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByRole("alert").filter({ hasText: LIMIT_EN })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/nutrition-templates/new");

    await page.goto("/nutrition-templates");
    await expect(page.locator("main").getByRole("group")).toHaveCount(1);
  });
});

/* ── EV-324 — the library in a French browser ────────────────────────────────
 * Every sentence is a LITERAL. French numbers are grouped with U+202F (the narrow no-break
 * space `Intl` fr-FR uses), and quotes are « » with U+00A0 inside, as `copy.fr.ts`'s `q`
 * writes them. `expectNoEnglish` fails on any English UI string left on the page. */
const NNBSP = " ";
const guillemets = (text: string) => `« ${text} »`;

test.describe("EV-324 — nutrition templates in a French browser (fr-FR)", () => {
  test.use({ locale: "fr-FR" });

  test("the empty library, the nav and the empty picker are French", async ({ page }) => {
    await signInFrench(page);
    const nav = page.getByRole("navigation", { name: "Portail" });
    await expect(nav.getByRole("link")).toHaveText(["Clients", "Modèles", "Recettes", "Modèles nutrition", "Défis"]);
    await nav.getByRole("link", { name: "Modèles nutrition", exact: true }).click();
    await page.waitForURL("/nutrition-templates");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { name: "Modèles nutrition", level: 1 })).toBeVisible();
    await expect(
      page.getByText("Vos modèles nutrition vous appartiennent. Aucun client ne les voit.", { exact: true })
    ).toHaveCount(1);
    await expect(page.getByText("Vous n'avez encore aucun modèle nutrition.", { exact: true })).toBeVisible();
    await expectNoEnglish(page, "the empty nutrition library");
  });

  test("the editor: labels, the above-0 rule, the api's bounds with U+202F, and a save", async ({ page }) => {
    await signInFrench(page);
    await page.goto("/nutrition-templates/new");
    await expect(page.getByRole("heading", { name: "Nouveau modèle nutrition", level: 1 })).toBeVisible();
    await expect(page.getByText("Donnez un nom au modèle.", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Evoli vérifie les calories par rapport à un minimum sûr quand vous utilisez ce modèle. Il ne vérifie pas encore les protéines ni les lipides.",
        { exact: true }
      )
    ).toBeVisible();
    await expectNoEnglish(page, "the new nutrition template editor");

    await page.getByLabel("Nom du modèle").fill("Sèche 1800");
    await page.getByLabel("Calories", { exact: true }).fill("1800");
    await page.getByLabel("Protéines", { exact: true }).fill("150");
    await page.getByLabel("Glucides", { exact: true }).fill("170");
    await page.getByLabel("Lipides", { exact: true }).fill("0");
    await page.getByRole("button", { name: "Enregistrer le modèle" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Saisissez un nombre supérieur à 0." })).toBeVisible();

    await page.getByLabel("Lipides", { exact: true }).fill("60");
    await page.getByLabel("Calories", { exact: true }).fill("9000");
    await page.getByRole("button", { name: "Enregistrer le modèle" }).click();
    await expect(
      page.getByText(
        `Utilisez des nombres entiers : calories de 800 à 8${NNBSP}000 kcal, protéines jusqu'à 500 g, glucides jusqu'à 1${NNBSP}200 g et lipides jusqu'à 400 g.`,
        { exact: true }
      )
    ).toBeVisible();

    await page.getByLabel("Calories", { exact: true }).fill("1800");
    await page.getByRole("button", { name: "Enregistrer le modèle" }).click();
    await page.waitForURL("/nutrition-templates");
    const sèche = row(page, "Sèche 1800");
    await expect(sèche.getByText(`1${NNBSP}800 kcal · P 150 g · G 170 g · L 60 g`, { exact: true })).toBeVisible();
    await expect(sèche.getByText(/^Mis à jour le (?:1er|\d{1,2}) \S+ \d{4}$/)).toBeVisible();
    await expect(sèche.getByRole("button", { name: "Utiliser pour un client" })).toBeVisible();
    await expectNoEnglish(page, "the nutrition library with a template");
  });

  test("duplicate, a taken name, the cap, delete and the empty picker are French", async ({
    page,
    context,
    baseURL,
  }) => {
    await signInFrench(page);
    await page.goto("/nutrition-templates/new");
    await page.getByLabel("Nom du modèle").fill("Sèche 1800");
    await page.getByLabel("Calories", { exact: true }).fill("1800");
    await page.getByLabel("Protéines", { exact: true }).fill("150");
    await page.getByLabel("Glucides", { exact: true }).fill("170");
    await page.getByLabel("Lipides", { exact: true }).fill("60");
    await page.getByRole("button", { name: "Enregistrer le modèle" }).click();
    await page.waitForURL("/nutrition-templates");

    // Duplicate. "(copy)" is the API's suffix (EV-273a `withSuffix`): the name is data.
    await row(page, "Sèche 1800").getByRole("button", { name: "Dupliquer" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: `${guillemets("Sèche 1800 (copy)")} est dans vos modèles nutrition.` })
    ).toBeVisible();

    // A taken name, folded as the api folds it.
    await row(page, "Sèche 1800 (copy)").getByRole("button", { name: "Renommer" }).click();
    const rename = page.getByRole("dialog", { name: "Renommer le modèle" });
    await rename.getByLabel("Nom du modèle").fill("  sèche 1800 ");
    await rename.getByRole("button", { name: "Renommer" }).click();
    await expect(rename.getByText("Vous avez déjà un modèle nutrition portant ce nom.", { exact: true })).toBeVisible();
    await expectNoEnglish(page, "the rename dialog");
    await rename.getByRole("button", { name: "Annuler" }).click();

    // The cap.
    await context.addCookies([{ name: "evoli_fixture_nutrition_template_cap", value: "reached", url: baseURL! }]);
    await row(page, "Sèche 1800").getByRole("button", { name: "Dupliquer" }).click();
    await expect(
      page.getByRole("alert").filter({
        hasText: "Vous pouvez conserver jusqu'à 50 modèles nutrition. Supprimez-en un pour faire de la place.",
      })
    ).toBeVisible();

    // Delete, confirmed.
    await row(page, "Sèche 1800 (copy)").getByRole("button", { name: "Supprimer" }).click();
    const del = page.getByRole("dialog", { name: "Supprimer le modèle ?" });
    await expect(
      del.getByText(
        `Supprimer ${guillemets("Sèche 1800 (copy)")} ? Les clients pour qui vous l'avez déjà utilisé conservent leurs objectifs et leurs repas.`,
        { exact: true }
      )
    ).toBeVisible();
    await expectNoEnglish(page, "the delete dialog");
    await del.getByRole("button", { name: "Supprimer" }).click();
    await expect(row(page, "Sèche 1800 (copy)")).toHaveCount(0);

    // Nobody to use it on (this suite's roster is empty).
    await row(page, "Sèche 1800").getByRole("button", { name: "Utiliser pour un client" }).click();
    const picker = page.getByRole("dialog", { name: "Utiliser pour un client" });
    await expect(picker.getByText(`Choisissez le client qui recevra ${guillemets("Sèche 1800")}.`, { exact: true })).toBeVisible();
    await expect(
      picker.getByText("Aucun de vos clients n'a partagé sa nutrition avec vous.", { exact: true })
    ).toBeVisible();
    await expectNoEnglish(page, "the empty picker");
  });

  test("the five French nav links wrap whole at 320 / 360 / 390 / 414", async ({ page }) => {
    await signInFrench(page);
    await page.goto("/nutrition-templates");
    const nav = page.getByRole("navigation", { name: "Portail" });
    const signOut = page.getByRole("button", { name: "Se déconnecter" });
    await atEachWidth(page, async (width) => {
      for (const name of ["Clients", "Modèles", "Recettes", "Modèles nutrition", "Défis"]) {
        const link = nav.getByRole("link", { name, exact: true });
        await expectUnoccluded(page, link, { over: signOut, label: `${name} nav link` });
        const box = await link.boundingBox();
        const right = box ? Math.round(box.x + box.width) : NaN;
        expect(box && box.x >= 0 && right <= width, `${name}: right edge at ${right}px in a ${width}px viewport`).toBe(true);
      }
      await expectNoSidewaysScroll(page, "the French nutrition library");
    });
  });
});
