import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-321b on the default suite's `empty` fixture scenario: a coach with no trainee has no
 * challenge and nobody to invite. Both states are explicit, never a blank page. The
 * populated behaviour is `coach-challenges.spec.ts` (roster config).
 */

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@evoli.fit");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test("no challenges: the empty state, and a dialog that says there is nobody to invite", async ({ page }) => {
  await signIn(page);
  const res = await page.goto("/challenges");
  expect(res?.status()).toBe(200);
  await expect(page.getByText("No challenges yet", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "New challenge" }).click();
  const dialog = page.getByRole("dialog", { name: "New challenge" });
  await expect(dialog.getByText("You have no linked clients yet. Invite a client from the roster first.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create and invite" })).toBeDisabled();
});

test("an id that is not this coach's reads one sentence, whatever the reason", async ({ page }) => {
  await signIn(page);
  await page.goto("/challenges/00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("That challenge is not in your list.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to challenges" }).first()).toBeVisible();
});
