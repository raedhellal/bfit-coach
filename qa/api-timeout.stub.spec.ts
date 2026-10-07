import { expect, test, type Page } from "@playwright/test";
import { signInThroughForm } from "./sign-in";

/**
 * BUG-690 (audit A3) — a stalled api read ends in the page's load-error state, within the
 * read bound plus 1 s, and a read under the bound is unaffected.
 *
 * Runs in `playwright.timeout.config.ts`: the portal in LIVE mode against
 * `qa/stall-api.mjs`, which can hold the roster read (`GET /coach-portal/clients`) for a
 * set time or never answer it. The fixture cannot prove this: it never calls `apiFetch`.
 *
 * Before the fix the stalled read had no bound, so the document never finished and the
 * error never came (the test fails at the 9 s line); after it, `apiFetch` abandons the
 * read at `API_READ_TIMEOUT_MS` and the stub sees the connection closed unanswered.
 */

const API = process.env.STALL_API_ORIGIN || `http://localhost:${process.env.STALL_API_PORT || "8096"}`;
/** `API_READ_TIMEOUT_MS` in src/lib/apiFetch.ts (not imported: that module is server-only). */
const READ_BOUND_MS = 8_000;

const L = {
  en: { loadError: "The roster could not be loaded.", retry: "Reload" },
  fr: { loadError: "La liste des clients n'a pas pu être chargée.", retry: "Recharger" },
} as const;

async function hold(page: Page, ms: number) {
  const res = await page.request.get(`${API}/__hold?ms=${ms}`);
  expect(res.status()).toBe(200);
}

async function stats(page: Page): Promise<{ clientsRequests: number; clientsAbandoned: number }> {
  return (await page.request.get(`${API}/__stats`)).json();
}

for (const lang of ["en", "fr"] as const) {
  test.describe(`BUG-690 (${lang})`, () => {
    test.use({ locale: lang === "en" ? "en-US" : "fr-FR" });

    test.beforeEach(async ({ page }) => {
      expect((await page.request.get(`${API}/__reset`)).status()).toBe(200);
      await signInThroughForm(page, { lang });
    });

    test("a roster read held under the bound is unaffected", async ({ page }) => {
      await hold(page, 1_500);
      const t0 = Date.now();
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText(L[lang].loadError, { exact: true })).toHaveCount(0);
      // The roster really rendered, from the held answer.
      await expect(page.getByText(new RegExp(`^0 / 2 profil`))).toBeVisible();
      expect(Date.now() - t0, "the read really was held").toBeGreaterThanOrEqual(1_500);
      const s = await stats(page);
      expect(s.clientsAbandoned, "a read under the bound is never abandoned").toBe(0);
    });

    test("a roster read that never answers shows the load error within the bound + 1 s", async ({ page }) => {
      // Warm the route (next dev compiles it on first request) so the bound is what is timed.
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const before = await stats(page);

      await hold(page, -1);
      const t0 = Date.now();
      await page.goto("/", { waitUntil: "commit" });
      const error = page.getByText(L[lang].loadError, { exact: true });
      await expect(error).toBeVisible({ timeout: READ_BOUND_MS + 1_000 });
      const elapsed = Date.now() - t0;
      test.info().annotations.push({ type: "load-error-after-ms", description: String(elapsed) });
      expect(elapsed, `the load error took ${elapsed} ms`).toBeLessThanOrEqual(READ_BOUND_MS + 1_000);
      expect(elapsed, "it waited for the bound, not for something else").toBeGreaterThanOrEqual(READ_BOUND_MS - 250);

      // The existing load-error state, with its way out.
      await expect(page.getByRole("link", { name: L[lang].retry })).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);

      // The PORTAL gave up: the stub saw the roster request closed unanswered.
      await expect
        .poll(async () => (await stats(page)).clientsAbandoned - before.clientsAbandoned)
        .toBe(1);
    });
  });
}
