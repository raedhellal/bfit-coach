import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { holdNextAction } from "./hold-action";

/**
 * Coach-portal fluidity batch 1, F1 — what the meal-week card says while one of its
 * actions runs. In **fixture mode** (see playwright.config.ts).
 *
 * The defect (d717e57): every action on `NutritionWeekCard` shared ONE `pending`, and the
 * header button rendered `pending ? « Application… » : « Appliquer à … »`. So a day
 * regenerate, a swap's options load and a swap's apply each turned the header into
 * « Application… » / "Applying…": the card announced a whole-week apply the coach had not
 * started. And `nutrition.regenerating` (« Régénération… ») was rendered nowhere, so the
 * day being regenerated said nothing.
 *
 * Now: « Régénération… » and `aria-busy` on the regenerating day only, « Application… »
 * only while the week is being applied. The other controls stay disabled while anything
 * runs (router actions run one at a time), which this file does not change.
 *
 * How the wait is made: the browser's server-action POST is HELD by `page.route` until
 * the test releases it, so every assertion below is made while the action is provably in
 * flight — no latency guess, no race with a fast fixture. "Never" is recorded by a
 * MutationObserver installed before the click, not sampled: it reports the text of every
 * button whose text ever was the applying label, through the release and the action's
 * re-render.
 *
 * Every label is a literal, never imported from `copy.ts`.
 */

const COACH = "coach@evoli.fit";
const PASSWORD = "Password123!";
/** Targets + a current week; placement flag on. */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** The one trainee the placement flag is off for: the flag-off Swap sheet loads options. */
const PIA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0018";

const L = {
  en: {
    locale: "en-US",
    applyLina: "Apply to Lina M.",
    applyPia: "Apply to Pia O.",
    applyConfirm: "Apply",
    applying: "Applying…",
    regenerate: "Regenerate day",
    regenerating: "Regenerating…",
    regenerateWednesday: "Regenerate day: Wednesday",
    regeneratingWednesday: "Regenerating…: Wednesday",
    regenerateAny: /^Regenerate day: /,
    regeneratingAny: /^Regenerating…/,
    swapPrefix: /^Swap meal: /,
    swapLoading: "Loading options…",
  },
  fr: {
    locale: "fr-FR",
    applyLina: "Appliquer à Lina M.",
    applyPia: "Appliquer à Pia O.",
    applyConfirm: "Appliquer",
    applying: "Application…",
    regenerate: "Régénérer le jour",
    regenerating: "Régénération…",
    // U+00A0 before the colon (`common.labelled`, BUG-462).
    regenerateWednesday: "Régénérer le jour : Mercredi",
    regeneratingWednesday: "Régénération… : Mercredi",
    regenerateAny: /^Régénérer le jour\s: /,
    regeneratingAny: /^Régénération…/,
    swapPrefix: /^Remplacer le repas\s: /,
    swapLoading: "Chargement des options…",
  },
} as const;
type Lang = keyof typeof L;

async function signIn(page: Page, lang: Lang) {
  await signInThroughForm(page, { email: COACH, password: PASSWORD, lang });
}

/**
 * From now on, every text a `<button>` takes that equals `label` is recorded on the node
 * side, so a flash between two reads cannot escape. Returns the live list.
 */
async function recordButtonLabel(page: Page, label: string): Promise<string[]> {
  const seen: string[] = [];
  await page.exposeFunction("__f1Saw", (text: string) => void seen.push(text));
  await page.evaluate((label) => {
    const report = (window as unknown as { __f1Saw: (t: string) => void }).__f1Saw;
    const scan = () => {
      for (const b of Array.from(document.querySelectorAll("button"))) {
        if (b.textContent?.trim() === label) report(`${b.textContent.trim()} (${b.getAttribute("aria-label") ?? "no aria-label"})`);
      }
    };
    scan();
    new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, characterData: true });
  }, label);
  return seen;
}

