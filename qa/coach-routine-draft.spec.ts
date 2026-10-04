import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";
import { openEveryDay } from "./day-accordion";

/**
 * BUG-195c — the routine write path against the BUG-195b contract, in FIXTURE mode.
 *
 * The fixture reproduces the api's draft boundary (`resolveDraftDocument` in
 * `src/lib/coachApi.fixture.ts`): the wrapper body, the staleness token and its 409, the
 * two D9 refusals and the D3 resolution. The LIVE proof — the same loop against a real
 * b-fit-api built from the api branch — is `qa/coach-routine-draft.live.spec.ts`; this
 * file covers what a live run cannot reach cheaply (two contexts racing, every field
 * control, the template editor) and runs in the default gate with no backend.
 *
 * Sentences are LITERALS, never imported from `src/lib/copy.ts`: an assertion that
 * imports the string it checks agrees with it by construction.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

/** Populated plan, no injuries; the trainee's equipment is in the published document. */
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
/** No plan at all: the from-scratch path. */
const NILS = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002";
/** NON-EMPTY equipment AND injuries (SHOULDER + a free-text note) — AC3.10's trainee. */
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";
/** A plain two-day plan, no injuries. */
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";

async function signIn(page: Page) {
  await signInThroughForm(page, { email: EMAIL, password: PASSWORD });
}

function exerciseRow(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

async function addFromCatalog(page: Page, dayIndex: number, name: string) {
  // EV-337f2: days after the first are closed on load; open them before reaching into them.
  await openEveryDay(page);
  await page.getByRole("button", { name: "Add exercise" }).nth(dayIndex).click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel("Search the catalog").fill(name);
  await picker.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(picker.getByText(`Added ${name}.`)).toBeVisible();
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

interface DraftPut {
  clientId: string;
  bodyKeys: string[];
  replacesDraftUpdatedAt: string | null;
  equipment: unknown;
  injuries: unknown;
  outcome: string;
}

/** Every `PUT …/routine/draft` the fixture answered — the body the browser never sees. */
async function draftPuts(page: Page): Promise<DraftPut[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { draftPuts: DraftPut[] }).draftPuts;
}

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Draft saved /)).toBeVisible();
}

test.describe("AC3.2 — what the coach saves is what the reloaded editor shows, every field", () => {
  test("tempo, notes, weight, estimated minutes and a timed exercise survive Save draft and a hard reload", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);
    await expect(page.getByText("Published plan")).toBeVisible();

    const bench = exerciseRow(page, "Barbell Bench Press");
    await bench.getByLabel("Tempo").fill("3-1-1");
    await bench.getByLabel("Weight").fill("60 kg");
    await bench.getByLabel("Notes: Barbell Bench Press").fill("Pause on the chest");
    await page.getByLabel("Day 1 estimated minutes").fill("55");

    // AC3.5 — a Plank is picked as the catalog says it is logged: timed, no reps.
    await addFromCatalog(page, 1, "Plank");
    const plank = exerciseRow(page, "Plank");
    await expect(plank.getByLabel("Tracked as")).toHaveValue("DURATION");
    await expect(plank.getByLabel("Reps")).toHaveCount(0);
    // D3: no fabricated duration — the Seconds box starts EMPTY.
    await expect(plank.getByLabel("Seconds")).toHaveValue("");
    await plank.getByLabel("Seconds").fill("45");

    await saveDraft(page);
    await page.reload();

    await expect(page.getByText("Draft — not yet published")).toBeVisible();
    await openEveryDay(page); // EV-337f2: a reload closes days 2+ again
    const benchAfter = exerciseRow(page, "Barbell Bench Press");
    await expect(benchAfter.getByLabel("Tempo")).toHaveValue("3-1-1");
    await expect(benchAfter.getByLabel("Weight")).toHaveValue("60 kg");
    await expect(benchAfter.getByLabel("Notes: Barbell Bench Press")).toHaveValue("Pause on the chest");
    await expect(benchAfter.getByLabel("Sets")).toHaveValue("4");
    await expect(page.getByLabel("Day 1 estimated minutes")).toHaveValue("55");
    const plankAfter = exerciseRow(page, "Plank");
    await expect(plankAfter.getByLabel("Tracked as")).toHaveValue("DURATION");
    await expect(plankAfter.getByLabel("Seconds")).toHaveValue("45");
    await expect(plankAfter.getByLabel("Reps")).toHaveCount(0);
  });

  test("a second save echoes the token the first one produced, and both land", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);
    await exerciseRow(page, "Goblet Squat").getByLabel("Sets").fill("4");
    await saveDraft(page);
    await exerciseRow(page, "Goblet Squat").getByLabel("Sets").fill("5");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    const puts = (await draftPuts(page)).filter((p) => p.clientId === YUSUF);
    expect(puts.map((p) => p.outcome)).toEqual(["200", "200"]);
    // The first save had no draft to replace; the second echoes a real instant.
    expect(puts[0].replacesDraftUpdatedAt).toBeNull();
    expect(puts[1].replacesDraftUpdatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(puts.every((p) => p.bodyKeys.join() === "document,replacesDraftUpdatedAt")).toBe(true);

    await page.reload();
    await expect(exerciseRow(page, "Goblet Squat").getByLabel("Sets")).toHaveValue("5");
  });
});

