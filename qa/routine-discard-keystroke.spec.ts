import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-1077 — the routine editor's « Discard draft », and one keystroke into Tempo inside the
 * discard's own history step.
 *
 * Setup (senior-qa's BUG-736 gate probe, hub `docs/qa/evidence/2026-10-30-bug736/`, case
 * `qa736-own.spec.ts.txt:356`, path `discard`): a draft is saved with Sets « 4 », Tempo is typed
 * « 3-1-1 » without saving, and « Discard draft » is confirmed. The discard hands the guard's
 * history entry back with `history.back()`; one keystroke `x` is dispatched into Tempo at
 * `setTimeout(0)` after that call (the mechanism of `qa/save-step-keystroke.spec.ts`).
 *
 * The keystroke goes to the Tempo input of the « Goblet Squat » row that is IN THE DOCUMENT when
 * it fires, found by its row and label, not to an element marked earlier: a discard remounts the
 * rows (`replaced()` in `RoutineEditor`), and the coach types into the field on screen. Whether
 * that input is still the one Tempo was typed into before the discard is recorded
 * (`sameElementAtType`), with the text it held (`valueAtType`).
 *
 * Recorded as annotations, so a `--reporter=json` run can be counted:
 *   · `publishedTempo` / `publishedSets` — the published plan's values, read before the first edit;
 *   · `tempoSettled` / `setsSettled` — the fields once the page has settled after the discard;
 *   · `typed` — whether the keystroke was dispatched; `guardAtType` — whether the guard's entry
 *     was still the current one when it was (the step had not landed);
 *   · `reached` — `typed` and `guardAtType` both true (the row's definition of the window);
 *   · `backsAfterDiscard` — how many times the app called `history.back()` for the discard.
 *
 * Asserted in EVERY run, reached or not (BUG-1077 closes-when 1): neither field holds the
 * discarded value; Tempo reads the published value or the published value plus `x`; Sets reads
 * the published value. When Tempo holds text the server was not sent, Back asks exactly once and
 * the URL does not change. When it does not, the page is clean and Back leaves in one step.
 *
 * The human-pace case (closes-when 2) types after the discard has settled: it must end exactly as
 * it did before the fix.
 *
 * Chromium only, default config. Copy is literal, never imported from `src/lib/copy*.ts`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const ROW = "Goblet Squat";
const DISCARDED_TEMPO = "3-1-1";
const DISCARDED_SETS = "4";
const LEAVE = "Leave with unsaved changes?";
const leaveDialog = (page: Page) => page.getByRole("dialog", { name: LEAVE, exact: true });

/** Installed before any page script; the counters live in sessionStorage. */
async function instrument(context: BrowserContext) {
  await context.addInitScript(
    ({ row }) => {
      const ss = window.sessionStorage;
      const bump = (key: string) => ss.setItem(key, String(Number(ss.getItem(key) || "0") + 1));
      const seen = new WeakSet<Element>();
      const scan = () => {
        for (const dialog of Array.from(document.querySelectorAll('[role="dialog"]'))) {
          if (seen.has(dialog)) continue;
          if ((dialog.textContent || "").includes("Leave with unsaved changes?")) {
            seen.add(dialog);
            bump("bug1077Asks");
          }
        }
      };
      new MutationObserver(scan).observe(document, { childList: true, subtree: true });
      /** The visible row's Tempo input, as it is in the document right now. */
      const tempoNow = (): HTMLInputElement | null => {
        const groups = Array.from(document.querySelectorAll(`[role="group"][aria-label="${row}"]`)) as HTMLElement[];
        const group = groups.find((g) => g.offsetParent !== null);
        if (!group) return null;
        for (const label of Array.from(group.querySelectorAll("label"))) {
          if ((label.firstElementChild?.textContent || "").trim() !== "Tempo") continue;
          return label.querySelector("input");
        }
        return null;
      };
      const back = window.history.back.bind(window.history);
      window.history.back = () => {
        bump("bug1077Backs");
        back();
        if (ss.getItem("bug1077Arm") !== "1") return;
        window.setTimeout(() => {
          const el = tempoNow();
          if (!el) return;
          ss.setItem("bug1077Arm", "0");
          ss.setItem("bug1077GuardAtType", String(window.history.state?.evoliUnsavedGuard === true));
          ss.setItem("bug1077ValueAtType", el.value);
          ss.setItem("bug1077SameElementAtType", String(el.hasAttribute("data-bug1077-typed-before")));
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
          setter.call(el, el.value + "x");
          el.dispatchEvent(new Event("input", { bubbles: true }));
          bump("bug1077Typed");
        }, 0);
      };
    },
    { row: ROW }
  );
}

async function counters(page: Page) {
  return page.evaluate(() => ({
    asks: Number(sessionStorage.getItem("bug1077Asks") || "0"),
    backs: Number(sessionStorage.getItem("bug1077Backs") || "0"),
    typed: Number(sessionStorage.getItem("bug1077Typed") || "0"),
    guardAtType: sessionStorage.getItem("bug1077GuardAtType"),
    valueAtType: sessionStorage.getItem("bug1077ValueAtType"),
    sameElementAtType: sessionStorage.getItem("bug1077SameElementAtType"),
    path: location.pathname,
  }));
}

async function resetCounters(page: Page, arm: boolean) {
  await page.evaluate((a) => {
    for (const k of ["bug1077Backs", "bug1077Asks", "bug1077Typed"]) sessionStorage.setItem(k, "0");
    for (const k of ["bug1077GuardAtType", "bug1077ValueAtType", "bug1077SameElementAtType"]) sessionStorage.removeItem(k);
    sessionStorage.setItem("bug1077Arm", a ? "1" : "0");
  }, arm);
}

/** Back, allowed to time out: while the guard holds, the document does not change. */
async function back(page: Page) {
  await page.goBack({ timeout: 4000 }).catch(() => null);
  await page.waitForTimeout(900);
}

async function armed(page: Page) {
  await page.waitForFunction(() => window.history.state?.evoliUnsavedGuard === true, null, { timeout: 1500 });
}

const row = (page: Page) => page.getByRole("group", { name: ROW, exact: true });
const tempoField = (page: Page) => row(page).getByLabel("Tempo");
const setsField = (page: Page) => row(page).getByLabel("Sets");

/** As annotations, and as one `BUG1077 {json}` line so a `--reporter=list` log carries them too. */
function note(testInfo: TestInfo, facts: Record<string, unknown>) {
  process.stdout.write(`BUG1077 ${JSON.stringify({ test: testInfo.title.slice(10, 40), ...facts })}\n`);
  for (const [type, value] of Object.entries(facts)) {
    testInfo.annotations.push({ type, description: typeof value === "string" ? value : JSON.stringify(value) });
  }
}

/**
 * Lina's page, then Yusuf's routine (so a clean Back lands on Lina's), the published values, a
 * saved draft with Sets « 4 », then Tempo « 3-1-1 » typed and not saved. Returns the published values.
 */
async function openWithDiscardableEdits(page: Page) {
  await signInThroughForm(page);
  await page.goto(`/clients/${LINA}`);
  await page.goto(`/clients/${YUSUF}/routine`);
  await expect(tempoField(page)).toBeVisible({ timeout: 20_000 });
  const publishedTempo = await tempoField(page).inputValue();
  const publishedSets = await setsField(page).inputValue();
  expect(publishedTempo, "the case needs a published Tempo that differs from the discarded one").not.toBe(DISCARDED_TEMPO);
  expect(publishedSets, "the case needs published Sets that differ from the discarded ones").not.toBe(DISCARDED_SETS);
  await expect(async () => {
    await setsField(page).fill(DISCARDED_SETS);
    await armed(page);
  }).toPass({ timeout: 25_000 });
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Draft saved /)).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(async () => {
    await tempoField(page).fill(DISCARDED_TEMPO);
    await armed(page);
  }).toPass({ timeout: 25_000 });
  return { publishedTempo, publishedSets };
}