/** Buttons by their visible text, wherever they are (a dialog may hide the rest from the a11y tree). */
function buttonWithText(page: Page, text: string | RegExp) {
  return page.locator("button", { hasText: typeof text === "string" ? new RegExp(`^${escape(text)}$`) : text });
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Retried until the island answers: a click before hydration is a no-op. */
async function openDialog(page: Page, trigger: ReturnType<Page["getByRole"]>) {
  const dialog = page.getByRole("dialog");
  await expect(async () => {
    await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  return dialog;
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`${lang.toUpperCase()}`, () => {
    test.use({ locale: L[lang].locale });
    const l = L[lang];

    test("a day regenerate says so on that day only, and the Apply button keeps its name", async ({ page }) => {
      await signIn(page, lang);
      expect((await page.goto(`/clients/${LINA}/nutrition`))?.status()).toBe(200);
      const wednesday = page.getByRole("button", { name: l.regenerateWednesday, exact: true });
      await expect(wednesday).toBeEnabled();
      await expect(page.getByRole("button", { name: l.regenerateAny })).toHaveCount(7);
      const sawApplying = await recordButtonLabel(page, l.applying);

      const hold = await holdNextAction(page);
      await wednesday.click();
      await hold.reached;

      // The header: still the week's apply, never « Application… ».
      await expect(buttonWithText(page, l.applyLina)).toHaveCount(1);
      await expect(buttonWithText(page, l.applying)).toHaveCount(0);
      // The day being regenerated says so, by its visible text and its accessible name…
      const busyDay = page.getByRole("button", { name: l.regeneratingWednesday, exact: true });
      await expect(busyDay).toHaveText(l.regenerating);
      await expect(busyDay).toBeDisabled();
      // …and it is the only one.
      await expect(page.getByRole("button", { name: l.regeneratingAny })).toHaveCount(1);
      await expect(page.getByRole("button", { name: l.regenerateAny })).toHaveCount(6);
      // `aria-busy` on that day's block alone, and the block is Wednesday's.
      const busy = page.locator("main [aria-busy='true']");
      await expect(busy).toHaveCount(1);
      await expect(busy.getByRole("button", { name: l.regeneratingWednesday, exact: true })).toHaveCount(1);
      await expect(busy.getByRole("group")).not.toHaveCount(0);

      hold.release();
      await expect(page.getByRole("button", { name: l.regenerateWednesday, exact: true })).toBeEnabled();
      await expect(page.getByRole("button", { name: l.regeneratingAny })).toHaveCount(0);
      await expect(page.locator("main [aria-busy='true']")).toHaveCount(0);
      await expect(buttonWithText(page, l.applyLina)).toHaveCount(1);
      expect(sawApplying, "the header never said « applying » during a regenerate").toEqual([]);
    });

    test("applying the week says « applying » on the header, and no day says it is regenerating", async ({ page }) => {
      await signIn(page, lang);
      expect((await page.goto(`/clients/${LINA}/nutrition`))?.status()).toBe(200);
      const dialog = await openDialog(page, page.getByRole("button", { name: l.applyLina, exact: true }));
      const hold = await holdNextAction(page);
      await dialog.getByRole("button", { name: l.applyConfirm, exact: true }).click();
      await hold.reached;

      // The control: the label this file guards against elsewhere is right HERE.
      await expect(buttonWithText(page, l.applying)).toHaveCount(1);
      await expect(buttonWithText(page, l.regenerating)).toHaveCount(0);
      await expect(page.locator("main [aria-busy='true']")).toHaveCount(0);

      hold.release();
      await expect(dialog).toBeHidden();
      await expect(buttonWithText(page, l.applyLina)).toHaveCount(1);
      await expect(buttonWithText(page, l.applying)).toHaveCount(0);
    });
  });
}

test.describe("swaps (flag-off sheet)", () => {
  const l = L.en;

  test("loading a swap's options never turns the header into « Applying… »", async ({ page }) => {
    await signIn(page, "en");
    expect((await page.goto(`/clients/${PIA}/nutrition`))?.status()).toBe(200);
    await expect(page.getByRole("button", { name: l.applyPia, exact: true })).toBeEnabled();
    const sawApplying = await recordButtonLabel(page, l.applying);

    const hold = await holdNextAction(page);
    const dialog = await openDialog(page, page.getByRole("button", { name: l.swapPrefix }).first());
    await hold.reached;
    await expect(dialog.getByText(l.swapLoading, { exact: true })).toBeVisible();
    await expect(buttonWithText(page, l.applyPia)).toHaveCount(1);
    await expect(buttonWithText(page, l.applying)).toHaveCount(0);
    await expect(buttonWithText(page, l.regenerating)).toHaveCount(0);

    hold.release();
    await expect(dialog.getByRole("button").filter({ hasText: /kcal · / }).first()).toBeVisible();
    await expect(buttonWithText(page, l.applyPia)).toHaveCount(1);
    expect(sawApplying, "the header never said « Applying… » during the options load").toEqual([]);
  });

  test("applying a swap never turns the header into « Applying… »", async ({ page }) => {
    await signIn(page, "en");
    expect((await page.goto(`/clients/${PIA}/nutrition`))?.status()).toBe(200);
    const dialog = await openDialog(page, page.getByRole("button", { name: l.swapPrefix }).first());
    const candidate = dialog.getByRole("button").filter({ hasText: /kcal · / }).first();
    await expect(candidate).toBeVisible();
    const sawApplying = await recordButtonLabel(page, l.applying);

    const hold = await holdNextAction(page);
    await candidate.click();
    await hold.reached;
    await expect(buttonWithText(page, l.applyPia)).toHaveCount(1);
    await expect(buttonWithText(page, l.applying)).toHaveCount(0);

    hold.release();
    await expect(dialog).toBeHidden();
    await expect(buttonWithText(page, l.applyPia)).toHaveCount(1);
    expect(sawApplying, "the header never said « Applying… » during the swap").toEqual([]);
  });
});
