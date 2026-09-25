import { expect } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-183 edge case 3 / ADR-0012 D5 — the invite landing page at /i/<token>.
 *
 * The three properties that matter and that a refactor could silently break:
 * it is PUBLIC (no middleware bounce to /login), the primary action is a real
 * custom-scheme <a href>, and the token — a single-use credential — is never
 * printed anywhere a screenshot, a screen reader or a shoulder could pick it up.
 */

const TOKEN = "abc";
const DEEP_LINK = `evolifit://my-coach/invite/${TOKEN}`;

test("the invite page renders without a session and never bounces to /login", async ({ page }) => {
  const res = await page.goto(`/i/${TOKEN}`);

  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`/i/${TOKEN}$`));
  await expect(page.getByRole("heading", { name: "Your coach invited you to Evoli" })).toBeVisible();
  // The wordmark is the trainee-facing app, not the back-office.
  await expect(page.getByText("Evoli Fit", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Evoli Pro", { exact: true })).toHaveCount(0);
});

test("the primary action is a real custom-scheme link and nothing auto-redirects", async ({
  page,
}) => {
  await page.goto(`/i/${TOKEN}`);

  const open = page.getByRole("link", { name: "Open in Evoli Fit" });
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute("href", DEEP_LINK);

  // iOS Safari needs a user gesture for a custom scheme: the page must still be the
  // page a second after load, not a navigation attempt.
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(new RegExp(`/i/${TOKEN}$`));

  // The fallback for a phone without the app, and no dead store link.
  await expect(
    page.getByText("Don't have the app yet? Install Evoli Fit, then open this link again.")
  ).toBeVisible();
  await expect(page.getByText("App Store and Google Play links coming soon.")).toBeVisible();
  const hrefs = await page.locator("a[href]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("href") || "")
  );
  expect(hrefs).toEqual([DEEP_LINK]);
});

test("the token appears only inside the deep-link href, never as text", async ({ page }) => {
  // A token long and distinctive enough that a stray render cannot hide in prose.
  const token = "Zm9vYmFyLXRva2VuLTEyMzQ1Njc4OTA";
  await page.goto(`/i/${token}`);

  const body = await page.locator("body").innerText();
  expect(body).not.toContain(token);
  expect(await page.title()).not.toContain(token);

  const withToken = await page.locator("a[href]").evaluateAll((els, t) =>
    els.map((el) => el.getAttribute("href") || "").filter((h) => h.includes(t as string)),
    token
  );
  expect(withToken).toEqual([`evolifit://my-coach/invite/${token}`]);
});

test("the invite page fits 390 px with a full-width tap target", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/i/${TOKEN}`);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflows, "the page must not scroll sideways at 390 px").toBe(false);

  const box = await page.getByRole("link", { name: "Open in Evoli Fit" }).boundingBox();
  expect(box).toBeTruthy();
  // Apple's minimum tap target is 44 px.
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test("the public invite page answers GET but refuses any other method", async ({ request }) => {
  // /i/* stays inside the middleware matcher and is let through explicitly there, so
  // "public" is a statement in code rather than a gap in a regex — and the statement
  // can be narrowed. The page is a read; a POST to a URL that carries a single-use
  // credential is refused rather than served.
  const get = await request.get(`/i/${TOKEN}`);
  expect(get.status()).toBe(200);

  const post = await request.post(`/i/${TOKEN}`);
  expect(post.status()).toBe(405);
  expect(post.headers()["allow"]).toBe("GET, HEAD");

  const head = await request.head(`/i/${TOKEN}`);
  expect(head.status()).toBe(200);

  for (const method of ["PUT", "DELETE", "PATCH"] as const) {
    const res = await request.fetch(`/i/${TOKEN}`, { method });
    expect(res.status(), `${method} must be refused`).toBe(405);
  }
});
