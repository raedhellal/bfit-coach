import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoSidewaysScroll } from "./layout";

/**
 * BUG-380 — the sign-in and activation screens drop the brand panel below 768 px.
 *
 * `globals.css` hides `.login-brand` under `@media (max-width: 767px)`, but both pages set
 * `display: "flex"` on the same element as an INLINE style, and an inline declaration
 * beats any stylesheet rule without `!important`. So the rule was loaded and never won:
 * at 320 px the panel kept 96 px and the form was 224 px wide (279 at 375), with a
 * clipped logo and a sliced tagline beside it.
 *
 * `toBeVisible()`/`toBeHidden()` alone would not be enough to pin this: the geometry is
 * the defect, so every narrow width also measures the form column against the viewport
 * and the text field against the column. The wide widths pin the desktop split.
 *
 * EV-337k (the redesign of these screens, plan §5.10) changed two things here, on purpose:
 *   · /login's split is now two halves as drawn at 1440, the form column never under
 *     480 px — so 480 at 768 (unchanged) and half the viewport from 960 (640 at 1280);
 *   · /activate is no longer a split at all: the design draws one card on the page
 *     background. Its BUG-380 question ("is the form squeezed at 320?") is asked of the
 *     card instead, in the last describe below.
 */

const NARROW = [320, 375, 767] as const;
const WIDE = [768, 1280, 1440] as const;
/** `.login-form { flex: 1 1 50%; min-width: 480px }` beside the brand panel from 768 px. */
const FORM_COLUMN_MIN = 480;
/** The form column's own horizontal padding, `.login-form` below 768. */
const COLUMN_PADDING = 24;

async function openLogin(page: Page) {
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toBeVisible();
  return page.getByLabel("Email");
}

async function openActivate(page: Page): Promise<Locator> {
  await page.goto("/login");
  await page.getByLabel("Email").fill("new.coach@evoli.fit");
  await page.getByLabel("Password").fill("Temp-pass-2026");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/activate$/);
  await expect(page.getByLabel("Temporary password")).toBeVisible();
  return page.getByLabel("Temporary password");
}

const SCREENS = [
  // The form's own max width: `.login-form-inner` (360).
  { name: "/login", open: openLogin, formMax: 360 },
] as const;

async function geometry(page: Page) {
  return page.evaluate(() => {
    const brand = document.querySelector(".login-brand");
    const column = document.querySelector(".login-form");
    if (!brand || !column) throw new Error("the split layout is not on the page");
    const b = getComputedStyle(brand);
    return {
      viewport: document.documentElement.clientWidth,
      brandDisplay: b.display,
      brandWidth: brand.getBoundingClientRect().width,
      brandFlexDirection: b.flexDirection,
      brandJustify: b.justifyContent,
      brandPadding: b.padding,
      brandOverflow: b.overflow,
      brandPosition: b.position,
      brandColor: b.color,
      brandBackground: b.backgroundImage,
      columnWidth: column.getBoundingClientRect().width,
    };
  });
}

for (const screen of SCREENS) {
  test.describe(`BUG-380 — ${screen.name} at narrow and wide widths`, () => {
    for (const width of NARROW) {
      test(`${width}px: the brand panel is not rendered and the form takes the whole width`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        const field = await screen.open(page);
        const g = await geometry(page);

        expect(g.brandDisplay, "the ≤767 px rule must win over the panel's own display").toBe("none");
        expect(g.brandWidth).toBe(0);
        await expect(page.locator(".login-brand")).toBeHidden();
        expect(g.columnWidth, "the form column is the whole viewport").toBeCloseTo(g.viewport, 0);

        // The form uses the room it now has: the column minus its padding, up to its own
        // max width. At 320 that is 272 px, against 176 px with the panel shown.
        const formBox = await page.locator("form").boundingBox();
        expect(formBox, "form box").not.toBeNull();
        const expected = Math.min(screen.formMax, g.viewport - 2 * COLUMN_PADDING);
        expect(formBox!.width, `form width at ${width}px`).toBeCloseTo(expected, 0);
        // And the field fills the form, inside the viewport.
        const box = await field.boundingBox();
        expect(box, "field box").not.toBeNull();
        expect(box!.x, "field starts inside the form").toBeGreaterThanOrEqual(formBox!.x);
        expect(box!.x + box!.width, "field ends inside the form").toBeLessThanOrEqual(formBox!.x + formBox!.width + 0.5);
        expect(box!.width, `field width at ${width}px`).toBeGreaterThan(formBox!.width * 0.75);

        await expectNoSidewaysScroll(page, `${screen.name} at ${width}px`);
      });
    }

    for (const width of WIDE) {
      test(`${width}px: the desktop split is unchanged — brand panel beside a 480 px form`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await screen.open(page);
        const g = await geometry(page);

        expect(g.brandDisplay).toBe("flex");
        const column = Math.max(FORM_COLUMN_MIN, g.viewport / 2);
        expect(g.columnWidth).toBeCloseTo(column, 0);
        expect(g.brandWidth).toBeCloseTo(g.viewport - column, 0);
        // What the inline style used to carry, now from the stylesheet.
        expect(g.brandFlexDirection).toBe("column");
        expect(g.brandJustify).toBe("space-between");
        expect(g.brandPadding).toBe("48px");
        expect(g.brandOverflow).toBe("hidden");
        expect(g.brandPosition).toBe("relative");
        expect(g.brandColor).toBe("rgb(255, 255, 255)");
        expect(g.brandBackground).toContain("linear-gradient");
        await expect(page.locator(".login-brand").getByText("Evoli Pro", { exact: true })).toBeVisible();
        await expectNoSidewaysScroll(page, `${screen.name} at ${width}px`);
      });
    }
  });
}

/**
 * EV-337k — /activate is one card (max 440 px) centred on the page, 16 px from each edge
 * below 768 px, with 24 px of padding inside below 768 and 40 px from 768. The BUG-380
 * question, asked of the card: at 320 the form is the card's whole inner width, never a
 * column squeezed beside something.
 */
test.describe("EV-337k — /activate is a centred card at every width", () => {
  const CARD_MAX = 440;
  for (const width of [...NARROW, ...WIDE]) {
    test(`${width}px: the card is centred, and the form fills it`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      const field = await openActivate(page);
      await expect(page.locator(".login-brand")).toHaveCount(0);
      const viewport = await page.evaluate(() => document.documentElement.clientWidth);
      const card = (await page.locator(".auth-card").boundingBox())!;
      const expectedCard = Math.min(CARD_MAX, viewport - 2 * 16);
      expect(card.width, `card width at ${width}px`).toBeCloseTo(expectedCard, 0);
      expect(Math.abs(card.x + card.width / 2 - viewport / 2), "the card is centred").toBeLessThanOrEqual(1);
      const pad = width < 768 ? 24 : 40;
      const form = (await page.locator("form").boundingBox())!;
      expect(form.width, `form width at ${width}px`).toBeCloseTo(card.width - 2 - 2 * pad, 0);
      const box = (await field.boundingBox())!;
      expect(box.width, `field width at ${width}px`).toBeGreaterThan(form.width * 0.75);
      await expectNoSidewaysScroll(page, `/activate at ${width}px`);
    });
  }
});
