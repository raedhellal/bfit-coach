import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { signInThroughForm } from "./sign-in";

/**
 * EV-204b on the POPULATED roster (playwright.roster.config.ts): six clients against a
 * Starter capacity of two, so every profile is in use. What this file pins is Ruling 2 —
 * an Invited person is NOT a client: the Invited section sits apart from the groups, and the
 * capacity meter, the nav count, the groups, the filters and the search never see it — and
 * that a full plan does not hide « Ajouter un client » (the api does not refuse it; the
 * link is refused at accept), it says what a full plan means for the new person.
 */

async function signIn(page: Page) {
  await signInThroughForm(page, { email: "coach@evoli.fit", password: "Password123!" });
}

test("a full plan: « Add a client » stays available and says what full means; the link invite stays refused", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("4 / 2 profiles · Starter")).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite a trainee" })).toBeDisabled();
  await page.getByRole("button", { name: "Add a client", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a client" });
  await expect(dialog.locator("[data-add-client-capacity]")).toHaveText(
    "Starter includes 2 profiles, all in use. They can still finish their account, but can join you only once a place is free."
  );
});

test("Ruling 2: the Invited section is apart from the groups, and nothing that counts clients counts it", async ({ page }) => {
  await signIn(page);
  const navCount = await page.locator(".shell-nav-count").first().textContent();
  const allChip = await page.getByRole("button", { name: /^All · \d+$/ }).textContent();
  const groups = await page.locator("section[data-roster-group]").count();

  await page.getByRole("button", { name: "Add a client", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a client" });
  await dialog.getByLabel("Name", { exact: true }).fill("Amal Haddad");
  await dialog.getByLabel("Email address", { exact: true }).fill("amal@example.com");
  await dialog.getByRole("button", { name: "Add client", exact: true }).click();
  await page.getByRole("dialog", { name: "Account set up" }).getByRole("button", { name: "Done" }).click();

  const section = page.locator("[data-invited-section]");
  await expect(section.getByRole("group", { name: "Amal Haddad" })).toBeVisible();
  // Above the groups, and not one of them.
  const sectionTop = (await section.boundingBox())!.y;
  const firstGroupTop = (await page.locator("section[data-roster-group]").first().boundingBox())!.y;
  expect(sectionTop).toBeLessThan(firstGroupTop);
  await expect(section).not.toHaveAttribute("data-roster-group", /.*/);
  await expect(page.locator("section[data-roster-group]")).toHaveCount(groups);

  await expect(page.getByText("4 / 2 profiles · Starter")).toBeVisible();
  await expect(page.locator(".shell-nav-count").first()).toHaveText(navCount!);
  await expect(page.getByRole("button", { name: /^All · \d+$/ })).toHaveText(allChip!);
  await expect(page.locator(".roster-row")).not.toContainText(["Amal Haddad"]);

  // The search is over clients: the invited name is not one.
  await page.getByRole("searchbox", { name: "Search clients" }).fill("Amal");
  await expect(page.getByText("No client matches.", { exact: true })).toBeVisible();
  await expect(section.getByRole("group", { name: "Amal Haddad" })).toBeVisible();
});
