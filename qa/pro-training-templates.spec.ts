import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoSidewaysScroll, expectUnoccluded } from "./layout";
import { expectNoEnglish, signInFrench } from "./french";

/**
 * EV-337i — training templates in the Evoli Pro redesign: `/templates`, `/templates/new`,
 * `/templates/[id]` (plan §5.7; story X1–X8 and the EV-337i line: the « Avant
 * d'enregistrer » checklist uses `templateEditor.checklist.*` in both languages).
 *
 * Main config (`empty` roster scenario): the library is seeded with three templates —
 * « Upper / Lower split » (2 days, 6 exercises), « Legacy strength », « Core circuit » —
 * and every test starts from that seed (fixture-test). The apply flow needs trainees and
 * stays in `coach-library-apply.spec.ts` (roster config).
 *
 * Every sentence is a LITERAL, never an import from copy.ts (a fixture derived from its
 * subject cannot witness it).
 */

const UPPER_LOWER = "7c2d0a11-0000-4000-8000-0000000000b1";
/** No such template: the api answers 403, the same body as a foreign one. */
const NOT_A_TEMPLATE = "7c2d0a11-0000-4000-8000-0000000000ff";
const SEEDED = ["Upper / Lower split", "Legacy strength", "Core circuit"];

/** Story X1's widths, both sides of every breakpoint. */
const X1_WIDTHS = [1440, 1280, 1279, 1024, 1023, 768, 767, 390, 320] as const;

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@evoli.fit");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

