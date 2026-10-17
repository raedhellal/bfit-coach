import { expect, type Page, type Route } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * Staff R2-1 (EV-186n) — a failed AI-panel chunk costs ONLY the panel.
 *
 * The panel is `next/dynamic` (`src/components/routine/RoutineEditor.tsx`), so its code is a
 * separate chunk. Deploy skew is the realistic failure: an open tab asks for a chunk hash the new
 * deploy removed. Before the fix the rejected import reached the route error boundary and the
 * WHOLE routine page became « Something went wrong », editor included (staff's probe,
 * `se-186bn/r2probe/gate.spec.ts`). After it, the panel's place carries one sentence and the
 * editor still edits and saves.
 *
 * PRODUCTION BUILD ONLY (`playwright.start.config.ts`): under `next dev` chunk names and
 * contents differ and are compiled on demand. The panel's chunk is found by CONTENT — the one
 * static chunk whose source carries the panel's test id `"routine-ai-panel"` — never by a hash.
 * The spec asserts it actually aborted something, so it cannot pass vacuously if the chunk is
 * renamed or inlined.
 *
 * Flag on: `evoli_fixture_ai_caps=on`, the fixture switch the AI specs use.
 * Sentences are LITERALS, never imported from `src/lib/copy.ts`.
 */

/** A plain two-day plan, no injuries (the fixture's Yusuf). */
const YUSUF = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0007";
const ROUTE = `/clients/${YUSUF}/routine`;
const UNAVAILABLE = "AI suggestions couldn't load. Reload the page to try again. Your plan is not affected.";

async function signInFlagOn(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await page.context().addCookies([{ name: "evoli_fixture_ai_caps", value: "on", domain: "localhost", path: "/" }]);
}

const exerciseRow = (page: Page, name: string) => page.getByRole("group", { name, exact: true });

interface DraftPut {
  clientId: string;
  outcome: string;
}
async function draftPuts(page: Page): Promise<DraftPut[]> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { draftPuts: DraftPut[] }).draftPuts;
}

/** Abort every static chunk whose source is the panel's; returns the aborted URLs. */
async function abortPanelChunk(page: Page): Promise<string[]> {
  const aborted: string[] = [];
  await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, async (route: Route) => {
    const res = await route.fetch();
    const body = await res.text();
    if (body.includes('"routine-ai-panel"')) {
      aborted.push(route.request().url());
      await route.abort();
      return;
    }
    await route.fulfill({ response: res, body });
  });
  return aborted;
}

test("control: with the chunk served, the flag-on page draws the AI panel", async ({ page }) => {
  await signInFlagOn(page);
  await page.goto(ROUTE);
  await expect(page.getByTestId("routine-ai-panel").getByRole("button", { name: "Regenerate with AI" })).toBeEnabled();
  await expect(page.getByTestId("routine-ai-panel-unavailable")).toHaveCount(0);
});

test("R2-1: panel chunk aborted — the editor renders, edits and saves a draft; only the panel is replaced", async ({
  page,
}) => {
  await signInFlagOn(page);
  const aborted = await abortPanelChunk(page);
  await page.goto(ROUTE);

  // The panel's place says what happened; it is drawn only once the client has hydrated.
  await expect(page.getByTestId("routine-ai-panel-unavailable")).toHaveText(UNAVAILABLE);
  expect(aborted.length, "the panel's chunk was requested and aborted").toBeGreaterThan(0);
  await expect(page.getByTestId("routine-ai-panel")).toHaveCount(0);

  // Not the route error boundary: the editor is there.
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
  await expect(page.locator(".prog-editor")).toHaveCount(1);
  await expect(page.getByText("Published plan")).toBeVisible();

  // Editing works…
  const sets = exerciseRow(page, "Goblet Squat").getByLabel("Sets");
  await sets.fill("5");
  await expect(page.getByText("Unsaved changes")).toBeVisible();

  // …and Save draft lands.
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText(/^Draft saved /)).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toHaveCount(0);
  const puts = (await draftPuts(page)).filter((p) => p.clientId === YUSUF);
  expect(puts.map((p) => p.outcome)).toEqual(["200"]);

  // The saved draft is the edited one (read back with the chunk still aborted).
  await page.reload();
  await expect(page.getByTestId("routine-ai-panel-unavailable")).toBeVisible();
  await expect(exerciseRow(page, "Goblet Squat").getByLabel("Sets")).toHaveValue("5");
});
