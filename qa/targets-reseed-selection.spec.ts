import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { en } from "../src/lib/copy";
import { openTargetsForm, TARGETS_REGION } from "./targets-card";

/**
 * BUG-1070 closes-when 3 — `NutritionTargetsCard`, the other `useCoachForm` form whose save
 * passes a `stored` answer (`form.saved({...})`), so its text CAN differ from what was typed:
 * protein `0150` is stored, and re-seeded, as `150`.
 *
 *   · `markSaved` (T1): it cannot rewrite a FOCUSED field. The save is sent only from the
 *     « Save targets? » dialog (`<Button onClick={save}>` in the `Modal` footer), and while it is
 *     in flight that dialog is open: its backdrop covers the page (`position: fixed; inset: 0`,
 *     `kit.tsx` `Modal`) and Tab is trapped inside it (BUG-171). When the answer lands the card
 *     closes in the same callback (`setEditing(false)` unless a field was typed in, and none can
 *     be), so the re-seeded fields are unmounted, not shown. T1 witnesses each step, so it is
 *     green on `main` and on the fix alike: it is the enforced constraint, not a red-to-green.
 *   · `reseedFromServer` (T2): it can. With the form open and a field selected but not typed in,
 *     a route render carrying other targets (a second tab saved them; the nutrition page's
 *     `NutritionWeekCard` / `SwapSheet` call `router.refresh()`) re-seeds that field under the
 *     coach's selection. Red on `main` (the keystroke is appended), green on the fix.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const t = en.nutrition;

test.use({ locale: "en-US" });

const region = (page: Page) => page.getByRole("region", { name: TARGETS_REGION });
const protein = (page: Page) => region(page).getByRole("textbox", { name: t.protein, exact: true });

type Sel = { v: string; s: number | null; e: number | null; focused: boolean };
const read = (input: Locator): Promise<Sel> =>
  input.evaluate((el: HTMLInputElement) => ({
    v: el.value,
    s: el.selectionStart,
    e: el.selectionEnd,
    focused: document.activeElement === el,
  }));

async function openForm(page: Page) {
  await page.goto(`/clients/${LINA}/nutrition`);
  await openTargetsForm(page);
}

async function saveThroughDialog(page: Page) {
  await region(page).getByRole("button", { name: t.saveTargets, exact: true }).click();
  const confirm = page.getByRole("dialog", { name: t.saveTargetsTitle });
  await confirm.getByRole("button", { name: t.saveTargets, exact: true }).click();
  return confirm;
}

test("T1. markSaved: during « Saving… » the field cannot be reached, and the answer closes the form", async ({
  page,
}) => {
  await signInThroughForm(page, { lang: "en" });
  await openForm(page);
  await page.route(`**/clients/${LINA}/nutrition`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await protein(page).fill("0150");
  const answered = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined
  );
  const confirm = await saveThroughDialog(page);
  await expect(region(page).getByRole("button", { name: t.saving, exact: true })).toBeVisible();

  // A pointer: what is under the field's centre is the dialog's backdrop, not the field.
  const box = (await protein(page).boundingBox())!;
  const hit = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el?.hasAttribute("data-modal-backdrop") ? "backdrop" : el?.getAttribute("aria-label") ?? el?.tagName;
    },
    [box.x + box.width / 2, box.y + box.height / 2]
  );
  expect(hit).toBe("backdrop");
  // A keyboard: Tab stays in the dialog.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await confirm.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await expect(protein(page)).not.toBeFocused();

  await answered;
  // The answer re-seeds `0150` as `150` — into a form that closes in the same callback.
  await expect(page.getByText(t.targetsSaved, { exact: true })).toBeVisible();
  await expect(protein(page)).toHaveCount(0);
  await openTargetsForm(page);
  await expect(protein(page)).toHaveValue("150");
});

test("T2. reseedFromServer: a push re-seeds the selected protein field, and the next keystroke replaces it", async ({
  page,
  context,
}) => {
  await signInThroughForm(page, { lang: "en" });
  await openForm(page);
  const was = await protein(page).inputValue();
  expect(was.length, "Lina has stored protein to select").toBeGreaterThan(0);
  const pushed = String(Number(was) + 7);

  await protein(page).click();
  await page.keyboard.press("Control+A");
  const during = await read(protein(page));
  expect(during).toEqual({ v: was, s: 0, e: was.length, focused: true });

  const other = await context.newPage();
  await openForm(other);
  await protein(other).fill(pushed);
  await saveThroughDialog(other);
  await expect(other.getByText(t.targetsSaved, { exact: true })).toBeVisible();
  await other.close();

  await page.evaluate(() => (window as unknown as { next: { router: { refresh(): void } } }).next.router.refresh());
  await expect(protein(page)).toHaveValue(pushed);
  await page.waitForTimeout(400); // human reaction time
  const afterPush = await read(protein(page));
  await page.keyboard.type("3", { delay: 150 });
  const final = await read(protein(page));
  process.stdout.write(
    `PROBE1070 targets=T2 during=${JSON.stringify(during)} afterPush=${JSON.stringify(afterPush)} final=${JSON.stringify(final)}\n`
  );
  expect(afterPush, "the push's re-seed did not keep the whole-text selection").toEqual({
    v: pushed,
    s: 0,
    e: pushed.length,
    focused: true,
  });
  expect(final.v, "the coach's replacement was appended to the pushed text").toBe("3");
});