function row(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

/** Opens a row's « ⋯ » disclosure, retried until the island answers (a press before hydration opens nothing). */
async function openMore(page: Page, name: string, label: string) {
  const more = row(page, name).getByRole("button", { name: label });
  await expect(async () => {
    if ((await more.getAttribute("aria-expanded")) !== "true") await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
  }).toPass();
  return more;
}

async function box(locator: Locator) {
  const b = await locator.boundingBox();
  expect(b, "has a box").not.toBeNull();
  return b!;
}

test.describe("X1 + X4 — nine widths, both languages: no sideways scroll, exactly one h1", () => {
  for (const locale of ["en-US", "fr-FR"] as const) {
    test.describe(locale, () => {
      test.use({ locale });
      test("the list, a new template, an existing one, and the refusal", async ({ page }) => {
        if (locale === "fr-FR") await signInFrench(page);
        else await signIn(page);
        for (const path of ["/templates", "/templates/new", `/templates/${UPPER_LOWER}`, `/templates/${NOT_A_TEMPLATE}`]) {
          for (const width of X1_WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            if (width === X1_WIDTHS[0]) await page.goto(path);
            await expectNoSidewaysScroll(page, `${path} (${locale})`);
            await expect(page.locator("h1"), `${path} at ${width}`).toHaveCount(1);
          }
        }
      });
    });
  }
});

test.describe("the list (§5.7)", () => {
  test.use({ locale: "fr-FR" });

  test("French: the head, the count from the api, two actions and a disclosure per row", async ({ page }) => {
    await signInFrench(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/templates");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Modèles d'entraînement");
    await expect(page.getByText("Vos programmes réutilisables.", { exact: true })).toBeVisible();
    await expect(page.getByText("Vos modèles vous appartiennent. Aucun client ne les voit.", { exact: true })).toBeVisible();
    // « Nouveau modèle » is a navigation, drawn once in the head.
    await expect(page.getByRole("link", { name: "Nouveau modèle" })).toHaveAttribute("href", "/templates/new");
    await expect(page.getByRole("link", { name: "Nouveau modèle" })).toHaveCount(1);
    // The count line: the rows listed, then the api's own remaining / limit (50 − 3).
    await expect(page.getByText("3 modèles · 47 restants sur 50", { exact: true })).toBeVisible();

    const upper = row(page, SEEDED[0]);
    await expect(upper.getByText("2 jours · 6 exercices", { exact: true })).toBeVisible();
    await expect(upper.getByRole("button", { name: "Appliquer à un client" })).toBeVisible();
    await expect(upper.getByRole("link", { name: "Modifier" })).toHaveAttribute("href", `/templates/${UPPER_LOWER}`);
    // Duplicate / Rename / Delete sit behind the row's « ⋯ », a disclosure.
    const more = upper.getByRole("button", { name: "Plus d'actions" });
    await expect(more).toHaveAttribute("aria-expanded", "false");
    for (const name of ["Dupliquer", "Renommer", "Supprimer"]) await expect(upper.getByRole("button", { name })).toHaveCount(0);
    await openMore(page, SEEDED[0], "Plus d'actions");
    const panel = page.locator(`[id="${await more.getAttribute("aria-controls")}"]`);
    for (const name of ["Dupliquer", "Renommer", "Supprimer"]) await expect(panel.getByRole("button", { name })).toBeVisible();
    // Only this row opened.
    await expect(row(page, SEEDED[1]).getByRole("button", { name: "Supprimer" })).toHaveCount(0);
    // Not drawn: minutes and « utilisé par N clients » (plan §7 G19, no api field).
    await expect(page.getByText(/utilisé par|~\d+ min/)).toHaveCount(0);
    await expectNoEnglish(page, "the training-template list");
  });

  test("one card of rows from 768 px, one card per template below it", async ({ page }) => {
    await signInFrench(page);
    await page.goto("/templates");
    const radius = (l: Locator) => l.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    const list = page.locator("ul.tpl-list");
    const first = page.locator("li.tpl-item").first();
    for (const width of [1440, 1024, 768]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await radius(list), `list card at ${width}`).toBe("24px");
      expect(await radius(first), `row is not a card at ${width}`).toBe("0px");
    }
    for (const width of [767, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await radius(list), `no outer card at ${width}`).toBe("0px");
      expect(await radius(first), `each template is a card at ${width}`).toBe("24px");
      // Cards stack: the second card starts below the first, with a gap.
      const a = await box(first);
      const b = await box(page.locator("li.tpl-item").nth(1));
      expect(b.y, `cards stack at ${width}`).toBeGreaterThanOrEqual(a.y + a.height + 8);
    }
  });

  test("search narrows by name (accents and case ignored), says so, and clears", async ({ page }) => {
    await signInFrench(page);
    await page.goto("/templates");
    const search = page.getByRole("searchbox", { name: "Rechercher un modèle" });
    // Retried: a value typed before hydration reaches no state.
    await expect(async () => {
      await search.fill("LÉGACY");
      await expect(page.getByRole("group")).toHaveCount(1, { timeout: 1_000 });
    }).toPass();
    await expect(row(page, "Legacy strength")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "1 modèle affiché" })).toHaveCount(1);
    await search.fill("zzz");
    await expect(page.getByRole("group")).toHaveCount(0);
    await expect(page.getByText("Aucun modèle ne correspond à cette recherche.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Effacer la recherche" }).click();
    await expect(page.getByRole("group")).toHaveCount(3);
    // Staff nit (8b175b2): the button unmounts itself; focus goes back to the field, not <body>.
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
  });

  test("an empty library: one h1 and ONE « Nouveau modèle », in the empty state", async ({ page }) => {
    await signInFrench(page);
    await page.goto("/templates");
    for (const name of SEEDED) {
      await openMore(page, name, "Plus d'actions");
      await row(page, name).getByRole("button", { name: "Supprimer" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
      await expect(row(page, name)).toHaveCount(0);
    }
    await page.reload();
    await expect(page.getByText("Aucun modèle pour l'instant", { exact: true })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Nouveau modèle" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Nouveau modèle" })).toHaveCount(0);
    // No search and no count over nothing.
    await expect(page.getByRole("searchbox")).toHaveCount(0);
  });
});

