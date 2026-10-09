import { expect, type Page } from "@playwright/test";

/**
 * EV-337g1 G1.2 — the client nutrition page's targets card is CLOSED on load: it shows the
 * four values, and « Modifier les objectifs » / "Edit targets" opens the form in the card.
 * A spec that types into the targets form opens it first with this helper, and only this
 * (G1.5: "a spec may add the click on « Modifier les objectifs »; it may not drop an
 * assertion"). It clicks the real button inside the card's named region; it sets no state
 * and navigates nowhere.
 *
 * Retried, because a click before hydration does nothing (the form's fields are not in the
 * server HTML). Once the form is open the button is gone, so a retry never clicks twice.
 */
export const EDIT_TARGETS = /^(Edit targets|Modifier les objectifs)$/;
export const TARGETS_REGION = /^(Daily targets|Objectifs quotidiens)$/;

export async function openTargetsForm(page: Page): Promise<void> {
  const region = page.getByRole("region", { name: TARGETS_REGION });
  const field = region.getByRole("textbox", { name: /^Calories$/ });
  await expect(async () => {
    if ((await field.count()) === 0) await region.getByRole("button", { name: EDIT_TARGETS }).click({ timeout: 2_000 });
    await expect(field).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}
