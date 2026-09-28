import { expect, request, type Page } from "@playwright/test";
import { test } from "./fixture-test";
import { expectNoSidewaysScroll, expectUnoccluded } from "./layout";
import { isPendingOnly } from "../src/lib/jwt";
import { mintFixtureToken } from "../src/lib/fixtureToken";

/**
 * EV-278c AC11 — a coach whose account the admin initialised (EV-278a) finishes it on the
 * portal. Fixture mode (the default config, `empty` roster scenario).
 *
 * The fixture's pending accounts are addressed BY EMAIL (`PENDING_ACCOUNTS` in
 * `src/lib/coachApi.fixture.ts`); every one of them starts un-activated at each test,
 * because `./fixture-test` resets the store first. Their shapes mirror b-fit-api
 * `c69c287` (`AccountActivationUseCase`): the checks run in the api's order, so an
 * expired account answers 410 before its temporary password is looked at.
 *
 * What this file cannot prove, and where it is proven instead: the fixture never refuses
 * a PENDING token on `/coach-portal/*` (the real api does, 403), and it never sends a
 * `Retry-After` header over HTTP. `qa/coach-activation.stub.spec.ts` drives the LIVE code
 * path against a stub api that does both (`playwright.activation.config.ts`).
 */

const TEMP = "Temp-pass-2026";
const NEW_PASSWORD = "Coach-pass-2026";
const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";

async function signIn(page: Page, email: string, password = TEMP) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function signInPending(page: Page, email = "new.coach@evoli.fit") {
  await signIn(page, email);
  await page.waitForURL(/\/activate$/);
}

/**
 * The form's refusal line. Scoped to the FORM: Next's route announcer is also
 * `role="alert"` (an empty `#__next-route-announcer__`), so a page-wide `getByRole("alert")`
 * is two elements and proves nothing.
 */
const refusal = (page: Page) => page.locator("form").getByRole("alert");

const form = (page: Page) => ({
  temporary: page.getByLabel("Temporary password"),
  fresh: page.getByLabel("New password", { exact: true }),
  repeat: page.getByLabel("Repeat the new password"),
  consent: page.getByRole("checkbox", { name: "I agree to the Terms of Service and the Privacy Policy." }),
  submit: page.getByRole("button", { name: "Finish my account" }),
});

async function fillPasswords(page: Page, temporary = TEMP, fresh = NEW_PASSWORD, repeat = fresh) {
  const f = form(page);
  await f.temporary.fill(temporary);
  await f.fresh.fill(fresh);
  await f.repeat.fill(repeat);
}

/** Activation bodies the fixture api received, read with a COACH session of its own. */
async function recordedActivations(page: Page) {
  // The page's own cookie is a PENDING one; middleware sends it to /activate. Use a
  // separate context signed in as the ordinary fixture coach.
  const ctx = await request.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const login = await ctx.post("/api/auth/login", {
      data: { email: "coach@evoli.fit", password: "Password123!" },
      maxRedirects: 0,
    });
    expect(login.status()).toBe(200);
    const res = await ctx.get("/api/fixture/activations", { maxRedirects: 0 });
    expect(res.status(), "GET /api/fixture/activations").toBe(200);
    return (await res.json()) as {
      activations: Array<{
        email: string;
        keys: string[];
        consentAccepted: unknown;
        privacyPolicyVersion: unknown;
        termsVersion: unknown;
        outcome: string;
      }>;
    };
  } finally {
    await ctx.dispose();
  }
}