test.describe("AC3.4 — the trainee's goal and level are theirs: read-only, labelled, resolved on save", () => {
  test("a published plan shows them read-only, next to the sentence that says whose they are", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);
    const goal = page.getByLabel("Goal", { exact: true });
    await expect(goal).toHaveValue("BUILD_MUSCLE");
    await expect(goal).toHaveAttribute("readonly", "");
    await expect(page.getByLabel("Level", { exact: true })).toHaveAttribute("readonly", "");
    await expect(
      page.getByText(
        "Goal and level are the trainee's own answers, from their profile. They are filled in when you save, and you cannot change them here."
      )
    ).toBeVisible();
    // The page's guardrail panel still says the same about equipment and injuries.
    await expect(page.getByText("From the trainee's profile — you cannot change these here.")).toBeVisible();
  });

  test("a plan built from scratch says WHEN they will be set, then shows what the server resolved", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${NILS}/routine`);
    await page.getByRole("button", { name: "Build a plan" }).click();
    // Not a placeholder printed as the trainee's goal.
    await expect(page.getByLabel("Goal", { exact: true })).toHaveValue("Set from their profile when you save.");
    await addFromCatalog(page, 0, "Goblet Squat");
    await addFromCatalog(page, 1, "Push-Up");
    await saveDraft(page);
    await expect(page.getByLabel("Goal", { exact: true })).toHaveValue("BUILD_MUSCLE");
    await expect(page.getByLabel("Level", { exact: true })).toHaveValue("INTERMEDIATE");
  });
});

test.describe("AC3.10 — a published plan carries the trainee's lists; the draft sends them []", () => {
  test("Dana: edit one exercise's sets, Save draft and Publish — both bodies send [] and both land", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/clients/${DANA}/routine`);
    await openEveryDay(page); // EV-337f2: Pull-Up is on day 2, closed on load
    await exerciseRow(page, "Pull-Up").getByLabel("Sets").fill("5");
    await saveDraft(page);

    // (iii) the trainee's equipment and injuries are still shown, read-only, by the page.
    await expect(page.getByText("Shoulders", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Sharp pain in the left shoulder on anything overhead", { exact: true })
    ).toBeVisible();

    await exerciseRow(page, "Pull-Up").getByLabel("Sets").fill("4");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toHaveAccessibleName("We changed 2 things to keep this safe");
    await modal.getByRole("button", { name: "Publish with these changes" }).click();
    await expect(page.getByText("Published. The trainee sees it next time they open the app.")).toBeVisible();

    const puts = (await draftPuts(page)).filter((p) => p.clientId === DANA);
    expect(puts).toHaveLength(2);
    for (const put of puts) {
      // (i) the body's lists are EMPTY although the published document's are not;
      // (ii) and so the write lands rather than 400 COACH_DRAFT_SUBJECT_FIELD.
      expect(put.equipment).toEqual([]);
      expect(put.injuries).toEqual([]);
      expect(put.outcome).toBe("200");
    }
  });
});

