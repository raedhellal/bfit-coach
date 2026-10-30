import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm, type SignInLang } from "./sign-in";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";

/**
 * BUG-1070 — a save's answer re-seeds the field the coach is holding a selection in.
 *
 * On a successful save `useCoachForm` writes the server's canonical text into every field not
 * typed in since the send (`markSaved`; `reseedFromServer` on the prop push does the same). The
 * progress goal's body fat comes back as `seedFields(result.goal)`: `60.00` → `60`, `20,5` →
 * `20.5` on an English page, `20.5` → `20,5` on a French one. Writing a different value into a
 * focused `<input>` collapses its selection, so a coach who selected the whole field during
 * « Saving… » to replace it had their next keystroke APPENDED: `60.00` → `603` (refused),
 * `20,5` → `20.53` (refused) — and `5.0` → `53`, which is in range (3 to 60) and saves.
 *
 * Human pace, every step (the closes-when's protocol): the save is held 1.5 s with `page.route`;
 * the coach fills the value, presses Save, waits for « Saving… », clicks the field and selects
 * all with Control+A, then waits for the answer and for Save to be enabled again, waits 400 ms
 * and types `3` (150 ms per key). Then they save that.
 *
 * The fix keeps the selection across the re-seed: a whole-text selection of the old text is a
 * whole-text selection of the new one, and a caret at the end stays at the end (case f).
 *
 * Fixture mode, default config: each test starts from the seed (`fixture-test`).
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const HOLD_MS = 1500;

type Words = {
  block: string;
  bodyFat: string;
  save: string;
  saving: string;
  saved: string;
  invalid: string;
  unsaved: string;
  leave: string;
};
const W: Record<SignInLang, Words> = {
  en: {
    block: en.progressGoal.title,
    bodyFat: en.progressGoal.bodyFatMilestoneLabel,
    save: en.progressGoal.save,
    saving: en.progressGoal.saving,
    saved: en.progressGoal.saved,
    invalid: en.progressGoal.invalidBodyFat,
    unsaved: en.routine.unsavedBadge,
    leave: en.routine.leaveTitle,
  },
  fr: {
    block: fr.progressGoal.title,
    bodyFat: fr.progressGoal.bodyFatMilestoneLabel,
    save: fr.progressGoal.save,
    saving: fr.progressGoal.saving,
    saved: fr.progressGoal.saved,
    invalid: fr.progressGoal.invalidBodyFat,
    unsaved: fr.routine.unsavedBadge,
    leave: fr.routine.leaveTitle,
  },
};

const block = (page: Page, w: Words) => page.getByRole("region", { name: w.block });
const field = (page: Page, w: Words) => block(page, w).getByLabel(w.bodyFat, { exact: true });
const saveButton = (page: Page, w: Words) => block(page, w).getByRole("button", { name: w.save, exact: true });

type Sel = { v: string; s: number | null; e: number | null; focused: boolean };
const read = (input: Locator): Promise<Sel> =>
  input.evaluate((el: HTMLInputElement) => ({
    v: el.value,
    s: el.selectionStart,
    e: el.selectionEnd,
    focused: document.activeElement === el,
  }));

/** The body of every progress-goal save the BROWSER sends (a server action: `[clientId, body]`). */
function recordSaves(page: Page): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || request.headers()["next-action"] === undefined) return;
    if (!page.url().includes("/clients/")) return;
    const args = JSON.parse(request.postData() ?? "[]") as unknown[];
    bodies.push((args[1] ?? {}) as Record<string, unknown>);
  });
  return bodies;
}

const actionAnswer = (page: Page) =>
  page.waitForResponse((r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined);

async function open(page: Page, lang: SignInLang) {
  await signInThroughForm(page, { lang });
  // From a page of its own, so Back has somewhere to go (case a's leave check).
  await page.goto("/");
  await page.goto(`/clients/${LINA}`);
  await page.route(`**/clients/${LINA}`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((r) => setTimeout(r, HOLD_MS));
    await route.continue();
  });
}