test.describe("EV-278c — a pending coach finishes the account on the portal", () => {
  test("AC11: a temporary-password sign-in lands on the activation screen, naming who set it up and when it expires", async ({
    page,
  }) => {
    await signInPending(page);
    await expect(page.getByRole("heading", { level: 1, name: "Finish your account" })).toBeVisible();
    await expect(page.getByText("Evoli set up this Evoli Pro account for you.", { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        "Finish it by 27 Oct 2036, 09:30 UTC. If it isn't finished by then, the account is deleted.",
        { exact: true }
      )
    ).toBeVisible();
    // No portal chrome: nothing on this screen leads to the roster.
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Roster" })).toHaveCount(0);
  });

  test("AC11: a pending session reaches the activation screen and nowhere else", async ({ page }) => {
    await signInPending(page);
    for (const path of ["/", `/clients/${LINA}`, `/clients/${LINA}/routine`, "/templates", "/recipes", "/clients/denied"]) {
      const response = await page.goto(path);
      await expect(page, `${path} must send a pending session back`).toHaveURL(/\/activate$/);
      expect(response?.status(), `${path} ends on the activation screen`).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: "Finish your account" })).toBeVisible();
      await expect(page.getByText("No trainees yet")).toHaveCount(0);
    }
    // The fixture test routes are behind the same guard.
    const direct = await page.request.get("/api/fixture/state", { maxRedirects: 0 });
    expect(direct.status(), "a pending cookie on a guarded API route is redirected").toBe(307);
    expect(direct.headers()["location"]).toMatch(/\/activate$/);
  });

  test("AC11: the button stays disabled until the policy is accepted — never pre-ticked", async ({ page }) => {
    await signInPending(page);
    const f = form(page);
    await expect(f.consent).not.toBeChecked();
    await expect(f.submit).toBeDisabled();

    await fillPasswords(page);
    await expect(f.submit, "all passwords filled, consent not given").toBeDisabled();

    await f.consent.check();
    await expect(f.submit).toBeEnabled();
    await f.consent.uncheck();
    await expect(f.submit, "unticking takes the consent back").toBeDisabled();

    // Nothing was sent while the box was unticked.
    expect((await recordedActivations(page)).activations).toEqual([]);
  });

  test("the activation endpoint itself refuses a body without an explicit consent, and sends nothing on", async ({
    page,
  }) => {
    await signInPending(page);
    for (const consentAccepted of [false, undefined, "true", 1]) {
      const res = await page.request.post("/api/auth/activate", {
        data: {
          temporaryPassword: TEMP,
          newPassword: NEW_PASSWORD,
          ...(consentAccepted === undefined ? {} : { consentAccepted }),
          privacyPolicyVersion: "v1.0",
          termsVersion: "v1.0",
        },
      });
      expect(res.status(), `consentAccepted=${JSON.stringify(consentAccepted)}`).toBe(400);
      expect((await res.json()).code).toBe("CONSENT_REQUIRED");
    }
    expect((await recordedActivations(page)).activations).toEqual([]);
    // Still pending: the account was not finished on anybody's behalf.
    await page.goto("/");
    await expect(page).toHaveURL(/\/activate$/);
  });

  test("a signed-in COACH posting to the activation endpoint is refused 409 before the api is asked", async ({
    page,
  }) => {
    // Staff mutant M2 (delete the handler's isPendingOnly 409) survived the suite: the
    // fixture api answers ACCOUNT_ALREADY_ACTIVE for a non-pending caller too, so the
    // status alone cannot tell the two apart. The witness is that NOTHING reached the api.
    const login = await page.request.post("/api/auth/login", {
      data: { email: "coach@evoli.fit", password: "Password123!" },
    });
    expect(login.status()).toBe(200);
    const res = await page.request.post("/api/auth/activate", {
      data: {
        temporaryPassword: TEMP,
        newPassword: NEW_PASSWORD,
        consentAccepted: true,
        privacyPolicyVersion: "v1.0",
        termsVersion: "v1.0",
      },
    });
    expect(res.status()).toBe(409);
    expect(await res.json()).toEqual({ code: "ACCOUNT_ALREADY_ACTIVE" });
    // This context's session is a coach's, so the witness route is reachable directly.
    const seen = await page.request.get("/api/fixture/activations", { maxRedirects: 0 });
    expect(seen.status()).toBe(200);
    expect((await seen.json()).activations, "the handler refused it; the api never saw it").toEqual([]);
  });

  test("AC11: the policy and terms links open the documents, labelled with the versions GET /legal/versions returned", async ({
    page,
  }) => {
    await signInPending(page);
    const terms = page.getByRole("link", { name: "Terms of Service (version v1.0)" });
    const privacy = page.getByRole("link", { name: "Privacy Policy (version v1.0)" });
    await expect(terms).toHaveAttribute("href", "https://evoli.fit/terms");
    await expect(privacy).toHaveAttribute("href", "https://evoli.fit/privacy");
    for (const link of [terms, privacy]) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", /noopener/);
    }
  });

  test("AC11: a successful activation sends the accepted versions and no role, and lands the coach on the roster", async ({
    page,
  }) => {
    await signInPending(page);
    const f = form(page);
    await fillPasswords(page);
    await f.consent.check();
    await f.submit.click();

    await page.waitForURL(/\/$/);
    await expect(page.getByText("No trainees yet", { exact: true })).toBeVisible();

    const { activations } = await recordedActivations(page);
    expect(activations).toHaveLength(1);
    expect(activations[0]).toMatchObject({
      email: "new.coach@evoli.fit",
      consentAccepted: true,
      privacyPolicyVersion: "v1.0",
      termsVersion: "v1.0",
      outcome: "ACTIVATED",
    });
    // The granted role comes from the api's row (D22.9a); the portal never names one.
    expect(activations[0].keys.sort()).toEqual(
      ["consentAccepted", "newPassword", "privacyPolicyVersion", "temporaryPassword", "termsVersion"].sort()
    );

    // The session now holds the fresh COACH tokens: the activation screen is behind it.
    await page.goto("/activate");
    await expect(page).toHaveURL(/\/$/);
    await page.goto(`/clients/${LINA}`);
    await expect(page).toHaveURL(new RegExp(`/clients/${LINA}$`));
  });

  test("a wrong temporary password is named, keeps the consent, and clears only the password fields", async ({
    page,
  }) => {
    await signInPending(page);
    const f = form(page);
    await fillPasswords(page, "not-the-one");
    await f.consent.check();
    await f.submit.click();

    await expect(refusal(page)).toHaveText(
      "That temporary password isn't right. Check the email we sent you."
    );
    await expect(page).toHaveURL(/\/activate$/);
    await expect(f.temporary).toHaveValue("");
    await expect(f.fresh).toHaveValue("");
    await expect(f.repeat).toHaveValue("");
    await expect(f.consent).toBeChecked();
  });

  test("reusing the temporary password as the new one is refused with its own sentence", async ({ page }) => {
    await signInPending(page);
    const f = form(page);
    await fillPasswords(page, TEMP, TEMP);
    await f.consent.check();
    await f.submit.click();
    await expect(refusal(page)).toHaveText(
      "Choose a new password that's different from the temporary one."
    );
    await expect(page).toHaveURL(/\/activate$/);
  });

  test("the new password is checked before anything is sent: 8 characters, typed twice the same", async ({ page }) => {
    await signInPending(page);
    const f = form(page);
    await f.consent.check();

    await fillPasswords(page, TEMP, "short", "short");
    await expect(page.getByText("At least 8 characters.", { exact: true })).toBeVisible();
    await expect(f.submit).toBeDisabled();

    await fillPasswords(page, TEMP, NEW_PASSWORD, `${NEW_PASSWORD}x`);
    await expect(page.getByText("The two new passwords don't match.", { exact: true })).toBeVisible();
    await expect(f.submit).toBeDisabled();

    await fillPasswords(page);
    await expect(f.submit).toBeEnabled();
  });

  /**
   * BUG-381 — b-fit-api's rule for `newPassword` is `@NotBlank @Size(min = 8, max = 128)`
   * (`ActivateAccountRequest`, origin/main `5f368d7`), and Hibernate Validator 8.0.1's
   * `NotBlankValidator` is `toString().trim().length() > 0`: Java's `trim()` strips every
   * char up to U+0020, so "blank" is "made only of chars ≤ U+0020" — spaces, tabs, line
   * breaks. It is NOT JavaScript's `trim()` (which also strips U+00A0 and the U+2000 run);
   * eight no-break spaces pass the api, so they must pass here. The api hashes the password
   * as sent (no trim), so a space at either end is part of the password and is allowed.
   */
  test("BUG-381: a new password of only spaces or tabs is refused before anything is sent, naming that rule", async ({
    page,
  }) => {
    await signInPending(page);
    const f = form(page);
    await f.consent.check();
    for (const blank of [" ".repeat(8), "\t".repeat(8), " \t".repeat(6), "   "]) {
      await fillPasswords(page, TEMP, blank, blank);
      await expect(
        page.getByText("Your new password can't be only spaces.", { exact: true }),
        `${JSON.stringify(blank)} names the rule it broke`
      ).toBeVisible();
      await expect(page.getByText("Your new password must be 8 to 128 characters.")).toHaveCount(0);
      await expect(f.submit, JSON.stringify(blank)).toBeDisabled();
      // Enter in a field submits a form even with its button disabled; nothing may leave.
      await f.repeat.press("Enter");
    }
    // The temporary password is `@NotBlank` too: spaces there can never be the right one.
    await fillPasswords(page, " ".repeat(8), NEW_PASSWORD, NEW_PASSWORD);
    await expect(f.submit, "a blank temporary password").toBeDisabled();
    await f.repeat.press("Enter");
    await fillPasswords(page);
    await expect(f.submit, "and a real one enables it").toBeEnabled();
    await expect(refusal(page)).toHaveCount(0);
    expect((await recordedActivations(page)).activations, "nothing reached the api").toEqual([]);
  });

  test("BUG-381: the blank rule is the api's and no stricter — spaces at the ends and no-break spaces are allowed", async ({
    page,
  }) => {
    await signInPending(page);
    const f = form(page);
    await f.consent.check();
    const nbsp = String.fromCharCode(0xa0);
    for (const ok of [" abcdefg", "abcdefg ", `  ${NEW_PASSWORD}  `, nbsp.repeat(8)]) {
      await fillPasswords(page, TEMP, ok, ok);
      await expect(page.getByText("Your new password can't be only spaces.")).toHaveCount(0);
      await expect(f.submit, JSON.stringify(ok)).toBeEnabled();
    }
    // And one of them really finishes the account: the spaces are part of the password.
    await fillPasswords(page, TEMP, `  ${NEW_PASSWORD}  `);
    await f.submit.click();
    await page.waitForURL(/\/$/);
  });

  test("BUG-381: the api's blank refusal is answered as blank, never as a length the password met", async ({
    page,
  }) => {
    await signInPending(page);
    const post = (temporaryPassword: string, newPassword: string) =>
      page.request.post("/api/auth/activate", {
        data: { temporaryPassword, newPassword, consentAccepted: true, privacyPolicyVersion: "v1.0", termsVersion: "v1.0" },
      });

    // 8 and 128 chars meet @Size, so the one constraint left to refuse them is @NotBlank.
    for (const blank of [" ".repeat(8), "\t".repeat(8), " ".repeat(128)]) {
      const res = await post(TEMP, blank);
      expect(res.status(), JSON.stringify(blank)).toBe(400);
      expect((await res.json()).code, JSON.stringify(blank)).toBe("PASSWORD_BLANK");
    }
    // Too short and blank: the length sentence is true, so it stays.
    const short = await post(TEMP, "   ");
    expect(short.status()).toBe(400);
    expect((await short.json()).code).toBe("VALIDATION_ERROR");
    // A blank TEMPORARY password is a wrong one, not a new-password length.
    const temp = await post(" ".repeat(8), NEW_PASSWORD);
    expect(temp.status()).toBe(400);
    expect((await temp.json()).code).toBe("TEMPORARY_PASSWORD_INVALID");

    // The api WAS asked each time: this is the mapping of its refusal, not a portal pre-check.
    const { activations } = await recordedActivations(page);
    expect(activations.map((a) => a.outcome)).toEqual(Array(5).fill("VALIDATION_ERROR"));
  });

  test("an expired account says so, names who can set it up again, and offers no form", async ({ page }) => {
    await signInPending(page, "expired.coach@evoli.fit");
    await expect(page.getByRole("heading", { level: 1, name: "This account has expired" })).toBeVisible();
    await expect(
      page.getByText(
        "It had to be finished by 1 Aug 2026, 09:30 UTC, and that time has passed. Ask Evoli to set it up again.",
        { exact: true }
      )
    ).toBeVisible();
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByLabel("Temporary password")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Finish my account" })).toHaveCount(0);
    // Still confined: an expired pending session reaches nothing else either.
    await page.goto("/");
    await expect(page).toHaveURL(/\/activate$/);
    // And the way out works.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an account that expires while the form is open answers 410 with the same message", async ({ page }) => {
    await signInPending(page, "expires.midway@evoli.fit");
    const f = form(page);
    await fillPasswords(page);
    await f.consent.check();
    await f.submit.click();
    await expect(refusal(page)).toHaveText(
      "This account had to be finished by 27 Oct 2036, 09:30 UTC, and that time has passed. Ask Evoli to set it up again."
    );
    await expect(f.submit).toBeDisabled();
  });

  test("a trainee's pending account is refused on the portal and pointed at the app, with no session", async ({
    page,
  }) => {
    await signIn(page, "pending.trainee@evoli.fit");
    await expect(refusal(page)).toHaveText(
      "This account is not an Evoli Pro coach account. Finish setting it up in the Evoli Fit app."
    );
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/activate");
    await expect(page, "no cookie was written, so the guard sends it to /login").toHaveURL(/\/login$/);
  });

  test("a pending account with no initialisation record is refused at sign-in with a way to reach us", async ({
    page,
  }) => {
    await signIn(page, "orphan.pending@evoli.fit");
    await expect(refusal(page)).toHaveText(
      "We can't finish this account here. Write to support@evoli.fit and we'll sort it out."
    );
    await page.goto("/activate");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the activation throttle says how long to wait and holds the button", async ({ page }) => {
    await signInPending(page, "throttled.coach@evoli.fit");
    const f = form(page);
    await fillPasswords(page);
    await f.consent.check();
    await f.submit.click();
    // Retry-After 599 s → rounded UP to 10 minutes (EV-204 AC-P5c, mirrored).
    await expect(refusal(page)).toHaveText("Too many attempts. Try again in 10 minutes.");
    await fillPasswords(page);
    await expect(f.submit, "held until Retry-After has passed").toBeDisabled();
  });

  test("a policy revised while the form was open is re-presented and must be accepted again", async ({ page }) => {
    await signInPending(page, "stale.coach@evoli.fit");
    const f = form(page);
    await fillPasswords(page);
    await f.consent.check();
    await f.submit.click();

    await expect(refusal(page)).toHaveText(
      "Our Terms of Service or Privacy Policy have changed. Please review them and accept the new version."
    );
    await expect(f.consent, "never resubmitted silently: the tick is taken back").not.toBeChecked();
    await expect(page.getByRole("link", { name: "Privacy Policy (version v1.1)" })).toBeVisible();
    await expect(f.submit).toBeDisabled();

    await fillPasswords(page);
    await f.consent.check();
    await f.submit.click();
    await page.waitForURL(/\/$/);

    const { activations } = await recordedActivations(page);
    expect(activations.map((a) => [a.privacyPolicyVersion, a.outcome])).toEqual([
      ["v1.0", "CONSENT_VERSION_STALE"],
      ["v1.1", "ACTIVATED"],
    ]);
  });

  test("keyboard only: every control is reachable in order, Space ticks the consent, Enter submits", async ({
    page,
  }) => {
    await signInPending(page);
    const f = form(page);
    await f.temporary.focus();
    await page.keyboard.type(TEMP);
    await page.keyboard.press("Tab");
    await expect(f.fresh).toBeFocused();
    await page.keyboard.type(NEW_PASSWORD);
    await page.keyboard.press("Tab");
    await expect(f.repeat).toBeFocused();
    await page.keyboard.type(NEW_PASSWORD);
    await page.keyboard.press("Tab");
    await expect(f.consent).toBeFocused();
    await page.keyboard.press("Space");
    await expect(f.consent).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /^Terms of Service/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: /^Privacy Policy/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(f.submit).toBeFocused();
    await f.repeat.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/$/);
  });

  for (const width of [1280, 375, 320]) {
    test(`layout at ${width}px: no sideways scroll, and the consent and submit are not painted over`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await signInPending(page);
      await expectNoSidewaysScroll(page, "activation screen");
      const f = form(page);
      await expectUnoccluded(page, f.consent, { label: "consent checkbox" });
      await expectUnoccluded(page, f.submit, { over: page.getByRole("link", { name: /^Privacy Policy/ }), label: "submit" });
      await expectUnoccluded(page, page.getByRole("link", { name: /^Terms of Service/ }), {
        over: page.getByRole("link", { name: /^Privacy Policy/ }),
        label: "terms link",
      });
      await expectUnoccluded(page, f.repeat, { over: f.consent, label: "repeat password" });
    });
  }
});

