import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * ADR-0033 D33.9's row for branch 2a — publish re-seeds the editor WITHOUT a refresh.
 *
 * Until 2a, a confirmed publish ended in `leaving.release(() => router.refresh())`, and
 * the refresh was what handed `RoutineEditor` its new props: the new `planId`, the
 * REPAIRED plan as `activePlan`, and no draft. 2a deletes that refresh, because
 * `publishAction` calls `revalidatePath` and its own response already carries the page
 * rendered after the publish. This file proves the props still arrive and still do
 * their three jobs, on the same page, with no reload:
 *
 *   1. the editor shows the plan the trainee RECEIVED (the repairs applied), not the
 *      draft the coach submitted (EV-184 AC3);
 *   2. the next Save draft echoes the token of that re-read state, `null`, because the
 *      publish deleted the draft. The submitted draft's `updatedAt` would be a token for
 *      a row that no longer exists;
 *   3. what that save writes is built on the repaired plan (re-read on a reload).
 *
 * `qa/routine-editor-remount.spec.ts` (bd57294's `loads` remount) and
 * `qa/page-read-budget.spec.ts` (one render per publish) stay as they are.
 *
 * Red with the re-seed effect's `setDocument` taken out (the editor keeps the submitted
 * plan), and red with its `token.current = …` line taken out AND the publish path's own
 * `token.current = null` taken out (the save echoes the submitted draft's token).
 */

const PASSWORD = "Password123!";
/** A shoulder injury: publishing repairs Barbell Overhead Press and Barbell Bench Press. */
const DANA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0004";

interface DraftPut {
  clientId: string;
  replacesDraftUpdatedAt: string | null;
  outcome: string;
}

async function signIn(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: PASSWORD });
}

function exerciseRow(page: Page, name: string): Locator {
  return page.getByRole("group", { name, exact: true });
}

async function draftPuts(page: Page): Promise<DraftPut[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { draftPuts: DraftPut[] }).draftPuts.filter((p) => p.clientId === DANA);
}

test("publish → the editor shows the repaired plan, and the next save sends the re-read token", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/clients/${DANA}/routine`);
  await expect(exerciseRow(page, "Barbell Overhead Press")).toBeVisible();

  // Publish saves the editor's plan as a draft first, then previews the repairs.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Publish with these changes" })).toBeVisible();
  const submitted = await draftPuts(page);
  expect(submitted, "the publish's save half wrote the submitted draft").toHaveLength(1);
  expect(submitted[0].outcome).toBe("200");

  await dialog.getByRole("button", { name: "Publish with these changes" }).click();
  await expect(page.getByText("Published. The trainee sees it next time they open the app.")).toBeVisible();

  // (1) On the SAME page: the repaired plan, not the submitted one.
  await expect(page.getByText("Published plan")).toBeVisible();
  await expect(page.getByText("Draft — not yet published")).toHaveCount(0);
  await expect(exerciseRow(page, "Landmine Press")).toBeVisible();
  await expect(exerciseRow(page, "Machine Chest Press")).toBeVisible();
  await expect(exerciseRow(page, "Barbell Overhead Press")).toHaveCount(0);
  await expect(exerciseRow(page, "Barbell Bench Press")).toHaveCount(0);

  // (2) The next save echoes the re-read state's token: no draft exists, so null.
  await exerciseRow(page, "Landmine Press").getByLabel("Sets").fill("5");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Draft saved /)).toBeVisible();
  const puts = await draftPuts(page);
  expect(puts).toHaveLength(2);
  expect(puts[1]).toMatchObject({ replacesDraftUpdatedAt: null, outcome: "200" });

  // (3) What was saved is the repaired plan with the coach's one edit on it.
  page.on("dialog", (d) => d.accept());
  await page.reload();
  await expect(page.getByText("Draft — not yet published")).toBeVisible();
  await expect(exerciseRow(page, "Landmine Press").getByLabel("Sets")).toHaveValue("5");
  await expect(exerciseRow(page, "Barbell Overhead Press")).toHaveCount(0);
});
