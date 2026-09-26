import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
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
    await expect(nav.getByRole("link")).toHaveText(["Roster", "Templates", "Recipes", "Nutrition templates"]);
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
    await page.getByLabel("Carbs", { exact: true }).fill("abc");
    await page.getByLabel("Fat", { exact: true }).fill("0");
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
  test("the four-link nav wraps: every link is whole, on screen and unoccluded", async ({ page }) => {
    await signIn(page);
    await page.goto("/nutrition-templates");
    const nav = page.getByRole("navigation", { name: "Portal" });
    const signOut = page.getByRole("button", { name: "Sign out" });
    await atEachWidth(page, async (width) => {
      for (const name of ["Roster", "Templates", "Recipes", "Nutrition templates"]) {
        const link = nav.getByRole("link", { name, exact: true });
        await expectUnoccluded(page, link, { over: signOut, label: `${name} nav link` });
        const box = await link.boundingBox();
        expect(box && box.x >= 0 && box.x + box.width <= width + 0.5, `${name} is inside ${width}px`).toBe(true);
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
