import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-862 — a READY routine proposal whose base moved reads as STALE after a reload, in FIXTURE mode.
 *
 * b-fit-api fix/bug862-proposal-stale-on-read @ 91ce14a7: `GET …/routine/ai-proposal` runs Keep's own
 * base check (ADR-0036 D36.4) on a non-expired READY proposal. The live plan moved (a publish), the
 * draft token is not the captured one (a draft save), or a NONE base now has a plan: status EXPIRED,
 * errorCode COACH_PROPOSAL_STALE, no proposal, no base document, no repairs. The portal maps EXPIRED
 * to its stale view (`RoutineAiPanel#viewOf`). The fixture's GET mirrors that read with the same
 * `aiBaseRefusal` its Keep uses; before, it said READY and offered a Keep that could only 409.
 *
 * Sentences are LITERALS from the story's copy table, never imported from `src/lib/copy.ts`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const ROUTE = (id: string) => `/clients/${id}/routine`;
const STALE = "Lina's programme changed after this suggestion was made. Try again to get a fresh one.";

async function cookie(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, domain: "localhost", path: "/" }]);
}
const panel = (page: Page) => page.getByTestId("routine-ai-panel");
const diff = (page: Page) => panel(page).getByTestId("routine-ai-diff");

type AiDiscard = { clientId: string; proposalId: string | null; touched: boolean };
async function calls(page: Page): Promise<{ api: { op: string; arg: string | null }[]; aiDiscards: AiDiscard[] }> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  return res.json();
}

async function ready(page: Page, id: string) {
  await page.goto(ROUTE(id));
  await page.getByRole("button", { name: "Regenerate with AI", exact: true }).click();
  await panel(page).getByRole("button", { name: "Generate" }).click();
  await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
  await expect(diff(page)).toBeVisible();
}

/** The stale view, and nothing of the READY one: no comparison, no Keep. */
async function expectStale(page: Page) {
  await expect(panel(page)).toHaveAttribute("data-ai-state", "stale");
  await expect(panel(page).getByRole("alert")).toHaveText(STALE);
  await expect(panel(page).getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(diff(page)).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: "Keep" })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await cookie(page, "evoli_fixture_ai_caps", "on");
  await cookie(page, "evoli_fixture_ai_delay_ms", "0");
});

test.describe("BUG-862 — the read runs Keep's base check", () => {
  test("a publish after the suggestion, then a reload: the stale sentence with « Try again », no READY diff", async ({
    page,
  }) => {
    await ready(page, LINA);
    await page.getByLabel("Plan name").fill("Republished meanwhile");
    const bar = page.getByRole("region", { name: "Routine actions", exact: true });
    await bar.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Published. The trainee sees it next time they open the app.")).toBeVisible();
    await page.reload();
    await expectStale(page);
    // The read writes nothing: a second reload still reads the same proposal as stale.
    await page.reload();
    await expectStale(page);
  });

  test("a draft save after the suggestion, then a reload: the stale sentence with « Try again », no READY diff", async ({
    page,
  }) => {
    await ready(page, LINA);
    await page.getByLabel("Plan name").fill("Saved after the suggestion");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await page.reload();
    await expectStale(page);
    await expect(page.getByLabel("Plan name")).toHaveValue("Saved after the suggestion");
    // « Try again » after a reload: the brief lived in the island's state only, so it opens the
    // brief; Generate then makes a fresh proposal over the new draft, which reads READY.
    await panel(page).getByRole("button", { name: "Try again" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "brief");
    await panel(page).getByRole("button", { name: "Generate" }).click();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
    await expect(diff(page).getByText("Compared with your unpublished draft.")).toBeVisible();
  });

  test("control: an unchanged base stays READY across reloads", async ({ page }) => {
    await ready(page, LINA);
    for (let i = 0; i < 2; i += 1) {
      await page.reload();
      await expect(panel(page)).toHaveAttribute("data-ai-state", "ready");
      await expect(diff(page).getByText("Compared with the published plan.")).toBeVisible();
      await expect(panel(page).getByRole("button", { name: "Keep" })).toBeVisible();
    }
  });

  test("a normal Keep removes the proposal (BUG-868), so a reload reads idle, not stale", async ({ page }) => {
    await ready(page, LINA);
    await panel(page).getByRole("button", { name: "Keep" }).click();
    await expect(page.getByTestId("routine-ai-drafted")).toBeVisible();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
    await page.reload();
    await expect(page.getByTestId("routine-ai-drafted")).toBeVisible();
    await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
    await expect(panel(page).getByRole("alert")).toHaveCount(0);
    const { api, aiDiscards } = await calls(page);
    expect(api.some((e) => e.op === "keepRoutineAiProposal" && e.arg === LINA)).toBe(true);
    // BUG-868 (api main @ 4f7be130): Keep already removed it, so the cleanup DELETE touches nothing.
    expect(aiDiscards.at(-1)).toMatchObject({ clientId: LINA, touched: false });
  });
});
