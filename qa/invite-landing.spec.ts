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
const LITE_LINK = `evolifitlite://my-coach/invite/${TOKEN}`;

/**
 * EV-289 AC1 (+ AC3: the portal ships one locale, English, so both labels are asserted
 * verbatim here) — ADR-0027 D27.5d: the page offers both apps, full app first, with the
 * same token and the same `coach` query. Literals, never imported from copy.ts or
 * traineeApps.ts: if D-LITE-1 renames the lite app, this test is meant to go red and be
 * edited with the story.
 */
test("EV-289 AC1: two buttons in order, Evoli Fit then Evoli Fit Lite, same token and coach query", async ({
  page,
}) => {
  for (const [query, suffix] of [
    ["", ""],
    [`?coach=${encodeURIComponent("Alex R.")}`, "?coach=Alex%20R."],
  ] as const) {
    await page.goto(`/i/${TOKEN}${query}`);
    const links = page.getByRole("link");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAccessibleName("Open in Evoli Fit");
    await expect(links.nth(0)).toHaveAttribute("href", `${DEEP_LINK}${suffix}`);
    await expect(links.nth(1)).toHaveAccessibleName("Open in Evoli Fit Lite");
    await expect(links.nth(1)).toHaveAttribute("href", `${LITE_LINK}${suffix}`);
    // Order on screen, not only in the DOM: the full app's button is above the lite one.
    const [a, b] = [await links.nth(0).boundingBox(), await links.nth(1).boundingBox()];
    expect(a!.y + a!.height).toBeLessThanOrEqual(b!.y);
  }
});

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

  const open = page.getByRole("link", { name: "Open in Evoli Fit", exact: true });
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
  expect(hrefs).toEqual([DEEP_LINK, LITE_LINK]);
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
  expect(withToken).toEqual([
    `evolifit://my-coach/invite/${token}`,
    `evolifitlite://my-coach/invite/${token}`,
  ]);
});

test("the invite page fits 390 px with a full-width tap target", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/i/${TOKEN}`);

  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  expect(overflows, "the page must not scroll sideways at 390 px").toBe(false);

  for (const name of ["Open in Evoli Fit", "Open in Evoli Fit Lite"]) {
    const box = await page.getByRole("link", { name, exact: true }).boundingBox();
    expect(box, name).toBeTruthy();
    // Apple's minimum tap target is 44 px.
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
  }
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