test.describe("AC3.6 — a draft saved elsewhere is a 409, and the coach is asked", () => {
  async function twoTabsOnOneDraft(page: Page, other: Page) {
    await signIn(page);
    await page.goto(`/clients/${YUSUF}/routine`);
    // A saved draft both tabs load at the same token.
    await exerciseRow(page, "Goblet Squat").getByLabel("Sets").fill("4");
    await saveDraft(page);
    await page.reload();
    await other.goto(`/clients/${YUSUF}/routine`);
    await expect(other.getByText("Draft — not yet published")).toBeVisible();

    // Tab B saves first…
    await exerciseRow(other, "Goblet Squat").getByLabel("Rest").fill("75s");
    await saveDraft(other);
    // …then tab A, which read the draft before B's write.
    await exerciseRow(page, "Goblet Squat").getByLabel("Tempo").fill("2-0-2");
    await page.getByRole("button", { name: "Save draft" }).click();
    const conflict = page.getByRole("dialog", { name: "This draft changed somewhere else" });
    await expect(conflict).toBeVisible();
    return conflict;
  }

  test("the dialog names the trainee, writes nothing, and 'Keep editing' keeps every edit", async ({
    page,
    context,
  }) => {
    const other = await context.newPage();
    const conflict = await twoTabsOnOneDraft(page, other);
    await expect(
      conflict.getByText(
        "Someone saved this trainee's draft from another tab or device after you opened it. Your changes have not been saved."
      )
    ).toBeVisible();
    // The SAME sentence and control apply uses (AC3.6).
    await expect(
      conflict.getByText("This replaces your unpublished draft for Yusuf A. That draft cannot be recovered.")
    ).toBeVisible();
    await expect(conflict.getByRole("button", { name: "Replace the draft" })).toBeVisible();
    // Staff review S1 — "Load" says what it costs before it is pressed.
    await expect(conflict.getByText("Loading it replaces what is on this page.")).toBeVisible();

    const puts = (await draftPuts(page)).filter((p) => p.clientId === YUSUF);
    expect(puts.map((p) => p.outcome)).toEqual(["200", "200", "COACH_DRAFT_EXISTS"]);

    await conflict.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(exerciseRow(page, "Goblet Squat").getByLabel("Tempo")).toHaveValue("2-0-2");
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    // Nothing was written: tab B's edit is what the server holds.
    await other.reload();
    await expect(exerciseRow(other, "Goblet Squat").getByLabel("Rest")).toHaveValue("75s");
    await expect(exerciseRow(other, "Goblet Squat").getByLabel("Tempo")).toHaveValue("");
  });

  test("'Replace the draft' saves over the current updatedAt — only on the press", async ({ page, context }) => {
    const other = await context.newPage();
    const conflict = await twoTabsOnOneDraft(page, other);
    await conflict.getByRole("button", { name: "Replace the draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);

    const puts = (await draftPuts(page)).filter((p) => p.clientId === YUSUF);
    expect(puts.map((p) => p.outcome)).toEqual(["200", "200", "COACH_DRAFT_EXISTS", "200"]);
    // The retry echoed the 409's timestamp, which is tab B's write.
    expect(puts[3].replacesDraftUpdatedAt).not.toBe(puts[2].replacesDraftUpdatedAt);

    await other.reload();
    await expect(exerciseRow(other, "Goblet Squat").getByLabel("Tempo")).toHaveValue("2-0-2");
  });

  test("'Load the saved version' shows what the server holds, and says the coach's edit was not saved", async ({
    page,
    context,
  }) => {
    const other = await context.newPage();
    const conflict = await twoTabsOnOneDraft(page, other);
    await conflict.getByRole("button", { name: "Load the saved version" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText("You are looking at the version that was saved elsewhere. Your changes were not saved.")
    ).toBeVisible();
    await expect(exerciseRow(page, "Goblet Squat").getByLabel("Rest")).toHaveValue("75s");
    await expect(exerciseRow(page, "Goblet Squat").getByLabel("Tempo")).toHaveValue("");
    await expect(page.getByText("Unsaved changes")).toHaveCount(0);
    // …and the loaded token is current: the next save lands without a conflict.
    await exerciseRow(page, "Goblet Squat").getByLabel("Weight").fill("24 kg");
    await saveDraft(page);
  });
});

test.describe("ADR-0018 D10 — the trainee's own progression is carried, and the editor says so", () => {
  test("a plan with progression rules states they are kept and cannot be edited here", async ({ page }) => {
    await signIn(page);
    await page.goto(`/clients/${LINA}/routine`);
    await expect(
      page.getByText(
        "This plan has 1 week-by-week progression rule from the trainee's own plan. It is kept as it is; you cannot edit it here."
      )
    ).toBeVisible();
  });
});

test.describe("AC3.3 / AC3.5 — the template editor is the same editor", () => {
  test("a Plank picked in a NEW template is timed too, with the same controls", async ({ page }) => {
    await signIn(page);
    await page.goto("/templates/new");
    await addFromCatalog(page, 0, "Plank");
    const plank = exerciseRow(page, "Plank");
    await expect(plank.getByLabel("Tracked as")).toHaveValue("DURATION");
    await expect(plank.getByLabel("Seconds")).toHaveValue("");
    await expect(plank.getByLabel("Reps")).toHaveCount(0);
    // A template describes nobody, so its goal and level are the coach's: selects.
    await expect(page.getByRole("combobox", { name: "Goal" })).toBeEnabled();
    await expect(page.getByLabel("Day 1 estimated minutes")).toBeVisible();
  });
});
