import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { contrast, decodePng, hex, hue, type Rgb } from "./png";

/**
 * BUG-602 (WCAG 1.4.3) — a white button label reaches 4.5:1 on its fill, in every state
 * the coach can put the button in: at rest, hovered and keyboard-focused.
 *
 * Measured on the SCREEN, not the stylesheet: the label (and its icon) is made transparent
 * for the photograph, the button is photographed, and the LIGHTEST fill pixel is held
 * against white. A gradient's light end, a hover `filter: brightness()` and a fill painted
 * under an overlay are all read as painted. The rounded corners are left out (they blend
 * with the page behind them), and so is the 2 px edge band (antialiasing).
 *
 * The corner inset and the edge band are in CSS px and the screenshot is read as if one
 * pixel were one CSS px: that holds at a device pixel ratio of 1 (the config's Desktop
 * Chrome), and `lightestFill` checks it. At DPR 2 the inset would cover half the corner
 * and the blended corner pixels would read as a lighter fill (a false red, never a false
 * green).
 *
 * Covered: the kit Button's three filled variants; the `.link-button` primary (its hover
 * `filter: brightness(1.05)`); the invite page's « Ouvrir dans Evoli Fit », which paints
 * its own inline fill rather than a kit variant; and the login brand panel's body text,
 * which is not a button but is white on the same gradient UNDER the panel's `::before`
 * highlight (read at rest: it has no other state).
 *
 * Red at 6caecb8: the kit's danger variant was white on `--red-500` #EF4444, 3.76:1 in all
 * three states (the delete dialog's « Delete »). Primary and gradient were already on
 * `--grad-energy-strong` there (5.37:1 at their light end) and stay pinned here.
 *
 * The danger fill must stay RED (the design's hue family): its hue is checked too, so a
 * "fix" that repaints it in the primary's blue does not pass.
 */

const MIN = 4.5;
const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

const PROBE = "data-label-contrast-probe";

async function lightestFill(page: Page, button: Locator): Promise<{ ratio: number; rgb: Rgb }> {
  await button.evaluate((el, attr) => el.setAttribute(attr, ""), PROBE);
  const style = await page.addStyleTag({
    content: `[${PROBE}], [${PROBE}] * { color: transparent !important; } [${PROBE}] svg { visibility: hidden !important; }`,
  });
  try {
    expect(await page.evaluate(() => devicePixelRatio), "the pixel reading assumes DPR 1").toBe(1);
    const radius = await button.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
    const png = decodePng(await button.screenshot({ animations: "disabled" }));
    // A pill's declared radius (`--r-pill`, 999px) is drawn at half the shorter side.
    const inset = Math.ceil(Math.min(radius, png.width / 2, png.height / 2)) + 1;
    let worst: { ratio: number; rgb: Rgb } | null = null;
    for (let y = 2; y < png.height - 2; y++) {
      for (let x = inset; x < png.width - inset; x++) {
        const i = (y * png.width + x) * 4;
        const rgb: Rgb = [png.rgba[i], png.rgba[i + 1], png.rgba[i + 2]];
        const ratio = contrast(rgb, [255, 255, 255]);
        if (!worst || ratio < worst.ratio) worst = { ratio, rgb };
      }
    }
    expect(worst, "photographed some fill").not.toBeNull();
    return worst!;
  } finally {
    await style.evaluate((el) => (el as Element).remove());
    await button.evaluate((el, attr) => el.removeAttribute(attr), PROBE);
  }
}

/** The three states, each photographed; returns the fill read in each. */
async function inEachState(page: Page, button: Locator, name: string) {
  await expect(button).toBeEnabled();
  // The label really is white (that is what the fill is measured against).
  expect(await button.evaluate((el) => getComputedStyle(el).color), `${name}: label colour`).toBe("rgb(255, 255, 255)");
  const out: Record<"rest" | "hover" | "focus", { ratio: number; rgb: Rgb }> = {} as never;
  await page.mouse.move(0, 0);
  out.rest = await lightestFill(page, button);
  await button.hover();
  await expect.poll(() => button.evaluate((el) => el.matches(":hover"))).toBe(true);
  out.hover = await lightestFill(page, button);
  await page.mouse.move(0, 0);
  await page.keyboard.press("Shift");
  await button.focus();
  await expect.poll(() => button.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  out.focus = await lightestFill(page, button);
  for (const [state, { ratio, rgb }] of Object.entries(out)) {
    expect(ratio, `${name}, ${state}: white on ${hex(rgb)} reads ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN);
  }
  return out;
}

test.describe("BUG-602 — white labels on filled buttons reach 4.5:1", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("gradient: « Sign in » on the login form", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/login");
    // Enabled only once React holds both fields (see qa/sign-in.ts).
    const email = page.getByLabel("Email");
    const password = page.getByLabel("Password");
    const submit = page.getByRole("button", { name: "Sign in" });
    await expect(async () => {
      await email.fill("");
      await email.fill(EMAIL);
      await password.fill("");
      await password.fill(PASSWORD);
      await expect(submit).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    await inEachState(page, submit, "Sign in");

    // The brand panel's body text: white on --grad-energy-strong under the panel's
    // `::before` highlight (globals.css `.login-brand-body`). Probe at 64bd211: 5.79:1.
    const body = page.locator(".login-brand-body");
    await expect(body).toBeVisible();
    expect(await body.evaluate((el) => getComputedStyle(el).color), "brand body: text colour").toBe("rgb(255, 255, 255)");
    const { ratio, rgb } = await lightestFill(page, body);
    expect(ratio, `brand body: white on ${hex(rgb)} reads ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(MIN);
  });

  test("primary: « New recipe » (kit Button) and « New template » (link-button, hover filter)", async ({ page }) => {
    await signInThroughForm(page, { email: EMAIL, password: PASSWORD });
    await page.goto("/recipes");
    await inEachState(page, page.getByRole("button", { name: "New recipe" }).first(), "New recipe");
    await page.goto("/templates");
    await inEachState(page, page.getByRole("link", { name: "New template" }).first(), "New template");
  });

  test("danger: « Delete » in the delete-recipe dialog, and it stays red", async ({ page }) => {
    await signInThroughForm(page, { email: EMAIL, password: PASSWORD });
    await page.goto("/recipes");
    await page.getByRole("button", { name: "Delete" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Delete recipe?" });
    await expect(dialog).toBeVisible();
    const fills = await inEachState(page, dialog.getByRole("button", { name: "Delete", exact: true }), "Delete");
    for (const [state, { rgb }] of Object.entries(fills)) {
      const h = hue(rgb);
      expect(h <= 15 || h >= 345, `danger, ${state}: ${hex(rgb)} (hue ${h.toFixed(0)}°) is still a red`).toBe(true);
    }
  });
});

/**
 * The invite landing's primary link sets its OWN inline fill (`src/app/i/[token]/page.tsx`),
 * so the kit's variants say nothing about it. French, as the row names it: « Ouvrir dans
 * Evoli Fit ». The page needs no session.
 */
test.describe("BUG-602 — the invite page's primary link, in a French browser (fr-FR)", () => {
  test.use({ locale: "fr-FR", viewport: { width: 1440, height: 900 } });

  test("gradient: « Ouvrir dans Evoli Fit » on /i/<token>", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/i/abc");
    await inEachState(page, page.getByRole("link", { name: "Ouvrir dans Evoli Fit", exact: true }), "Ouvrir dans Evoli Fit");
  });
});
