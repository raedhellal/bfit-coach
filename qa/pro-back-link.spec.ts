import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { signInFrench } from "./french";

/**
 * BUG-660 (fixed by EV-337e, redesign §4 `BackLink`) — the "back to …" link of the ten
 * detail routes is a 44 × 44 px target with a keyboard focus ring, in both languages, and
 * its text and destination are what they were.
 *
 * Before: every page drew its own `<Link style={{ fontSize: 13 }}>`, a 16 px line of text
 * (« Retour aux clients » 129.6 × 16 at 390 px, qapro1 PB-3). Red on 08f6e90 on all ten
 * routes for the height; green with `src/components/ui/BackLink.tsx`.
 *
 * Fixture ids: Lina (every scope), the seeded "Upper / Lower" template and "Chicken rice
 * bowl" recipe. The challenge and the nutrition template are ids the coach does not hold:
 * the default suite runs the EMPTY roster scenario, so no challenge or nutrition template
 * is seeded, and both pages still draw their back link above the "not yours" notice.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const UPPER_LOWER = "7c2d0a11-0000-4000-8000-0000000000b1";
const CHICKEN_RICE_BOWL = "8e3f1b22-0000-4000-8000-0000000000c1";
const NOT_A_CHALLENGE = "00000000-0000-4000-8000-000000000000";
const NOT_A_NUTRITION_TEMPLATE = "00000000-0000-4000-8000-0000000000d9";
const FLOOR = 44;
const WIDTHS = [320, 390, 768, 1024, 1440] as const;

type Row = { route: string; href: string; en: string; fr: string };

const ROUTES: Row[] = [
  { route: `/clients/${LINA}`, href: "/", en: "Back to roster", fr: "Retour aux clients" },
  { route: `/clients/${LINA}/routine`, href: "/", en: "Back to roster", fr: "Retour aux clients" },
  { route: `/clients/${LINA}/nutrition`, href: "/", en: "Back to roster", fr: "Retour aux clients" },
  { route: `/challenges/${NOT_A_CHALLENGE}`, href: "/challenges", en: "Back to challenges", fr: "Retour aux défis" },
  { route: "/templates/new", href: "/templates", en: "Back to templates", fr: "Retour aux modèles" },
  { route: `/templates/${UPPER_LOWER}`, href: "/templates", en: "Back to templates", fr: "Retour aux modèles" },
  { route: "/recipes/new", href: "/recipes", en: "Back to recipes", fr: "Retour aux recettes" },
  { route: `/recipes/${CHICKEN_RICE_BOWL}`, href: "/recipes", en: "Back to recipes", fr: "Retour aux recettes" },
  {
    route: "/nutrition-templates/new",
    href: "/nutrition-templates",
    en: "Back to nutrition templates",
    fr: "Retour aux modèles nutrition",
  },
  {
    route: `/nutrition-templates/${NOT_A_NUTRITION_TEMPLATE}`,
    href: "/nutrition-templates",
    en: "Back to nutrition templates",
    fr: "Retour aux modèles nutrition",
  },
];

async function signIn(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
}

/**
 * The page's back link: in `main`, by its exact name, and NOT the notice's "back" button
 * (`ClientNotice` wraps a `<Button>` in a link with the same words on the two "not yours"
 * pages). Exactly one must remain, so a page that drew two would fail here by count.
 */
function backLink(page: Page, name: string): Locator {
  return page
    .getByRole("main")
    .getByRole("link", { name, exact: true })
    .filter({ hasNot: page.locator("button") });
}

async function expectTarget(page: Page, link: Locator, where: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const box = await link.boundingBox();
    expect(box, `${where}: the back link has a box at ${width}px`).not.toBeNull();
    // Soft: one red route must not hide the other nine (each was 16 px on 08f6e90).
    expect.soft(box!.height, `${where}: back link height at ${width}px`).toBeGreaterThanOrEqual(FLOOR);
    expect.soft(box!.width, `${where}: back link width at ${width}px`).toBeGreaterThanOrEqual(FLOOR);
    expect(box!.x, `${where}: the back link starts inside the viewport at ${width}px`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `${where}: the back link ends inside the viewport at ${width}px`).toBeLessThanOrEqual(width);
  }
}

for (const [locale, lang] of [
  ["en-US", "en"],
  ["fr-FR", "fr"],
] as const) {
  test.describe(`BUG-660 — the ten back links (${locale})`, () => {
    test.use({ locale });

    test("each is one 44 × 44 px link with its text and destination unchanged", async ({ page }) => {
      if (lang === "fr") await signInFrench(page);
      else await signIn(page);
      for (const row of ROUTES) {
        await page.setViewportSize({ width: 390, height: 900 });
        await page.goto(row.route);
        const name = row[lang];
        const link = backLink(page, name);
        await expect(link, `${row.route}: exactly one back link named « ${name} »`).toHaveCount(1);
        await expect(link).toHaveAttribute("href", row.href);
        await expect(link).toHaveText(name);
        await expectTarget(page, link, row.route);
      }
    });
  });
}

test("the back link shows the keyboard focus ring", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`/clients/${LINA}`);
  const link = backLink(page, "Back to roster");
  await expect(link).toHaveCount(1);
  // Reach it with Tab, the way a keyboard user does, so :focus-visible is the real one.
  let focused = false;
  for (let i = 0; i < 25 && !focused; i += 1) {
    await page.keyboard.press("Tab");
    focused = await link.evaluate((el) => el === document.activeElement);
  }
  expect(focused, "Tab reaches the back link").toBe(true);
  const ring = await link.evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, visible: el.matches(":focus-visible") };
  });
  expect(ring).toEqual({ style: "solid", width: "2px", color: "rgb(79, 124, 255)", visible: true });
});
