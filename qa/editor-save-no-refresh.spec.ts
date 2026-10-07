import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * ADR-0033 branch 2a — a guarded editor's save, with no `router.refresh()` behind it.
 *
 * The template and recipe editors used to end an update with
 * `leaving.release(() => router.refresh())`. 2a deleted the refresh: the update action's
 * own `revalidatePath` makes its response carry the page rendered after the write. That
 * makes the `revalidatePath` load-bearing, and staff's review found nothing guarding it:
 * deleting it from `updateTemplateAction` / `updateRecipeAction` left 104 editor tests
 * green, because the editor's own fields show local state either way. The page's <h1>
 * (`PageHead`, a server component) is what only a server render can change, so each test
 * renames, saves, and requires:
 *
 *   1. the <h1> shows the new name, from ONE action POST and ZERO RSC GETs;
 *   2. the unsaved-changes sentinel is gone, the URL is the editor's, and the title is
 *      still fresh once the sentinel's popstate has settled;
 *   3. the guard re-arms on the next edit and still asks on a link out, and after a second
 *      save ONE Back press lands on the library, which lists the new name.
 *
 * Red at step 1 with `revalidatePath` taken out of the update action (the <h1> keeps the
 * old name). Staff's probe, committed (2026-10-02), plus the same test for recipes.
 */

async function signIn(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
}

function history(page: Page) {
  return page.evaluate(() => ({
    guard: !!(window.history.state as { evoliUnsavedGuard?: boolean } | null)?.evoliUnsavedGuard,
    url: location.pathname,
  }));
}

function countRouterTraffic(page: Page) {
  const seen = { actions: 0, rscGets: 0 };
  page.on("request", (r) => {
    const h = r.headers();
    if (h["next-action"]) seen.actions += 1;
    else if (r.method() === "GET" && h["rsc"] === "1" && h["next-router-prefetch"] !== "1") seen.rscGets += 1;
  });
  return seen;
}

interface Editor {
  library: string;
  libraryPattern: RegExp;
  editorPattern: RegExp;
  nameLabel: string;
  save: string;
  saved: string;
  back: string;
}

async function renameSaveAndLeave(page: Page, e: Editor) {
  await signIn(page);
  await page.goto(e.library);
  await page.getByRole("link", { name: "Edit" }).first().click();
  await page.waitForURL(e.editorPattern);
  const editorUrl = new URL(page.url()).pathname;
  const h1: Locator = page.locator("h1").first();
  const name = page.getByLabel(e.nameLabel);

  // (1) Rename with the sentinel armed, save: the server-rendered title follows.
  await name.fill("Probe renamed");
  await expect.poll(async () => (await history(page)).guard, { message: "sentinel armed" }).toBe(true);
  const traffic = countRouterTraffic(page);
  await page.getByRole("button", { name: e.save }).click();
  await expect(page.getByText(e.saved, { exact: true })).toBeVisible();
  await expect(h1, "the PageHead title, re-rendered by the action's own response").toHaveText("Probe renamed");

  // (2) History handed back clean, and the fresh title survives the popstate restore.
  await expect.poll(async () => (await history(page)).guard, { message: "sentinel released" }).toBe(false);
  await page.waitForTimeout(1_000);
  expect(await history(page)).toEqual({ guard: false, url: editorUrl });
  await expect(h1).toHaveText("Probe renamed");
  await expect(name).toHaveValue("Probe renamed");
  expect(traffic, "one action, and no refresh behind it").toEqual({ actions: 1, rscGets: 0 });

  // (3) The guard re-arms and still asks; a second save, then ONE Back is the library.
  await name.fill("Probe renamed 2");
  await expect.poll(async () => (await history(page)).guard).toBe(true);
  await page.getByRole("link", { name: e.back }).first().click();
  await expect(page.getByText("Leave with unsaved changes?")).toBeVisible();
  await page.getByRole("button", { name: "Stay on this page" }).click();
  expect(new URL(page.url()).pathname).toBe(editorUrl);
  await page.getByRole("button", { name: e.save }).click();
  await expect(h1).toHaveText("Probe renamed 2");
  await expect.poll(async () => (await history(page)).guard).toBe(false);
  await page.waitForTimeout(1_000);
  await page.goBack();
  await expect(page).toHaveURL(e.libraryPattern);
  await expect(page.getByText("Probe renamed 2", { exact: true })).toBeVisible();
  await expect(page.getByText("Leave with unsaved changes?")).toHaveCount(0);
}

test("template editor: a save re-renders the page title through its action, history clean, guard re-arms", async ({
  page,
}) => {
  await renameSaveAndLeave(page, {
    library: "/templates",
    libraryPattern: /\/templates$/,
    editorPattern: /\/templates\/[^/]+$/,
    nameLabel: "Template name",
    save: "Save template",
    saved: "Template saved",
    back: "Back to templates",
  });
});

test("recipe editor: a save re-renders the page title through its action, history clean, guard re-arms", async ({
  page,
}) => {
  await renameSaveAndLeave(page, {
    library: "/recipes",
    libraryPattern: /\/recipes$/,
    editorPattern: /\/recipes\/[^/]+$/,
    nameLabel: "Recipe name",
    save: "Save recipe",
    saved: "Recipe saved.",
    back: "Back to recipes",
  });
});

/**
 * 2a's inventory, pinned: 35 `router.refresh()` calls at 294e5fe, 22 removed, 13 kept.
 * Branch 1 (EV-337a, cd54fa6) then made sign-in, activation (x2) and sign-out hard
 * navigations (ADR-0033 D33.7), taking 4 more: 9 remain, and each follows a write that
 * does NOT revalidate (a 403, MEAL_CHANGED, PLACEMENT_OFF) or is the challenge poll or
 * Refresh button. (The release that merged both, b82c018, still pinned 13 and was red
 * here.) BUG-689 added one: the root error boundary's retry (`src/app/error.tsx`), which
 * follows no write at all: it asks the server for a fresh render after a server-side throw,
 * because `reset()` alone re-renders the failed payload. 10 now.
 * A new call is a decision: if its action revalidates, it renders the page a
 * second time for nothing. Comment lines are not counted.
 */
test("src holds exactly 10 router.refresh() calls (ADR-0033 2a's inventory, less branch 1's four, plus BUG-689's retry)", () => {
  const src = join(__dirname, "..", "src");
  const calls: string[] = [];
  for (const file of readdirSync(src, { recursive: true, encoding: "utf8" })) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    readFileSync(join(src, file), "utf8")
      .split("\n")
      .forEach((line, i) => {
        const code = line.trim();
        if (code.startsWith("*") || code.startsWith("//") || code.startsWith("/*")) return;
        if (code.includes("router.refresh()")) calls.push(`${file}:${i + 1}`);
      });
  }
  expect(calls.length, calls.sort().join("\n")).toBe(10);
});
