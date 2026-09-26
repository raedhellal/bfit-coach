import { expect } from "@playwright/test";
import { test } from "./fixture-test";

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

test("both session cookies are httpOnly and unreadable from JavaScript", async ({ page, context }) => {
  await signIn(page);

  const cookies = await context.cookies();
  // BOTH cookies, not just the access token. The refresh token is the longer-lived
  // credential of the two — it mints access tokens for 30 days — so a refresh cookie
  // that lost `httpOnly` would be the worse leak of the pair, and asserting only the
  // access cookie would not notice.
  for (const name of ["evoli_pro_at", "evoli_pro_rt"]) {
    const cookie = cookies.find((c) => c.name === name);
    expect(cookie, `the ${name} cookie must exist`).toBeTruthy();
    expect(cookie!.httpOnly, `${name} must be httpOnly`).toBe(true);
    expect(cookie!.sameSite, `${name} must be SameSite=Lax`).toBe("Lax");
    expect(cookie!.path, `${name} must be scoped to /`).toBe("/");
  }

  // AC1: no token is reachable from the browser.
  const documentCookie = await page.evaluate(() => document.cookie);
  expect(documentCookie).not.toContain("evoli_pro_at");
  expect(documentCookie).not.toContain("evoli_pro_rt");
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

test("every control on the roster is a 44 px touch target at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  // BUG-146: "Invite a trainee" measured 38.0 px — AC1 asks for tappable at 390 px and
  // 44 px is the Apple HIG / WCAG 2.5.5 minimum.
  const invite = page.getByRole("button", { name: "Invite a trainee" });
  const box = await invite.boundingBox();
  expect(box, "the invite button must be laid out").not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  // The floor lives in the kit's Button, not in this one call site, so assert it for
  // every button on the screen — a second control regressing is the same bug.
  const heights = await page
    .locator("button")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(heights.length).toBeGreaterThan(0);
  for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
});

test("the invite modal shows a link, a QR code and the expiry sentence", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Invite a trainee" }).click();

  const link = page.getByLabel("Invite link");
  await expect(link).toBeVisible();
  const url = await link.inputValue();
  // AC3: the coach's display name rides on the link as ?coach=, because b-fit-api has no
  // pre-accept lookup for an invite token and the app's consent screen has to name the
  // coach before the trainee accepts. The fixture coach is "Alex R.".
  expect(url).toMatch(/^http:\/\/localhost:\d+\/i\/[A-Za-z0-9_-]{43}\?coach=Alex(%20|\+)R\.$/);

  // AC2, verbatim.
  await expect(page.getByText("This link works once and expires in 7 days.")).toBeVisible();
  await expect(page.getByText("Expires in 7 days · single use")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeVisible();

  // The QR must actually be drawn (a data: URL from the local `qrcode` dependency),
  // not a placeholder and not a remote image.
  const qr = page.getByRole("img", { name: "QR code for the invite link" });
  await expect(qr).toBeVisible();
  await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/);

  // Nothing inert in the modal: email sending is NOT in the demo (EV-183 "NOT in the
  // demo" item 7), so there is no disabled control inviting the question on stage.
  await expect(page.getByRole("button", { name: /email/i })).toHaveCount(0);
  // The roster behind it is the empty scenario (0 / 2), so nothing on this screen is
  // legitimately disabled either — one page-wide assertion covers the modal.
  await expect(page.locator("button[disabled]")).toHaveCount(0);
});