/**
 * Fill `typed`, Save, and while « Saving… » shows put the coach's selection in the field
 * (`select`). Returns once the answer has landed, Save is enabled again and 400 ms have passed.
 */
async function saveAndSelectDuring(page: Page, w: Words, typed: string, select: () => Promise<void>) {
  await field(page, w).fill(typed);
  const answered = actionAnswer(page);
  await saveButton(page, w).click();
  await expect(block(page, w).getByRole("button", { name: w.saving, exact: true })).toBeVisible();
  await field(page, w).click();
  await select();
  const during = await read(field(page, w));
  await answered;
  await expect(saveButton(page, w)).toBeEnabled();
  await page.waitForTimeout(400); // human reaction time
  return { during, afterAnswer: await read(field(page, w)) };
}

/**
 * Press Save on what the field now reads, and report what happened: the body-fat value sent,
 * or that the browser refused it (no request). Bounded either way: a refusal sends nothing.
 */
async function saveWhatIsShown(page: Page, w: Words, sent: Record<string, unknown>[]) {
  const before = sent.length;
  const answered = actionAnswer(page);
  await saveButton(page, w).click();
  const invalid = block(page, w).getByText(w.invalid, { exact: true });
  await expect.poll(async () => sent.length > before || (await invalid.isVisible()), { timeout: 10_000 }).toBe(true);
  if (sent.length === before) return { refused: true as const, wire: undefined };
  await answered;
  await expect(saveButton(page, w)).toBeEnabled();
  return { refused: false as const, wire: sent.at(-1)?.milestoneBodyFatPct };
}

const CASES = [
  { id: "a", lang: "en", typed: "60.00", reseeded: "60" },
  { id: "b", lang: "en", typed: "20,5", reseeded: "20.5" },
  // The P2 trigger: on the re-seed `5.0` becomes `5`, and an appended `3` is `53`, in range.
  { id: "c", lang: "en", typed: "5.0", reseeded: "5" },
  { id: "d", lang: "fr", typed: "20.5", reseeded: "20,5" },
  // The control: already canonical, so the re-seed writes nothing and the selection stands.
  { id: "e", lang: "en", typed: "20.5", reseeded: "20.5" },
] as const;

for (const c of CASES) {
  const w = W[c.lang];
  test.describe(`BUG-1070 (${c.lang.toUpperCase()})`, () => {
    test.use({ locale: c.lang === "en" ? "en-US" : "fr-FR" });

    test(`${c.id}. select-all during « Saving… » of ${c.typed}: the next keystroke replaces the re-seeded ${c.reseeded}`, async ({
      page,
    }) => {
      await open(page, c.lang);
      const sent = recordSaves(page);

      const { during, afterAnswer } = await saveAndSelectDuring(page, w, c.typed, () =>
        page.keyboard.press("Control+A")
      );
      expect(during, "the select-all did not take during « Saving… »").toEqual({
        v: c.typed,
        s: 0,
        e: c.typed.length,
        focused: true,
      });
      expect(sent.at(-1)?.milestoneBodyFatPct).toBe(Number(c.typed.replace(",", ".")));
      await expect(block(page, w).getByText(w.saved, { exact: true })).toBeVisible();

      await page.keyboard.type("3", { delay: 150 });
      const final = await read(field(page, w));
      const next = await saveWhatIsShown(page, w, sent);
      process.stdout.write(
        `PROBE1070 case=${c.id} lang=${c.lang} typed=${JSON.stringify(c.typed)} during=${JSON.stringify(during)} ` +
          `afterAnswer=${JSON.stringify(afterAnswer)} final=${JSON.stringify(final)} ` +
          `nextSave=${next.refused ? "REFUSED-in-browser" : `sent ${JSON.stringify(next.wire)}`}\n`
      );

      expect(afterAnswer, "the re-seed did not keep the whole-text selection").toEqual({
        v: c.reseeded,
        s: 0,
        e: c.reseeded.length,
        focused: true,
      });
      expect(final.v, "the coach's replacement was appended to the re-seeded text").toBe("3");
      expect(next, "the replacement did not travel as 3").toEqual({ refused: false, wire: 3 });
      await expect(block(page, w).getByText(w.saved, { exact: true })).toBeVisible();
      await expect(block(page, w).getByText(w.invalid)).toHaveCount(0);

      if (c.id === "a") {
        // Closes-when 6: blurred, the field reads the server's text, nothing reads as unsaved,
        // and Back leaves with no question.
        await page.keyboard.press("Tab");
        await expect(field(page, w)).not.toBeFocused();
        await expect(field(page, w)).toHaveValue("3");
        await expect(page.getByText(w.unsaved)).toHaveCount(0);
        await page.goBack();
        await expect(page).toHaveURL(/\/$/);
        await expect(page.getByRole("dialog", { name: w.leave, exact: true })).toHaveCount(0);
      }
    });
  });
}