async function confirmDiscard(page: Page) {
  await page.getByRole("button", { name: "Discard draft" }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await modal.getByRole("button", { name: "Discard draft" }).click();
  await expect(modal).toHaveCount(0);
}

test.describe("BUG-1077 · routine Discard draft", () => {
  test("BUG-1077 · a keystroke at setTimeout(0) after the discard's history step never brings the discarded edit back", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(150_000);
    await instrument(context);
    const { publishedTempo, publishedSets } = await openWithDiscardableEdits(page);
    await tempoField(page).evaluate((el) => el.setAttribute("data-bug1077-typed-before", "1"));
    await resetCounters(page, true);

    await confirmDiscard(page);
    await page.waitForTimeout(2500);

    const c0 = await counters(page);
    const tempoSettled = await tempoField(page).inputValue();
    const setsSettled = await setsField(page).inputValue();
    const typed = c0.typed === 1;
    const guardAtType = c0.guardAtType;
    const reached = typed && guardAtType === "true";
    const unsent = tempoSettled !== publishedTempo;
    const facts: Record<string, unknown> = {
      publishedTempo,
      publishedSets,
      tempoSettled,
      setsSettled,
      typed: String(typed),
      guardAtType: String(guardAtType),
      reached: String(reached),
      valueAtType: String(c0.valueAtType),
      sameElementAtType: String(c0.sameElementAtType),
      backsAfterDiscard: c0.backs,
    };

    await back(page);
    const c1 = await counters(page);
    facts.asksOnBack = c1.asks;
    facts.pathAfterBack = c1.path;
    let afterLeave: string | null = null;
    if (c1.asks > 0) {
      await leaveDialog(page).getByRole("button", { name: "Stay on this page", exact: true }).click({ timeout: 5000 });
      await page.waitForTimeout(900);
      facts.tempoAfterStay = await tempoField(page).inputValue();
      await back(page);
      await leaveDialog(page).getByRole("button", { name: "Leave without saving", exact: true }).click({ timeout: 5000 });
      await page.waitForURL((u) => u.pathname === `/clients/${LINA}`, { timeout: 10_000 }).catch(() => null);
      afterLeave = new URL(page.url()).pathname;
      facts.pathAfterLeave = afterLeave;
    }
    note(testInfo, facts);

    expect(tempoSettled.includes(DISCARDED_TEMPO), "Tempo never holds the discarded value").toBe(false);
    expect(setsSettled, "Sets never holds the discarded value").not.toBe(DISCARDED_SETS);
    expect([publishedTempo, `${publishedTempo}x`], "Tempo reads the published value, or it plus the keystroke").toContain(
      tempoSettled
    );
    expect(setsSettled, "Sets reads the published value").toBe(publishedSets);
    if (unsent) {
      expect(c1.asks, "Back over unsaved text asks exactly once").toBe(1);
      expect(c1.path, "and the URL does not change").toBe(`/clients/${YUSUF}/routine`);
      expect(facts.tempoAfterStay, "Stay keeps the text").toBe(tempoSettled);
      expect(afterLeave, "Leave lands on the page before, in one step").toBe(`/clients/${LINA}`);
    } else {
      expect(c1.asks, "nothing unsaved: Back asks nothing").toBe(0);
      expect(c1.path, "and leaves in one step").toBe(`/clients/${LINA}`);
    }
  });

  test("BUG-1077 · at human pace, a keystroke after the discard edits the published plan and is guarded", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(150_000);
    await instrument(context);
    const { publishedTempo, publishedSets } = await openWithDiscardableEdits(page);
    await resetCounters(page, false);

    await confirmDiscard(page);
    await page.waitForTimeout(1500);
    const tempo = tempoField(page);
    await tempo.click();
    await tempo.press("End");
    await tempo.pressSequentially("x");
    await page.waitForTimeout(1200);

    const tempoSettled = await tempo.inputValue();
    const setsSettled = await setsField(page).inputValue();
    const badge = await page.getByText("Unsaved changes", { exact: true }).isVisible();
    await back(page);
    const c1 = await counters(page);
    note(testInfo, { publishedTempo, publishedSets, tempoSettled, setsSettled, badge: String(badge), asksOnBack: c1.asks });

    expect(tempoSettled, "Tempo reads the published value plus the keystroke").toBe(`${publishedTempo}x`);
    expect(setsSettled, "Sets reads the published value").toBe(publishedSets);
    expect(badge, "« Unsaved changes » is shown").toBe(true);
    expect(c1.asks, "Back asks exactly once").toBe(1);
    expect(c1.path, "and the URL does not change").toBe(`/clients/${YUSUF}/routine`);
  });
});