test.describe("EV-278c — the session checks behind /api/auth/*", () => {
  test("pending-only means EXACTLY [PENDING]: a token with PENDING beside COACH is not a pending session", () => {
    // Staff mutant M4 (`roles.includes("PENDING")`) survived: no writer mints this token
    // (User.withRoles refuses it, ADR-0022 K2), so no browser test can meet one.
    const as = (roles: string[]) => mintFixtureToken("x@evoli.fit", roles);
    expect(isPendingOnly(as(["PENDING"]))).toBe(true);
    expect(isPendingOnly(as(["PENDING", "COACH"]))).toBe(false);
    expect(isPendingOnly(as(["COACH", "PENDING"]))).toBe(false);
    expect(isPendingOnly(as(["PENDING", "PENDING"]))).toBe(false);
    expect(isPendingOnly(as(["COACH"]))).toBe(false);
    expect(isPendingOnly(as([]))).toBe(false);
    expect(isPendingOnly("not-a-jwt")).toBe(false);
    expect(isPendingOnly(null)).toBe(false);
  });

  const EVIL = "https://evil.example";
  const ACTIVATE_BODY = {
    temporaryPassword: TEMP,
    newPassword: NEW_PASSWORD,
    consentAccepted: true,
    privacyPolicyVersion: "v1.0",
    termsVersion: "v1.0",
  };

  test("a cross-origin sign-in is refused 403 and writes no cookie", async ({ page, baseURL }) => {
    for (const origin of [EVIL, "null", "http://localhost.evil.example"]) {
      const res = await page.request.post("/api/auth/login", {
        headers: { Origin: origin },
        data: { email: "coach@evoli.fit", password: "Password123!" },
      });
      expect(res.status(), `Origin: ${origin}`).toBe(403);
      expect(await res.json()).toEqual({ code: "CROSS_ORIGIN" });
      expect(res.headers()["set-cookie"], `Origin: ${origin}`).toBeUndefined();
    }
    expect(await page.context().cookies()).toEqual([]);

    // The same request from the portal's own origin is the ordinary sign-in.
    const own = await page.request.post("/api/auth/login", {
      headers: { Origin: new URL(String(baseURL)).origin },
      data: { email: "coach@evoli.fit", password: "Password123!" },
    });
    expect(own.status()).toBe(200);
  });

  // Staff round 3, nit 1: the portal's host under ANOTHER scheme is another origin.
  test("an Origin with the portal's host but another scheme is refused 403", async ({ page, baseURL }) => {
    const own = new URL(String(baseURL));
    const otherScheme = `${own.protocol === "https:" ? "http" : "https"}://${own.host}`;
    const res = await page.request.post("/api/auth/login", {
      headers: { Origin: otherScheme },
      data: { email: "coach@evoli.fit", password: "Password123!" },
    });
    expect(res.status(), `Origin: ${otherScheme}`).toBe(403);
    expect(await res.json()).toEqual({ code: "CROSS_ORIGIN" });
    expect(res.headers()["set-cookie"]).toBeUndefined();
  });

  // Staff round 4, nit: a proxy chain appends to X-Forwarded-Host exactly as it does to
  // X-Forwarded-Proto, so the first entry is the host the browser reached — read like the
  // scheme, not as one unparseable host that refused every sign-in behind two proxies.
  test("a comma-separated X-Forwarded-Host is read by its first entry", async ({ page, baseURL }) => {
    const own = new URL(String(baseURL));
    const foreignFirst = await page.request.post("/api/auth/login", {
      headers: { Origin: own.origin, "X-Forwarded-Host": `evil.example, ${own.host}` },
      data: { email: "coach@evoli.fit", password: "Password123!" },
    });
    expect(foreignFirst.status(), "the first hop is another host").toBe(403);
    expect(await foreignFirst.json()).toEqual({ code: "CROSS_ORIGIN" });
    expect(await page.context().cookies()).toEqual([]);

    const ownFirst = await page.request.post("/api/auth/login", {
      headers: { Origin: own.origin, "X-Forwarded-Host": ` ${own.host} , proxy.internal` },
      data: { email: "coach@evoli.fit", password: "Password123!" },
    });
    expect(ownFirst.status(), "the first hop is this portal").toBe(200);
  });

  // Staff round 3, nit 2: no Origin is allowed only when the browser does not say the
  // request came from another site.
  test("no Origin but Sec-Fetch-Site naming another site is refused 403; same-origin is not", async ({ page }) => {
    for (const site of ["cross-site", "same-site"]) {
      const res = await page.request.post("/api/auth/login", {
        headers: { "Sec-Fetch-Site": site },
        data: { email: "coach@evoli.fit", password: "Password123!" },
      });
      expect(res.status(), `Sec-Fetch-Site: ${site}`).toBe(403);
      expect(await res.json()).toEqual({ code: "CROSS_ORIGIN" });
      expect(res.headers()["set-cookie"], `Sec-Fetch-Site: ${site}`).toBeUndefined();
    }
    expect(await page.context().cookies()).toEqual([]);
    const own = await page.request.post("/api/auth/login", {
      headers: { "Sec-Fetch-Site": "same-origin" },
      data: { email: "coach@evoli.fit", password: "Password123!" },
    });
    expect(own.status()).toBe(200);
  });

  test("a cross-origin activation is refused 403 and reaches no api", async ({ page }) => {
    await signInPending(page);
    const res = await page.request.post("/api/auth/activate", { headers: { Origin: EVIL }, data: ACTIVATE_BODY });
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ code: "CROSS_ORIGIN" });
    expect((await recordedActivations(page)).activations).toEqual([]);
    await page.goto("/");
    await expect(page, "still pending: nothing was finished").toHaveURL(/\/activate$/);
  });

  test("a cross-origin sign-out is refused 403 and leaves the session in place", async ({ page }) => {
    await signIn(page, "coach@evoli.fit", "Password123!");
    await page.waitForURL("/");
    const res = await page.request.post("/api/auth/logout", { headers: { Origin: EVIL } });
    expect(res.status()).toBe(403);
    expect(res.headers()["set-cookie"]).toBeUndefined();
    await page.goto(`/clients/${LINA}`);
    await expect(page, "still signed in").toHaveURL(new RegExp(`/clients/${LINA}$`));
  });
});
