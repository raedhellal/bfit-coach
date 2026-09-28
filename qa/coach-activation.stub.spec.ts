import { expect, test, type Page } from "@playwright/test";

/**
 * EV-278c in LIVE mode (`playwright.activation.config.ts`, `npm run test:e2e:activation`),
 * against `qa/activation-stub-api.mjs` — a stub of b-fit-api `c69c287`'s PENDING
 * allowlist, `token_version` and throttle. The fixture suite
 * (`qa/coach-activation.spec.ts`) owns the screen's states; this file owns what only the
 * live code path does. Imports `test` from `@playwright/test`: there is no fixture store
 * here (exempt in `qa/fixture-isolation.spec.ts`); each test resets the STUB instead.
 */

const STUB = `http://localhost:${process.env.ACTIVATION_STUB_PORT || "8097"}`;
const TEMP = "Temp-pass-2026";
const NEW_PASSWORD = "Coach-pass-2026";

interface Journal {
  journal: Array<{ method: string; path: string; roles: string[] | null }>;
  pendingPortalRefusals: number;
  activationBodies: Array<{
    email: string;
    keys: string[];
    consentAccepted: unknown;
    privacyPolicyVersion: unknown;
    termsVersion: unknown;
  }>;
  tokenVersions: Record<string, number>;
}

async function stub(page: Page, path: string) {
  const res = await page.request.get(`${STUB}${path}`);
  expect(res.ok(), `stub ${path}`).toBe(true);
  return res.json();
}
const journal = (page: Page) => stub(page, "/__journal") as Promise<Journal>;

function claims(token: string | undefined) {
  const part = String(token).split(".")[1] ?? "";
  return JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
    roles?: string[];
    tv?: number;
  };
}

async function cookie(page: Page, name: string) {
  return (await page.context().cookies()).find((c) => c.name === name)?.value;
}

async function signInPending(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEMP);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/activate$/);
}

async function fillAndSubmit(page: Page) {
  await page.getByLabel("Temporary password").fill(TEMP);
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Repeat the new password").fill(NEW_PASSWORD);
  await page.getByRole("checkbox", { name: "I agree to the Terms of Service and the Privacy Policy." }).check();
  await page.getByRole("button", { name: "Finish my account" }).click();
}

test.beforeEach(async ({ page }) => {
  await stub(page, "/__reset");
});

test("live: the sign-in asks GET /me/activation with the pending token, and the pending session never calls /coach-portal", async ({
  page,
}) => {
  await signInPending(page, "pending@stub.test");
  // The screen is drawn from the api's answers, not from constants.
  await expect(page.getByText("Evoli set up this Evoli Pro account for you.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Terms of Service (version v1.7)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy Policy (version v2.3)" })).toBeVisible();

  for (const path of ["/", "/templates", "/recipes", "/clients/6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/activate$/);
  }

  const j = await journal(page);
  const activationReads = j.journal.filter((e) => e.path === "/me/activation");
  expect(activationReads.length, "one at sign-in, then one per render of /activate").toBeGreaterThanOrEqual(2);
  expect(activationReads.every((e) => JSON.stringify(e.roles) === '["PENDING"]')).toBe(true);
  // The first read happens before the session cookie exists: it came from /auth/login's token.
  const loginAt = j.journal.findIndex((e) => e.path === "/auth/login");
  const firstRead = j.journal.findIndex((e) => e.path === "/me/activation");
  expect(firstRead).toBeGreaterThan(loginAt);
  expect(j.pendingPortalRefusals, "no /coach-portal call was ever made with the PENDING token").toBe(0);
  expect(j.journal.filter((e) => e.path.startsWith("/coach-portal/"))).toEqual([]);
});

test("live: activation sends the displayed versions and no role, swaps the session to COACH tokens, and retires the pending refresh token", async ({
  page,
}) => {
  await signInPending(page, "pending@stub.test");
  const pendingRefresh = await cookie(page, "evoli_pro_rt");
  expect(claims(await cookie(page, "evoli_pro_at")).roles).toEqual(["PENDING"]);

  await fillAndSubmit(page);
  await page.waitForURL(/\/$/);
  await expect(page.getByText("No trainees yet", { exact: true })).toBeVisible();

  const j = await journal(page);
  expect(j.activationBodies).toEqual([
    {
      email: "pending@stub.test",
      keys: ["consentAccepted", "newPassword", "privacyPolicyVersion", "temporaryPassword", "termsVersion"],
      consentAccepted: true,
      privacyPolicyVersion: "v2.3",
      termsVersion: "v1.7",
    },
  ]);
  // The roster was read with the FRESH token, never the pending one.
  const portal = j.journal.filter((e) => e.path.startsWith("/coach-portal/"));
  expect(portal.length).toBeGreaterThan(0);
  expect(portal.every((e) => JSON.stringify(e.roles) === '["COACH"]')).toBe(true);
  expect(j.pendingPortalRefusals).toBe(0);

  // Both cookies were replaced.
  const access = claims(await cookie(page, "evoli_pro_at"));
  expect(access.roles).toEqual(["COACH"]);
  expect(access.tv).toBe(1);
  expect(await cookie(page, "evoli_pro_rt")).not.toBe(pendingRefresh);
  // And the pending session's refresh token is dead at the api (token_version bumped).
  const replay = await page.request.post(`${STUB}/auth/refresh`, { data: { refreshToken: pendingRefresh } });
  expect(replay.status()).toBe(401);
});

test("live: a 429 reads Retry-After from the api's header — 61 s is 2 minutes, rounded up", async ({ page }) => {
  await signInPending(page, "throttled@stub.test");
  await fillAndSubmit(page);
  await expect(page.locator("form").getByRole("alert")).toHaveText("Too many attempts. Try again in 2 minutes.");
});

test("live: a 410 on submit shows the expiry, with who to ask", async ({ page }) => {
  await signInPending(page, "midway@stub.test");
  await fillAndSubmit(page);
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    "This account had to be finished by 27 Oct 2036, 09:30 UTC, and that time has passed. Ask Evoli to set it up again."
  );
  await expect(page.getByRole("button", { name: "Finish my account" })).toBeDisabled();
});

test("live: a wrong temporary password at sign-in is the ordinary refusal, and writes no cookie", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("pending@stub.test");
  await page.getByLabel("Password").fill("not-the-temporary-one");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Email or password is incorrect.");
  expect(await cookie(page, "evoli_pro_at")).toBeUndefined();
  const j = await journal(page);
  expect(j.journal.filter((e) => e.path === "/me/activation")).toEqual([]);
});
