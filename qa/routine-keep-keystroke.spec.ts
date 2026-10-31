import { expect, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-1080 — the routine editor's « Keep » on an AI proposal, and one keystroke into Plan name
 * inside Keep's own history step.
 *
 * Setup (senior-qa's probe at the BUG-1077 gate, hub `docs/qa/evidence/2026-10-31-bug1077/`,
 * `qa1077-kept.spec.ts.txt`): Lina, fixture AI on with no delay. The coach types « Coach edit »
 * into Plan name and changes the Sets of one row the proposal leaves unchanged (BUG-1080
 * closes-when 2), saves nothing (the guard is armed), then Regenerate → Generate → Keep, and
 * confirms « Replace your draft? ». Keep hands the guard's history entry back with
 * `history.back()` (`kept()` → `leaving.release()` in `RoutineEditor`).
 *
 * The (1a) probe is `qa/routine-discard-keystroke.spec.ts`'s (BUG-1077): the FIRST
 * `history.back()` after the confirm queues one microtask that types `x` into `#plan-name` as it
 * is in the document at that moment (the native value setter and a bubbling `input` event, so
 * React's `onChange` runs), and records `guardAtType` (the guard's entry was still current, so
 * the step had not landed), `valueAtType` and `sameElementAtType` (whether that input is the one
 * « Coach edit » was typed into). A microtask runs after the synchronous work that called
 * `back()` — the whole Keep continuation, `release()` included — and before any later task,
 * React's scheduled render included, so the probe does not depend on timing.
 *
 * The kept draft's values are read from the SERVER, not assumed: once the test has settled, a
 * second tab of the same context opens the routine and reads its Plan name and the row's Sets
 * (nothing after Keep was saved, so that is the draft Keep stored).
 *
 * Recorded as annotations and as one `BUG1080 {json}` line per test, so a `--reporter=list` log
 * carries them. Chromium only, default config, `en`. Copy is literal, never imported from
 * `src/lib/copy*.ts`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const ROUTE = `/clients/${LINA}/routine`;
const COACH_EDIT = "Coach edit";
/** A day-1 row: the fixture's proposal leaves day 1 unchanged (`coachApi.fixture.ts`, EV-186b). */
const ROW = "Barbell Bench Press";
const EDITED_SETS = "7";
const LEAVE = "Leave with unsaved changes?";
const leaveDialog = (page: Page) => page.getByRole("dialog", { name: LEAVE, exact: true });
const panel = (page: Page) => page.getByTestId("routine-ai-panel");
const planName = (page: Page) => page.locator("#plan-name");
const setsField = (page: Page) => page.getByRole("group", { name: ROW, exact: true }).getByLabel("Sets");

/** Installed before any page script: counts Leave dialogs and `history.back()` calls. */
async function instrument(context: BrowserContext) {
  await context.addInitScript(() => {
    const ss = window.sessionStorage;
    const bump = (key: string) => ss.setItem(key, String(Number(ss.getItem(key) || "0") + 1));
    const seen = new WeakSet<Element>();
    const scan = () => {
      for (const dialog of Array.from(document.querySelectorAll('[role="dialog"]'))) {
        if (seen.has(dialog)) continue;
        if ((dialog.textContent || "").includes("Leave with unsaved changes?")) {
          seen.add(dialog);
          bump("bug1080Asks");
        }
      }
    };
    new MutationObserver(scan).observe(document, { childList: true, subtree: true });
    const back = window.history.back.bind(window.history);
    window.history.back = () => {
      bump("bug1080Backs");
      back();
    };
  });
}

async function counters(page: Page) {
  return page.evaluate(() => ({
    asks: Number(sessionStorage.getItem("bug1080Asks") || "0"),
    backs: Number(sessionStorage.getItem("bug1080Backs") || "0"),
    typed: Number(sessionStorage.getItem("bug1080Typed") || "0"),
    guardAtType: sessionStorage.getItem("bug1080GuardAtType"),
    valueAtType: sessionStorage.getItem("bug1080ValueAtType"),
    sameElementAtType: sessionStorage.getItem("bug1080SameElementAtType"),
    guardNow: window.history.state?.evoliUnsavedGuard === true,
    path: location.pathname,
  }));
}

async function resetCounters(page: Page) {
  await page.evaluate(() => {
    for (const k of ["bug1080Backs", "bug1080Asks", "bug1080Typed"]) sessionStorage.setItem(k, "0");
    for (const k of ["bug1080GuardAtType", "bug1080ValueAtType", "bug1080SameElementAtType"]) sessionStorage.removeItem(k);
  });
}

/** Back, allowed to time out: while the guard holds, the document does not change. */
async function back(page: Page) {
  await page.goBack({ timeout: 4000 }).catch(() => null);
  await page.waitForTimeout(900);
}

async function armed(page: Page) {
  await page.waitForFunction(() => window.history.state?.evoliUnsavedGuard === true, null, { timeout: 1500 });
}

/** As annotations, and as one `BUG1080 {json}` line so a `--reporter=list` log carries them too. */
function note(testInfo: TestInfo, facts: Record<string, unknown>) {
  process.stdout.write(`BUG1080 ${JSON.stringify({ test: testInfo.title.slice(10, 50), ...facts })}\n`);
  for (const [type, value] of Object.entries(facts)) {
    testInfo.annotations.push({ type, description: typeof value === "string" ? value : JSON.stringify(value) });
  }
}

/**
 * Lina's page, then her routine (so a clean Back lands on Lina's page), the published values,
 * then « Coach edit » and Sets « 7 » typed and not saved, then a READY proposal on screen.
 */
async function openWithUnsavedEditsAndProposal(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await page.context().addCookies([
    { name: "evoli_fixture_ai_caps", value: "on", domain: "localhost", path: "/" },
    { name: "evoli_fixture_ai_delay_ms", value: "0", domain: "localhost", path: "/" },
  ]);
  await page.goto(`/clients/${LINA}`);
  await page.goto(ROUTE);
  await expect(planName(page)).toBeVisible({ timeout: 20_000 });
  const publishedName = await planName(page).inputValue();
  const publishedSets = await setsField(page).inputValue();
  expect(publishedName, "the case needs a published name that differs from the unsaved one").not.toBe(COACH_EDIT);
  expect(publishedSets, "the case needs published Sets that differ from the unsaved ones").not.toBe(EDITED_SETS);
  await expect(async () => {
    await planName(page).fill(COACH_EDIT);
    await armed(page);
  }).toPass({ timeout: 25_000 });
  await setsField(page).fill(EDITED_SETS);
  await expect(planName(page)).toHaveValue(COACH_EDIT);
  await expect(setsField(page)).toHaveValue(EDITED_SETS);
  await page.getByRole("button", { name: "Regenerate with AI", exact: true }).click();
  await panel(page).getByRole("button", { name: "Generate" }).click();
  await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
  await planName(page).evaluate((el) => el.setAttribute("data-bug1080-typed-before", "1"));
  return { publishedName, publishedSets };
}

/** « Keep », then the « Replace your draft? » confirm (the editor is dirty, so it is always asked). */
async function confirmKeep(page: Page, beforeConfirm?: () => Promise<void>) {
  await panel(page).getByRole("button", { name: "Keep", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Replace your draft?" });
  await expect(modal).toBeVisible();
  await beforeConfirm?.();
  await modal.getByRole("button", { name: "Keep", exact: true }).click();
  await expect(modal).toHaveCount(0);
}

/** The draft Keep stored, as the server renders it in a fresh tab of the same context. */
async function keptOnServer(context: BrowserContext) {
  const tab = await context.newPage();
  try {
    await tab.goto(ROUTE);
    await expect(planName(tab)).toBeVisible({ timeout: 20_000 });
    return { keptName: await planName(tab).inputValue(), keptSets: await setsField(tab).inputValue() };
  } finally {
    await tab.close();
  }
}

/**
 * BUG-1080 closes-when 1 (1a): installed in the page right before the confirm. The FIRST
 * `history.back()` after it queues one microtask, then calls the `back()` it wrapped (the init
 * script's counting wrapper, then the browser's). A microtask rather than a call inside the
 * wrapper, so the keystroke is never dispatched from inside a React commit.
 */
async function wrapBackWithMicrotaskKeystroke(page: Page) {
  await page.evaluate(() => {
    const ss = window.sessionStorage;
    const wrapped = window.history.back.bind(window.history);
    let fired = false;
    window.history.back = () => {
      if (!fired) {
        fired = true;
        queueMicrotask(() => {
          const el = document.getElementById("plan-name") as HTMLInputElement | null;
          if (!el) return;
          ss.setItem("bug1080GuardAtType", String(window.history.state?.evoliUnsavedGuard === true));
          ss.setItem("bug1080ValueAtType", el.value);
          ss.setItem("bug1080SameElementAtType", String(el.hasAttribute("data-bug1080-typed-before")));
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
          setter.call(el, el.value + "x");
          el.dispatchEvent(new Event("input", { bubbles: true }));
          ss.setItem("bug1080Typed", String(Number(ss.getItem("bug1080Typed") || "0") + 1));
        });
      }
      wrapped();
    };
  });
}

test.describe("BUG-1080 · routine Keep on an AI proposal", () => {
  test("BUG-1080 · (1a) a keystroke in a microtask queued at Keep's history step never brings the replaced edit back", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(150_000);
    await instrument(context);
    const { publishedName, publishedSets } = await openWithUnsavedEditsAndProposal(page);
    await resetCounters(page);

    await confirmKeep(page, () => wrapBackWithMicrotaskKeystroke(page));
    await page.waitForTimeout(2500);

    const c0 = await counters(page);
    const nameSettled = await planName(page).inputValue();
    const setsSettled = await setsField(page).inputValue();
    const badge = await page.getByText("Unsaved changes", { exact: true }).isVisible();
    const facts: Record<string, unknown> = {
      probe: "microtask",
      publishedName,
      publishedSets,
      nameSettled,
      setsSettled,
      badge: String(badge),
      typed: String(c0.typed === 1),
      guardAtType: String(c0.guardAtType),
      valueAtType: String(c0.valueAtType),
      sameElementAtType: String(c0.sameElementAtType),
      backsAfterKeep: c0.backs,
    };

    await back(page);
    const c1 = await counters(page);
    facts.asksOnBack = c1.asks;
    facts.pathAfterBack = c1.path;
    let afterLeave: string | null = null;
    if (c1.asks > 0) {
      await leaveDialog(page).getByRole("button", { name: "Stay on this page", exact: true }).click({ timeout: 5000 });
      await page.waitForTimeout(900);
      facts.nameAfterStay = await planName(page).inputValue();
      await back(page);
      await leaveDialog(page).getByRole("button", { name: "Leave without saving", exact: true }).click({ timeout: 5000 });
      await page.waitForURL((u) => u.pathname === `/clients/${LINA}`, { timeout: 10_000 }).catch(() => null);
      afterLeave = new URL(page.url()).pathname;
      facts.pathAfterLeave = afterLeave;
    }
    const { keptName, keptSets } = await keptOnServer(context);
    facts.keptName = keptName;
    facts.keptSets = keptSets;
    note(testInfo, facts);

    expect(keptName, "the kept draft's name is not the replaced edit").not.toBe(COACH_EDIT);
    expect(c0.typed, "the keystroke was dispatched").toBe(1);
    // The probe must stay in the window, or a green run proves nothing (staff, BUG-1077).
    expect(c0.guardAtType, "the keystroke landed inside the step (the guard's entry was current)").toBe("true");
    // Plan name sits outside the rows Keep remounts (`key={loads}`): there is one input, before and after.
    expect(c0.sameElementAtType, "the keystroke reached the one Plan name input").toBe("true");
    expect(c0.valueAtType, "the keystroke found the kept draft's name in the field").toBe(keptName);
    expect(nameSettled.includes(COACH_EDIT), "Plan name never holds the replaced edit").toBe(false);
    expect(nameSettled, "Plan name reads exactly the kept name plus the keystroke").toBe(`${keptName}x`);
    // Closes-when 2: the rest of the document is the kept draft's too.
    expect(setsSettled, "Sets reads the kept draft's value, never the pre-Keep edit").toBe(keptSets);
    expect(setsSettled, "Sets never holds the pre-Keep edit").not.toBe(EDITED_SETS);
    expect(c0.backs, "one history.back() for the Keep").toBe(1);
    expect(badge, "« Unsaved changes » is shown over the keystroke").toBe(true);
    expect(c1.asks, "Back over unsaved text asks exactly once").toBe(1);
    expect(c1.path, "and the URL does not change").toBe(ROUTE);
    expect(facts.nameAfterStay, "Stay keeps the text").toBe(nameSettled);
    expect(afterLeave, "Leave lands on the page before, in one step").toBe(`/clients/${LINA}`);
  });

  test("BUG-1080 · control: with no keystroke, Keep settles on the kept draft, clean and unguarded", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(150_000);
    await instrument(context);
    const { publishedName, publishedSets } = await openWithUnsavedEditsAndProposal(page);
    await resetCounters(page);

    await confirmKeep(page);
    await page.waitForTimeout(2500);

    const c0 = await counters(page);
    const nameSettled = await planName(page).inputValue();
    const setsSettled = await setsField(page).inputValue();
    const badge = await page.getByText("Unsaved changes", { exact: true }).isVisible();
    await back(page);
    const c1 = await counters(page);
    const { keptName, keptSets } = await keptOnServer(context);
    note(testInfo, {
      probe: "control",
      publishedName,
      publishedSets,
      nameSettled,
      setsSettled,
      badge: String(badge),
      guardAfterKeep: String(c0.guardNow),
      backsAfterKeep: c0.backs,
      asksOnBack: c1.asks,
      pathAfterBack: c1.path,
      keptName,
      keptSets,
    });

    expect(nameSettled, "Plan name reads the kept name").toBe(keptName);
    expect(setsSettled, "Sets reads the kept draft's value").toBe(keptSets);
    expect(badge, "no « Unsaved changes »").toBe(false);
    expect(c0.guardNow, "no guard").toBe(false);
    expect(c0.backs, "one history.back() for the Keep").toBe(1);
    expect(c1.asks, "nothing unsaved: Back asks nothing").toBe(0);
    expect(c1.path, "and leaves in one step").toBe(`/clients/${LINA}`);
  });

  test("BUG-1080 · at human pace, a keystroke after Keep edits the kept draft and is guarded", async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(150_000);
    await instrument(context);
    await openWithUnsavedEditsAndProposal(page);
    await resetCounters(page);

    await confirmKeep(page);
    await page.waitForTimeout(1500);
    const name = planName(page);
    await name.click();
    await name.press("End");
    await name.pressSequentially("x");
    await page.waitForTimeout(1200);

    const nameSettled = await name.inputValue();
    const badge = await page.getByText("Unsaved changes", { exact: true }).isVisible();
    await back(page);
    const c1 = await counters(page);
    const { keptName } = await keptOnServer(context);
    note(testInfo, { probe: "human", nameSettled, badge: String(badge), asksOnBack: c1.asks, pathAfterBack: c1.path, keptName });

    expect(nameSettled, "Plan name reads the kept name plus the keystroke").toBe(`${keptName}x`);
    expect(badge, "« Unsaved changes » is shown").toBe(true);
    expect(c1.asks, "Back asks exactly once").toBe(1);
    expect(c1.path, "and the URL does not change").toBe(ROUTE);
  });
});
