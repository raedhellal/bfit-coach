import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-868: Keep removes the proposal it kept. Runs in FIXTURE mode.
 *
 * b-fit-api main @ 4f7be130: after a successful Keep writes the draft, Keep deletes its own READY
 * proposal row in the same transaction (`WHERE id = :id AND status = 'READY'`, no quota release).
 * The next `GET …/routine/ai-proposal` reads NONE, whether or not the portal's cleanup DELETE
 * arrives. The fixture's Keep mirrors this (`routineAiKeepRemoves`). The witness that Keep itself
 * removed P is the journal: the portal's cleanup DELETE runs AFTER Keep's 200 and finds nothing
 * (`touched: false`). Before this fix it found P READY and deleted it (`touched: true`).
 *
 * After Keep and a reload the panel offers no proposal. It is idle: no READY comparison, no Keep,
 * no stale sentence, no proposal id. EN and FR.
 *
 * Sentences are LITERALS from the story's copy table, never imported from `src/lib/copy.ts`.
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const ROUTE = (id: string) => `/clients/${id}/routine`;

async function cookie(page: Page, name: string, value: string) {
  await page.context().addCookies([{ name, value, domain: "localhost", path: "/" }]);
}
const panel = (page: Page) => page.getByTestId("routine-ai-panel");

type AiDiscard = { clientId: string; proposalId: string | null; touched: boolean };
async function calls(page: Page): Promise<{ api: { op: string; arg: string | null }[]; aiDiscards: AiDiscard[] }> {
  const res = await page.request.get("/api/fixture/calls", { maxRedirects: 0 });
  return res.json();
}

const LOCALES = [
  {
    name: "English",
    locale: null,
    open: "Regenerate with AI",
    generate: "Generate",
    keep: "Keep",
    retry: "Try again",
    disclosure: /^Drafted with AI on .+\. Review it before you publish — you're the author\.$/,
  },
  {
    name: "French",
    locale: "fr",
    open: "Régénérer avec l'IA",
    generate: "Générer",
    keep: "Garder",
    retry: "Réessayer",
    disclosure: /^Préparé avec l'IA le .+\. Relisez-le avant de publier\s: vous en êtes l'auteur\.$/,
  },
] as const;

test.beforeEach(async ({ page }) => {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
  await cookie(page, "evoli_fixture_ai_caps", "on");
  await cookie(page, "evoli_fixture_ai_delay_ms", "0");
});

test.describe("BUG-868: Keep removes the kept proposal", () => {
  for (const l of LOCALES) {
    test(`${l.name}: Keep, then a reload, shows no proposal; the cleanup DELETE finds nothing left`, async ({ page }) => {
      if (l.locale) await cookie(page, "evoli_pro_locale", l.locale);
      await page.goto(ROUTE(LINA));
      await page.getByRole("button", { name: l.open, exact: true }).click();
      await panel(page).getByRole("button", { name: l.generate, exact: true }).click();
      await expect(panel(page)).toHaveAttribute("data-ai-state", "ready", { timeout: 10_000 });
      const kept = await panel(page).getAttribute("data-proposal-id");
      expect(kept).toMatch(/^[0-9a-f-]{36}$/);

      await panel(page).getByRole("button", { name: l.keep, exact: true }).click();
      await expect(page.getByTestId("routine-ai-drafted")).toHaveText(l.disclosure);
      await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");

      // Keep had already removed P when the portal's cleanup DELETE (naming P) arrived.
      const { api, aiDiscards } = await calls(page);
      expect(api.some((e) => e.op === "keepRoutineAiProposal" && e.arg === LINA)).toBe(true);
      expect(aiDiscards.at(-1)).toEqual({ clientId: LINA, proposalId: kept, touched: false });

      for (let i = 0; i < 2; i += 1) {
        await page.reload();
        await expect(page.getByTestId("routine-ai-drafted")).toHaveText(l.disclosure);
        await expect(panel(page)).toHaveAttribute("data-ai-state", "idle");
        await expect(panel(page)).not.toHaveAttribute("data-proposal-id", /.+/);
        await expect(panel(page).getByTestId("routine-ai-diff")).toHaveCount(0);
        await expect(panel(page).getByRole("button", { name: l.keep, exact: true })).toHaveCount(0);
        await expect(panel(page).getByRole("button", { name: l.retry, exact: true })).toHaveCount(0);
        await expect(panel(page).getByRole("alert")).toHaveCount(0);
        await expect(panel(page).getByRole("button", { name: l.open, exact: true })).toBeVisible();
      }
    });
  }
});
