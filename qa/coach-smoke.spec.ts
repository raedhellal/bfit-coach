import { expect, test } from "@playwright/test";

/**
 * EV-183 WP-4 smoke — login redirect, the roster empty state, and the invite modal.
 * Fixture mode (see playwright.config.ts): no api, no database.
 *
 * These assert the AC sentences verbatim. If one of them fails after a copy edit, the
 * copy edit is the bug — src/lib/copy.ts's AC-marked strings are the story's text.
 */

const EMAIL = "coach@evoli.fit";
const PASSWORD = "Password123!";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test("an unauthenticated visitor is redirected to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("a deep link to a trainee overview is guarded too", async ({ page }) => {
  await page.goto("/clients/6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001");
  await expect(page).toHaveURL(/\/login$/);
});

test("signing in lands on the roster empty state with the capacity meter", async ({ page }) => {
  await signIn(page);

  // AC1: the app header reads exactly "Evoli Pro".
  await expect(page.getByRole("banner").getByText("Evoli Pro", { exact: true })).toBeVisible();
  // AC1: the empty state and its primary action, verbatim.
  await expect(page.getByText("No trainees yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite a trainee" })).toBeVisible();
  // AC1: the capacity meter, verbatim.
  await expect(page.getByText("0 / 2 profiles · Starter", { exact: true })).toBeVisible();
});

test("the session cookie is httpOnly and unreadable from JavaScript", async ({ page, context }) => {
  await signIn(page);

  const cookies = await context.cookies();
  const access = cookies.find((c) => c.name === "evoli_pro_at");
  expect(access, "the access-token cookie must exist").toBeTruthy();
  expect(access!.httpOnly).toBe(true);
  expect(access!.sameSite).toBe("Lax");

  // AC1: no token is reachable from the browser.
  const documentCookie = await page.evaluate(() => document.cookie);
  expect(documentCookie).not.toContain("evoli_pro_at");
  const storage = await page.evaluate(() => JSON.stringify(window.localStorage));
  expect(storage).toBe("{}");
});

test("the roster is readable at 390 px with no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  await expect(page.getByText("0 / 2 profiles · Starter", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite a trainee" })).toBeVisible();

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflows, "the page must not scroll sideways at 390 px").toBe(false);
});

test("the invite modal shows a link, a QR code and the expiry sentence", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Invite a trainee" }).click();

  const link = page.getByLabel("Invite link");
  await expect(link).toBeVisible();
  const url = await link.inputValue();
  expect(url).toMatch(/^http:\/\/localhost:\d+\/i\/[A-Za-z0-9_-]{43}$/);

  // AC2, verbatim.
  await expect(page.getByText("This link works once and expires in 7 days.")).toBeVisible();
  await expect(page.getByText("Expires in 7 days · single use")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();

  // The QR must actually be drawn (a data: URL from the local `qrcode` dependency),
  // not a placeholder and not a remote image.
  const qr = page.getByRole("img", { name: "QR code for the invite link" });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/);

  // "Send by email" is present but inert, with the reason on it.
  const email = page.getByRole("button", { name: "Send by email" });
  await expect(email).toBeDisabled();
  await expect(email).toHaveAttribute("title", "coming later");
});
