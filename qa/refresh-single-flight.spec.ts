import { expect, test } from "@playwright/test";

/**
 * One render, one rotation (`src/lib/apiFetch.ts`).
 *
 * `/` fetches `/coach-portal/me` and `/coach-portal/clients` in a `Promise.all`. When
 * the access token has gone stale, both come back 401 in the same tick and both reach
 * the 401 fallback. Before the single-flight, that posted `/auth/refresh` twice with
 * the same refresh token; against an api that rotates, the second post is rejected and
 * the request it belonged to fails — a plain reload rendering the error card.
 *
 * Runs against qa/stub-api.mjs (playwright.refresh.config.ts), which counts the
 * refresh posts and rotates on each one. Not a fixture: no screen is built against it.
 */

const API = process.env.STUB_API_ORIGIN || "http://localhost:8098";

test.beforeEach(async ({ request }) => {
  await request.get(`${API}/__reset`);
});

test("two concurrent 401s on one render cause exactly one /auth/refresh", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("coach@evoli.fit");
  await page.getByLabel("Password").fill("Password123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");

  await expect(page.getByText("0 / 2 profiles · Starter", { exact: true })).toBeVisible();

  // Sign-in itself renders the roster more than once (the POST, then router.replace +
  // router.refresh), so the counter is zeroed here and exactly ONE further render — a
  // plain reload — is measured. The access cookie still holds the stale token, because
  // `apiFetch` cannot write the rotated one back during a render, so that reload
  // reproduces the 401 storm.
  await request.get(`${API}/__reset-count`);
  await page.reload();

  // Both roster calls 401'd and were replayed on the refreshed token: the roster
  // rendered, not the error card.
  await expect(page.getByText("0 / 2 profiles · Starter", { exact: true })).toBeVisible();
  await expect(page.getByText("The roster could not be loaded.")).toHaveCount(0);

  const count = await (await request.get(`${API}/__refresh-count`)).json();
  expect(count.count, "one render must refresh once, not once per api call").toBe(1);
});
