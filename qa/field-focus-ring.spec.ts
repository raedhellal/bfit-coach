import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { closeSweepBrowser, openDialog, settled, signIn, sweepRoute, type Route } from "./focus-ring-sweep";
import { openTargetsForm } from "./targets-card";

/**
 * BUG-663 (P2, WCAG 2.2 SC 2.4.7 Focus Visible) — every text field in the portal, reached
 * with the keyboard, shows a focus indicator that a sighted keyboard user can see.
 *
 * Before the fix the kit `Input` set an inline `outline: none` on its `<input>` and drew a
 * ring only when the caller passed `focusRing`, which only LoginForm did: QA measured the
 * recipe editor's "Find an ingredient" field (`qapro1`, PB-6) with no outline and no
 * shadow on Tab. The other kit call sites (activation, challenge create, progress goal,
 * swap-sheet recipe search, exercise catalogue search) shared it by construction.
 *
 * What this file does, per route and in Chromium AND WebKit (WebKit is launched here: the
 * configs' project is Chromium; a missing WebKit FAILS rather than skips):
 *
 *  1. Tabs through the page (or through an opened dialog's focus trap) until focus comes
 *     back round, and for every TEXT FIELD focus lands on (input of a text-like type,
 *     textarea, select):
 *  2. finds the indicator: a non-`none` outline on the field or on one of its two nearest
 *     ancestors (the kit draws it on the field's box), else a non-`none` box-shadow there;
 *     neither is a failure, "no indicator";
 *  3. PHOTOGRAPHS it and reads the painted pixels, side by side: the ring's own band, the
 *     pixel just outside it and the pixel just inside it, on the middle half of each of
 *     the four sides. Each side's ring colour must reach 3:1 against both neighbours
 *     (WCAG 1.4.11's non-text contrast for the indicator). A ring that is declared but
 *     clipped by a scrolling ancestor, painted under something, or drawn in a colour too
 *     close to what it sits on reads as a failure here, because what is measured is the
 *     screen, not the stylesheet. (The kit's old `focusRing` halo was a declared box-shadow
 *     at 0.18 alpha: computed "not none", painted at ~1.2:1. A computed-style check alone
 *     would have passed it.)
 *  4. checks the sweep was not vacuous: every visible, enabled text field in the scope was
 *     reached by the keyboard, and the route's named fields were among them.
 *
 * Red on the base (c4a5865), both engines: exactly the 15 kit `Input` fields, in nine
 * routes; LoginForm's caller-switched halo reads 1.23:1 against the white around it. Every
 * raw `<input>`/`<select>`/`<textarea>` was already green there (the global `:focus-visible`
 * rule), and the sweep keeps them so.
 *
 * WebKit: Alt+Tab on macOS (a plain Tab skips links there), and a date field reached with
 * it never matches `:focus-visible` (it walks the month/day/year parts of one element), so
 * the kit also rings `[type=date]:focus` and this file does not demand `:focus-visible` of a
 * WebKit date field: the pixels decide.
 *
 * The WebKit half needs `next dev` (this config) or https: under `next start` the session
 * cookie is `Secure`, and WebKit, unlike Chromium, drops a Secure cookie on
 * http://localhost, so every signed-in route bounces back to /login (witnessed 2026-10-02;
 * the Chromium half is green on `next start`).
 *
 * The roster search field (EV-337d) needs the populated roster, which this config does not
 * serve: it is swept by `qa/field-focus-ring-roster.spec.ts` under `playwright.roster.config.ts`
 * (BUG-724). The sweep itself lives in `qa/focus-ring-sweep.ts`, shared by both files.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const TESS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0019";
const TEMPLATE = "7c2d0a11-0000-4000-8000-0000000000b1"; // Upper / Lower split
const RECIPE = "8e3f1b22-0000-4000-8000-0000000000c1"; // Chicken rice bowl
const NUTRITION_TEMPLATE = "Focus ring 1800"; // the default seed holds no nutrition template: made here

// ─────────────────────────── routes ───────────────────────────

const nutritionTemplateRow = (page: Page) => page.getByRole("group", { name: NUTRITION_TEMPLATE, exact: true });

/**
 * New nutrition template, saved. A fill before hydration is a no-op for the editor's state,
 * so it waits for the form's own witness first, like `qa/sign-in.ts`: « Save template » is
 * SSR'd disabled and only React's name state enables it. Once it is enabled the editor has
 * hydrated, so the numbers are filled once and Save is clicked ONCE. The old loop clicked
 * again after a 3 s wait, which a loaded machine overran (WebKit, 30 s budget, witnessed),
 * and a second click on a slow save could create a second template of the same name.
 */
