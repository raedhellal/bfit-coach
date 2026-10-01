import { expect, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoEnglish, signInFrench } from "./french";

/**
 * EV-241 — a mistyped portal URL shows a page with a way back, served 404.
 *
 *   AC1 — a signed-in coach: the portal's frame, "not found", a link to the roster.
 *   AC2 — a signed-out visitor: the link goes to /login. Middleware sends a signed-out
 *         request for any guarded path to /login before a page runs, so the only unknown
 *         paths they can reach are under the public `/i/` prefix.
 *   AC3 — the status is 404 (the failure clause: a 200 here is not done).
 *
 * Sentences are literals, never read from the dictionaries under test.
 */

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@evoli.fit");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

const UNKNOWN = ["/does-not-exist-route", "/clients/6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001/does-not-exist-route", "/challenges/a/b"];

test.describe("AC1 + AC3 — a signed-in coach", () => {
  for (const path of UNKNOWN) {
    test(`${path} is a 404 in the portal's frame with a way back to the roster`, async ({ page }) => {
      await signIn(page);
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page).toHaveURL(path);
      await expect(page.getByRole("heading", { name: "Page not found", level: 1 })).toBeVisible();
      await expect(page.getByText("There is no page at this address. Check the link, or go back to your clients.")).toBeVisible();
      // The portal's layout: its navigation and its sign-out are there.
      await expect(page.getByRole("navigation", { name: "Portal" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

      const back = page.getByRole("link", { name: "Back to your clients" });
      await expect(back).toHaveAttribute("href", "/");
      await back.click();
      await page.waitForURL("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
    });
  }

  // The story's own example path matches `/clients/[id]`: an id that is not the coach's is
  // the api's 403, served as "not in your list" (BUG-139). Pinned so the two never merge.
  test("/clients/<not an id> stays the 403 'not in your list' page, with its own way back", async ({ page }) => {
    await signIn(page);
    const response = await page.goto("/clients/does-not-exist-route");
    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("link", { name: "Back to roster" })).toHaveAttribute("href", "/");
  });
});

test.describe("AC2 + AC3 — a signed-out visitor", () => {
  test("an unknown public path is a 404 with a link to /login and no portal frame", async ({ page }) => {
    const response = await page.goto("/i/not-a-token/does-not-exist-route");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page not found", level: 1 })).toBeVisible();
    await expect(page.getByText("There is no page at this address. Check the link, or sign in to Evoli Pro.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Portal" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

    const link = page.getByRole("link", { name: "Go to sign-in" });
    await expect(link).toHaveAttribute("href", "/login");
    await link.click();
    await page.waitForURL("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("an unknown guarded path sends a signed-out visitor to /login, as every guarded path does", async ({ page }) => {
    await page.goto("/does-not-exist-route");
    await expect(page).toHaveURL("/login");
  });
});

test.describe("French (fr-FR)", () => {
  test.use({ locale: "fr-FR" });

  test("signed in: Page introuvable, the way back in French, no English", async ({ page }) => {
    await signInFrench(page);
    const response = await page.goto("/does-not-exist-route");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page introuvable", level: 1 })).toBeVisible();
    await expect(
      page.getByText("Aucune page ne correspond à cette adresse. Vérifiez le lien, ou revenez à vos clients.")
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour à vos clients" })).toHaveAttribute("href", "/");
    await expectNoEnglish(page, "the not-found page");
  });

  test("signed out: the link to sign in, in French", async ({ page }) => {
    const response = await page.goto("/i/not-a-token/does-not-exist-route");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Page introuvable", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Aller à la connexion" })).toHaveAttribute("href", "/login");
    await expectNoEnglish(page, "the signed-out not-found page");
  });
});
