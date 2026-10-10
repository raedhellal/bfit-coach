import type { Page } from "@playwright/test";

/**
 * Holds the NEXT server-action POST the browser sends (a POST carrying `Next-Action`)
 * until `release()` — only that one: later requests pass straight through, so the
 * action's own follow-ups are never stalled. `reached` resolves when the held request
 * has left the page, which is the sync point: from then on the action is provably in
 * flight, with no latency guess and no race against a fast fixture.
 *
 * Fluidity batch 1 (F1): what a control says while its action runs.
 */
export async function holdNextAction(page: Page): Promise<{ reached: Promise<void>; release: () => void }> {
  let release!: () => void;
  const released = new Promise<void>((r) => (release = r));
  let arrived!: () => void;
  const reached = new Promise<void>((r) => (arrived = r));
  let held = false;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (!held && request.method() === "POST" && request.headers()["next-action"] !== undefined) {
      held = true;
      arrived();
      await released;
    }
    await route.fallback();
  });
  return { reached, release };
}