async function createNutritionTemplate(page: Page) {
  await page.goto("/nutrition-templates/new", { waitUntil: "domcontentloaded" });
  const save = page.getByRole("button", { name: "Save template" });
  await expect(async () => {
    // Cleared first: a re-fill with the same text is not a change to React (qa/sign-in.ts).
    await page.getByLabel("Template name").fill("");
    await page.getByLabel("Template name").fill(NUTRITION_TEMPLATE);
    await expect(save, "« Save template » enabled = the editor's state holds the name (hydrated)").toBeEnabled({
      timeout: 2_000,
    });
  }).toPass({ timeout: 45_000 });
  await page.getByLabel("Calories", { exact: true }).fill("1800");
  await page.getByLabel("Protein", { exact: true }).fill("150");
  await page.getByLabel("Carbs", { exact: true }).fill("170");
  await page.getByLabel("Fat", { exact: true }).fill("60");
  await save.click();
  await page.waitForURL("/nutrition-templates", { timeout: 45_000 });
  await expect(nutritionTemplateRow(page)).toBeVisible();
}

const ROUTES: Route[] = [
  {
    name: "login",
    open: async (page) => {
      await page.goto("/login");
      await settled(page, page.getByLabel("Email"));
      return null;
    },
    expectNames: ["email", "password"],
  },
  {
    name: "activate",
    open: async (page) => {
      await signIn(page, "new.coach@evoli.fit", "Temp-pass-2026", /\/activate$/);
      await settled(page, page.getByLabel("Temporary password"));
      return null;
    },
    expectNames: ["Temporary password", "New password", "Repeat the new password"],
  },
  {
    name: "roster: invite link",
    open: async (page) => {
      await signIn(page);
      const scope = await openDialog(page, page.getByRole("button", { name: "Invite a trainee" }), /Invite/);
      // The link is minted after the dialog opens (a skeleton until then).
      await expect(page.getByLabel("Invite link")).toBeVisible();
      return scope;
    },
    expectNames: ["Invite link"],
  },
  {
    name: "templates: new",
    open: async (page) => {
      await signIn(page);
      await page.goto("/templates/new");
      await settled(page, page.getByRole("button", { name: "Add exercise" }).first());
      return null;
    },
    expectNames: [],
  },
  {
    name: "templates: detail",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/templates/${TEMPLATE}`);
      await settled(page, page.getByRole("button", { name: "Add exercise" }).first());
      return null;
    },
    expectNames: [],
  },
  {
    name: "templates: exercise catalogue search",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/templates/${TEMPLATE}`);
      await settled(page, page.getByRole("button", { name: "Add exercise" }).first());
      return openDialog(page, page.getByRole("button", { name: "Add exercise" }).first(), /exercise/i);
    },
    expectNames: [],
  },
  {
    name: "templates: rename",
    open: async (page) => {
      await signIn(page);
      await page.goto("/templates");
      // EV-337i: Rename sits behind the row's « ⋯ » disclosure.
      const more = page.getByRole("button", { name: "More actions" }).first();
      await settled(page, more);
      await expect(async () => {
        if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
        await expect(more).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
      }).toPass();
      return openDialog(page, page.getByRole("button", { name: "Rename" }).first(), "Rename template");
    },
    expectNames: [],
  },
  {
    name: "recipes: library filter",
    open: async (page) => {
      await signIn(page);
      await page.goto("/recipes");
      await settled(page, page.locator("#recipe-slot-filter"));
      return null;
    },
    // EV-337j2 (staff N2): the library's search is a text field Tab must reach, by name.
    expectNames: ["Search recipes"],
  },
  {
    name: "recipes: new",
    open: async (page) => {
      await signIn(page);
      await page.goto("/recipes/new");
      await settled(page, page.getByLabel("Find an ingredient"));
      return null;
    },
    expectNames: ["Find an ingredient"],
  },
  {
    name: "recipes: detail",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/recipes/${RECIPE}`);
      await settled(page, page.getByLabel("Find an ingredient"));
      return null;
    },
    expectNames: ["Find an ingredient"],
  },
  {
    name: "nutrition templates: new",
    open: async (page) => {
      await signIn(page);
      await page.goto("/nutrition-templates/new");
      await settled(page, page.locator("main input").first());
      return null;
    },
    expectNames: [],
  },
  {
    name: "nutrition templates: detail",
    open: async (page) => {
      await signIn(page);
      await createNutritionTemplate(page);
      await nutritionTemplateRow(page).getByRole("link", { name: "Edit" }).click();
      await page.waitForURL(/\/nutrition-templates\/[^/]+$/, { timeout: 10_000 });
      await settled(page, page.getByLabel("Template name"));
      return null;
    },
    expectNames: ["Template name", "Calories", "Protein", "Carbs", "Fat"],
  },
  {
    name: "nutrition templates: rename",
    open: async (page) => {
      await signIn(page);
      await createNutritionTemplate(page);
      return openDialog(page, nutritionTemplateRow(page).getByRole("button", { name: "Rename" }), "Rename template");
    },
    expectNames: [],
  },
  {
    name: "client: overview (progress goal)",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/clients/${LINA}`);
      await settled(page, page.getByRole("region", { name: "Progress and milestone" }));
      return null;
    },
    expectNames: ["Coaching start date", "Milestone weight (kg)", "Milestone body fat (%)"],
  },
  {
    name: "client: routine editor",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/clients/${LINA}/routine`);
      await settled(page, page.getByRole("button", { name: "Add exercise" }).first());
      return null;
    },
    expectNames: [],
  },
  {
    name: "client: routine exercise catalogue search",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/clients/${LINA}/routine`);
      await settled(page, page.getByRole("button", { name: "Add exercise" }).first());
      return openDialog(page, page.getByRole("button", { name: "Add exercise" }).first(), /exercise/i);
    },
    expectNames: [],
  },
  {
    name: "client: save as template",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/clients/${LINA}/routine`);
      await settled(page, page.getByRole("button", { name: "Save as template" }));
      return openDialog(page, page.getByRole("button", { name: "Save as template" }), /template/i);
    },
    expectNames: [],
  },
  {
    name: "client: nutrition editor",
    open: async (page) => {
      await signIn(page);
      await page.goto(`/clients/${LINA}/nutrition`);
      await openTargetsForm(page);
      await settled(page, page.getByLabel("Calories", { exact: true }));
      return null;
    },
    expectNames: ["Calories"],
  },
  {
    name: "client: swap sheet recipe search",
    open: async (page) => {
      await signIn(page, "coach.c1@evoli.fit");
      await page.goto(`/clients/${TESS}/nutrition`);
      const row = page.getByRole("group", { name: "Wednesday Lunch", exact: true });
      await settled(page, row);
      return openDialog(page, row.getByRole("button", { name: /^Swap meal: / }), "Swap meal");
    },
    expectNames: ["Search your recipes"],
  },
  {
    name: "challenges: create",
    open: async (page) => {
      await signIn(page);
      await page.goto("/challenges");
      await settled(page, page.getByRole("button", { name: "New challenge" }));
      return openDialog(page, page.getByRole("button", { name: "New challenge" }), "New challenge");
    },
    expectNames: ["Title", "Daily step goal", "Starts on", "Ends on"],
  },
];

// ─────────────────────────── the tests ───────────────────────────

test.afterAll(closeSweepBrowser);

for (const engine of ["chromium", "webkit"] as const) {
  test.describe(`BUG-663 — keyboard focus ring on every text field (${engine})`, () => {
    for (const route of ROUTES) {
      test(`${route.name}`, async ({ page, baseURL }) => sweepRoute(engine, route, page, baseURL));
    }
  });
}