test.describe("BUG-1070 (EN), the caret", () => {
  test.use({ locale: "en-US" });

  test("f. a caret at the end during « Saving… » of 60.00 is at the end of the re-seeded 60", async ({ page }) => {
    const w = W.en;
    await open(page, "en");
    const { during, afterAnswer } = await saveAndSelectDuring(page, w, "60.00", () => page.keyboard.press("End"));
    process.stdout.write(`PROBE1070 case=f during=${JSON.stringify(during)} afterAnswer=${JSON.stringify(afterAnswer)}\n`);
    expect(during).toEqual({ v: "60.00", s: 5, e: 5, focused: true });
    expect(afterAnswer).toEqual({ v: "60", s: 2, e: 2, focused: true });
  });
});

/**
 * The OTHER write path, `reseedFromServer`: a server push (a route render) re-seeds an unedited
 * field. On the overview a push can come with no save of this form at all — `IntakeConsentCard`
 * calls `router.refresh()` when its poll sees the consent change — so a coach holding a
 * selection in the body-fat field can have its text rewritten under it. The push is driven here
 * by the same `router.refresh()`, after a second tab stored a different milestone.
 */
test.describe("BUG-1070 (EN), the push path", () => {
  test.use({ locale: "en-US" });

  test("g. select-all, then a push re-seeds 20 to 25: the next keystroke replaces it", async ({ page, context }) => {
    const w = W.en;
    await signInThroughForm(page, { lang: "en" });
    await page.goto(`/clients/${LINA}`);
    await field(page, w).fill("20");
    await saveButton(page, w).click();
    await expect(block(page, w).getByText(w.saved, { exact: true })).toBeVisible();
    await expect(saveButton(page, w)).toBeEnabled();
    await expect(field(page, w)).toHaveValue("20");

    await field(page, w).click();
    await page.keyboard.press("Control+A");
    const during = await read(field(page, w));
    expect(during).toEqual({ v: "20", s: 0, e: 2, focused: true });

    const other = await context.newPage();
    await other.goto(`/clients/${LINA}`);
    await field(other, w).fill("25");
    await saveButton(other, w).click();
    await expect(block(other, w).getByText(w.saved, { exact: true })).toBeVisible();
    await other.close();

    await page.evaluate(() => (window as unknown as { next: { router: { refresh(): void } } }).next.router.refresh());
    await expect(field(page, w)).toHaveValue("25");
    await page.waitForTimeout(400); // human reaction time
    const afterPush = await read(field(page, w));
    await page.keyboard.type("3", { delay: 150 });
    const final = await read(field(page, w));
    process.stdout.write(
      `PROBE1070 case=g during=${JSON.stringify(during)} afterPush=${JSON.stringify(afterPush)} final=${JSON.stringify(final)}\n`
    );
    expect(afterPush, "the push's re-seed did not keep the whole-text selection").toEqual({
      v: "25",
      s: 0,
      e: 2,
      focused: true,
    });
    expect(final.v, "the coach's replacement was appended to the pushed text").toBe("3");
  });
});
