import { expect, type Page } from "@playwright/test";

/**
 * EV-337f2 — opens every closed training day of the routine editor on the page (the
 * programme and the training-template editor share it).
 *
 * Since f2 a day other than day 1 is closed on load (F2.2), and a closed day's fields are
 * `hidden`: a spec written before f2 that edits day 2 or later needs the day opened first.
 * This is the ONE click such a spec adds (story F2.4: "a spec may add the click that opens
 * a day; it may not drop an assertion"). Retried, because a press before hydration opens
 * nothing.
 */
export async function openEveryDay(page: Page): Promise<void> {
  const closed = page.locator('.day-acc-head > button[aria-expanded="false"]');
  await expect(page.locator(".day-acc-head > button").first()).toBeVisible();
  await expect(async () => {
    const n = await closed.count();
    for (let i = 0; i < n; i += 1) await closed.first().click({ timeout: 1_000 });
    await expect(closed).toHaveCount(0, { timeout: 1_000 });
  }).toPass();
}