test.describe("the editor (§5.7)", () => {
  test.use({ locale: "fr-FR" });

  test("« Avant d'enregistrer » on a blank template, French: met and unmet differ in words AND icon", async ({ page }) => {
    await signInFrench(page);
    await page.goto("/templates/new");
    const aside = page.getByRole("complementary", { name: "Avant d'enregistrer" });
    await expect(aside.getByRole("heading", { level: 2, name: "Avant d'enregistrer" })).toBeVisible();
    const items = aside.getByRole("listitem");
    await expect(items).toHaveText([
      "Donnez un nom au modèle.",
      "Entre 2 et 6 jours d'entraînement",
      "Le jour 1 n'a aucun exercice",
      "Le jour 2 n'a aucun exercice",
    ]);
    const states = await items.evaluateAll((els) =>
      els.map((el) => ({ ok: el.hasAttribute("data-ok"), icon: el.querySelector("svg path")?.getAttribute("d") ?? "" }))
    );
    expect(states.map((s) => s.ok)).toEqual([false, true, false, false]);
    // Not colour alone: the met line's glyph is not the unmet lines' glyph.
    expect(states[1].icon).not.toBe(states[0].icon);
    expect(new Set([states[0].icon, states[2].icon, states[3].icon]).size).toBe(1);
    // A new template is used by nobody: no « gardent leur version » here.
    await expect(page.getByText(/gardent leur version/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enregistrer le modèle" })).toBeDisabled();

    // Naming it meets the first line, in its met words.
    await expect(async () => {
      await page.getByLabel("Nom du modèle", { exact: true }).fill("Full body A");
      await expect(items.first()).toHaveText("Nom renseigné", { timeout: 1_000 });
    }).toPass();
    await expect(items.first()).toHaveAttribute("data-ok", "");
    await expectNoEnglish(page, "the new template editor");
  });

  test("an existing template: « gardent leur version », and the unsaved pill appears with its words", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/templates/${UPPER_LOWER}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Upper / Lower split");
    await expect(
      page.getByText(
        "Les clients qui utilisent déjà ce modèle gardent leur version : modifier un modèle ne change aucun programme publié.",
        { exact: true }
      )
    ).toBeVisible();
    await expect(page.getByText("Modifications non enregistrées", { exact: true })).toHaveCount(0);
    const pill = page.locator(".status-pill").filter({ hasText: "Modifications non enregistrées" });
    await expect(async () => {
      await page.getByLabel("Nom du modèle", { exact: true }).fill("Upper / Lower split 2");
      await expect(pill).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await expect(pill).toHaveAttribute("data-tone", "amber");
    // The pill sits in the page head, beside the title, not in the form.
    const h1 = await box(page.locator("h1"));
    const p = await box(pill);
    expect(p.y).toBeLessThan(h1.y + h1.height + 60);
  });

  test("two columns from 1280 (form left, checklist right); one column at 1279, checklist first", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/templates/${UPPER_LOWER}`);
    const aside = page.locator("aside.tpl-editor-aside");
    const form = page.locator(".tpl-editor-main");
    for (const width of [1440, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const a = await box(aside);
      const f = await box(form);
      expect(a.x, `aside right of the form at ${width}`).toBeGreaterThan(f.x + f.width - 1);
      expect(Math.abs(a.y - f.y), `side by side at ${width}`).toBeLessThan(2);
    }
    for (const width of [1279, 1024, 767, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const a = await box(aside);
      const f = await box(form);
      expect(Math.abs(a.x - f.x), `one column at ${width}`).toBeLessThan(1);
      expect(a.y + a.height, `checklist above the form at ${width}`).toBeLessThanOrEqual(f.y);
    }
  });

  /**
   * Plan §3: the sticky action bar sits ABOVE the bottom tab bar (< 1024) and above the
   * sticky legal footer (≥ 1024) — « Enregistrer » is on screen without scrolling, at the
   * top of the page and in the middle of a long one, and nothing is painted over it.
   */
  test("the action bar: Save on screen and unoccluded, above the tab bar or the footer", async ({ page }) => {
    await signInFrench(page);
    for (const [width, height] of [
      [320, 700],
      [390, 844],
      [767, 900],
      [1023, 800],
      [1024, 800],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto(`/templates/${UPPER_LOWER}`);
      for (const scroll of [0, 900]) {
        await page.evaluate((y) => window.scrollTo(0, y), scroll);
        const save = page.getByRole("button", { name: "Enregistrer le modèle" });
        const cancel = page.getByRole("region", { name: "Enregistrer le modèle" }).getByRole("link", { name: "Annuler" });
        for (const [control, label] of [
          [save, "Save"],
          [cancel, "Cancel"],
        ] as const) {
          const b = await box(control);
          expect(b.y + b.height, `${label} on screen at ${width}, scrolled ${scroll}`).toBeLessThanOrEqual(height);
          await expectUnoccluded(page, control, { label: `${label} at ${width}, scrolled ${scroll}` });
        }
        const s = await box(save);
        const bar = width < 1024 ? page.locator(".shell-tabbar") : page.locator(".legal-footer");
        const under = await box(bar);
        expect(s.y + s.height, `Save above the ${width < 1024 ? "tab bar" : "footer"} at ${width}`).toBeLessThanOrEqual(under.y + 0.5);
      }
    }
  });

  test("« Annuler »: a clean editor goes to the list; a dirty one is stopped by the guard", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/templates/${UPPER_LOWER}`);
    const cancel = page.getByRole("region", { name: "Enregistrer le modèle" }).getByRole("link", { name: "Annuler" });
    await cancel.click();
    await page.waitForURL("/templates");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Modèles d'entraînement");

    await page.goto(`/templates/${UPPER_LOWER}`);
    await expect(async () => {
      await page.getByLabel("Nom du modèle", { exact: true }).fill("Changed");
      await expect(page.getByText("Modifications non enregistrées", { exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass();
    await cancel.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(300);
    expect(new URL(page.url()).pathname).toBe(`/templates/${UPPER_LOWER}`);
  });

  test("the refusal: one h1, the shared back link, the notice", async ({ page }) => {
    await signInFrench(page);
    await page.goto(`/templates/${NOT_A_TEMPLATE}`);
    await expect(page.locator("h1")).toHaveText("Modifier le modèle");
    await expect(page.getByText("Ce modèle ne fait pas partie de votre bibliothèque.", { exact: true })).toBeVisible();
    await expect(page.locator("a.back-link")).toHaveAttribute("href", "/templates");
  });
});

test.describe("English (en-US)", () => {
  test.use({ locale: "en-US" });

  test("English: the same list, in English", async ({ page }) => {
    await signIn(page);
    await page.goto("/templates");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Training templates");
    await expect(page.getByText("3 templates · 47 of 50 left", { exact: true })).toBeVisible();
    const upper = row(page, SEEDED[0]);
    await expect(upper.getByRole("button", { name: "Use on a trainee" })).toBeVisible();
    await openMore(page, SEEDED[0], "More actions");
    for (const name of ["Duplicate", "Rename", "Delete"]) await expect(upper.getByRole("button", { name })).toBeVisible();
  });

  test("English: the same card, and Save is enabled exactly when every line is met", async ({ page }) => {
    await signIn(page);
    await page.goto("/templates/new");
    const aside = page.getByRole("complementary", { name: "Before you save" });
    await expect(aside.getByRole("listitem")).toHaveText([
      "Give the template a name.",
      "Between 2 and 6 training days",
      "Day 1 has no exercises",
      "Day 2 has no exercises",
    ]);
    await page.getByLabel("Template name").fill("Full body A");
    await addExercises(page, 0, 1);
    await expect(aside.getByRole("listitem")).toHaveText(["Name filled in", "Between 2 and 6 training days", "Day 2 has no exercises"]);
    await expect(page.getByRole("button", { name: "Save template" })).toBeDisabled();
    await addExercises(page, 1, 1);
    await expect(aside.getByRole("listitem")).toHaveText([
      "Name filled in",
      "Between 2 and 6 training days",
      "Every day has at least one exercise",
    ]);
    await expect(page.getByRole("button", { name: "Save template" })).toBeEnabled();
  });

});

test.describe("X3", () => {
  test.use({ locale: "fr-FR" });
  test("X3 — every link and button on the three routes is a 44 px target at 390 px", async ({ page }) => {
    await signInFrench(page);
    await page.setViewportSize({ width: 390, height: 900 });
    for (const path of ["/templates", "/templates/new", `/templates/${UPPER_LOWER}`]) {
      await page.goto(path);
      if (path === "/templates") await openMore(page, SEEDED[0], "Plus d'actions");
      const small = await page
        .locator("main a, main button, nav a")
        .evaluateAll((els) =>
          els
            .map((el) => {
              const r = el.getBoundingClientRect();
              return { what: (el.textContent || el.getAttribute("aria-label") || "?").trim().slice(0, 40), w: r.width, h: r.height };
            })
            .filter((c) => c.w > 0 && c.h > 0 && (c.w < 44 || c.h < 44))
        );
      expect(small, path).toEqual([]);
    }
  });
});

/** Add `count` exercises to day `dayIndex` through the catalogue picker (English editor). */
async function addExercises(page: Page, dayIndex: number, count: number) {
  await page
    .getByRole("group", { name: `Day ${dayIndex + 1}`, exact: true })
    .getByRole("button", { name: "Add exercise" })
    .click();
  const dialog = page.getByRole("dialog");
  for (let i = 0; i < count; i += 1) await dialog.locator("button[title]").nth(i).click();
  await dialog.getByRole("button").first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
