import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-838 and BUG-840 (QA-1 and QA-3 of BUG-171's QA gate) on the nutrition-template library —
 * run by `playwright.roster.config.ts`: the POPULATED scenario is the only one with seeded
 * nutrition templates and a trainee in « Use on a trainee »'s picker. The other sites of both
 * rows, and BUG-839, are in `qa/modal-keyboard.spec.ts` under the main config.
 *
 *   BUG-838 a confirmed « Delete template? »: the Modal restored focus to the row's « Delete »,
 *           then the list refresh removed the row and focus fell to <body>. Focus must be on the
 *           next row's first control 2 s after the confirm, and still there at 13 s (past the
 *           Modal's RESTORE_WAIT_MS).
 *   BUG-840 « Use on a trainee » → pick a trainee → the confirm → Escape: focus went to
 *           « New template » (the confirm's opener, the trainee button, went with the pick
 *           dialog). It must go back to the row's « Use on a trainee », in en and fr.
 *
 * Red on `2b1ed4d` (main, BUG-171 merged): 3 of 3. Green on `fix/bug-838-840-modal-focus-followups`.
 */

type Lang = "en" | "fr";
const LOCALES: Record<Lang, string> = { en: "en-US", fr: "fr-FR" };
const T = <V,>(en: V, fr: V): Record<Lang, V> => ({ en, fr });

/** "inside" the open dialog, "body", or "outside: …". */
async function focusIs(page: Page): Promise<string> {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const a = document.activeElement;
    if (!a || a === document.body) return "body";
    if (dialog && dialog.contains(a) && a !== dialog) return "inside";
    return `outside: <${a.tagName.toLowerCase()}> ${(a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 40)}`;
  });
}

async function where(page: Page): Promise<string> {
  return page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a || a === document.body) return "BODY";
    return `<${a.tagName.toLowerCase()}> ${(a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 50)}`;
  });
}

/** Focus `control` and press Enter — a keyboard user's way in — until `appears` is visible. */
async function pressUntil(page: Page, control: Locator, appears: Locator) {
  await expect(async () => {
    if (!(await appears.isVisible())) {
      await control.focus();
      await page.keyboard.press("Enter");
    }
    await expect(appears).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe("BUG-838 (populated): a confirmed nutrition-template delete leaves focus on the next row", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("Enter on « Delete » in « Delete template? » → the next row's first control, at 2 s and 13 s", async ({ page }) => {
    test.setTimeout(90_000);
    await signInThroughForm(page);
    await page.goto("/nutrition-templates");
    const del = page.getByRole("button", { name: "Delete", exact: true }).first();
    await expect(del).toBeVisible();
    const marked = await del.evaluate((el) => {
      const next = el.closest("li")?.nextElementSibling;
      next?.setAttribute("data-b838", "next");
      return !!next;
    });
    expect(marked, "the deleted row has a row after it").toBe(true);
    const dialog = page.getByRole("dialog", { name: "Delete template?" });
    await pressUntil(page, del, dialog);
    await dialog.getByRole("button", { name: "Delete", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0, { timeout: 20_000 });

    const onNext = () =>
      page.evaluate(() => {
        const first = document
          .querySelector("[data-b838=next]")
          ?.querySelector('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
        return !!first && document.activeElement === first;
      });
    const start = Date.now();
    await page.waitForTimeout(2_000);
    expect(await onNext(), `2 s after the confirm: the next row's first control (focus is on ${await where(page)})`).toBe(true);
    await page.waitForTimeout(Math.max(0, 13_000 - (Date.now() - start)));
    expect(await onNext(), `13 s after the confirm: still there (focus is on ${await where(page)})`).toBe(true);
  });
});

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-840 (${lang}): « Use on a trainee » → pick → confirm → Escape`, () => {
    test.use({ viewport: { width: 1440, height: 900 }, locale: LOCALES[lang] });

    test("focus returns to the 3rd row's « Use on a trainee », not « New template »", async ({ page }) => {
      const use = T("Use on a trainee", "Utiliser pour un client")[lang];
      await signInThroughForm(page, { lang });
      await page.goto("/nutrition-templates");
      const opener = page.getByRole("button", { name: use, exact: true }).nth(2);
      const dialog = page.getByRole("dialog");
      await pressUntil(page, opener, dialog);
      await expect(dialog).toHaveAccessibleName(use);
      const lina = dialog.getByRole("button", { name: "Lina M.", exact: true });
      await expect(lina).toBeVisible({ timeout: 15_000 });
      await lina.focus();
      await page.keyboard.press("Enter");
      await expect(dialog).not.toHaveAccessibleName(use);
      await expect.poll(() => focusIs(page), { message: "focus moved into the confirm dialog" }).toBe("inside");
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(opener, `back on the row's « ${use} » that started the flow (focus is on ${await where(page)})`).toBeFocused();
    });
  });
}
