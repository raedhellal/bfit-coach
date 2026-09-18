import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * EV-183 live proof — the whole AC1→AC6 arc against a REAL b-fit-api, no fixture.
 *
 * Run with `playwright.live.config.ts`, which starts Next with `COACH_API_MODE=live`
 * and points `API_BASE_URL` at an api instance backed by a throwaway Postgres. The
 * default config (`playwright.config.ts`) ignores this file, because the fixture suite
 * must stay runnable with no backend at all.
 *
 * It exists because a fixture spec cannot fail on the thing most likely to be wrong:
 * a field name. `traineeDisplayName` vs `displayName` renders an empty cell in both
 * modes' *types* and only the live run notices.
 *
 * Prerequisites (the live config does NOT provision these — see the runbook):
 *   - b-fit-api on API_ORIGIN with the `local` profile seed (coach@evoli.fit ROLE_COACH
 *     with a coach_profiles row, user@evoli.fit as the trainee)
 *   - the coach holding no ACTIVE link when the run starts; the spec revokes what it
 *     creates, so it is re-runnable.
 */

const API_ORIGIN = process.env.COACH_LIVE_API_ORIGIN || "http://localhost:8099";
const COACH = { email: "coach@evoli.fit", password: "Password123!" };
const TRAINEE = { email: "user@evoli.fit", password: "Password123!" };
/** The seeded names, which are what the screens must actually render. */
const COACH_NAME = "Coach User";
const TRAINEE_NAME = "Test User";

async function bearer(request: APIRequestContext, who: { email: string; password: string }) {
  const res = await request.post(`${API_ORIGIN}/auth/login`, { data: who });
  expect(res.status(), "the seeded account must log in").toBe(200);
  const body = (await res.json()) as { accessToken?: string };
  // A login that answers a challenge instead of a token has no accessToken; say which.
  expect(body.accessToken, "login must return an access token (no MFA on the seed)").toBeTruthy();
  return body.accessToken!;
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(COACH.email);
  await page.getByLabel("Password").fill(COACH.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

test("the full coach arc against a real api: me → invite → accept → overview → revoke", async ({
  page,
  request,
}) => {
  test.slow();

  // ── AC1: sign in, and the roster reads the api's real capacity ──────────────
  await signIn(page);
  await expect(page.getByRole("banner").getByText("Evoli Pro", { exact: true })).toBeVisible();
  // GET /coach-portal/me is flat {coachId, displayName, tier, active, capacity}. If the
  // client still read `me.capacity.active` this line would render "undefined".
  await expect(page.getByText("0 / 2 profiles · Starter", { exact: true })).toBeVisible();
  await expect(page.getByText("No trainees yet", { exact: true })).toBeVisible();

  // ── AC2: mint a real invite; the token comes from POST /coach-portal/invites ─
  await page.getByRole("button", { name: "Invite a trainee" }).click();
  const linkField = page.getByLabel("Invite link");
  await expect(linkField).toBeVisible();
  const url = await linkField.inputValue();
  // AC3: the real coach's display name, from the real /coach-portal/me, on the link.
  expect(url).toMatch(
    new RegExp(`^${page.url().match(/^https?:\/\/[^/]+/)![0]}/i/[A-Za-z0-9_-]{43}\\?coach=Coach(%20|\\+)User$`)
  );
  await expect(page.getByText("This link works once and expires in 7 days.")).toBeVisible();
  const qr = page.getByRole("img", { name: "QR code for the invite link" });
  await expect(qr).toHaveAttribute("src", /^data:image\/png;base64,/);
  const token = new URL(url).pathname.split("/i/")[1];

  // ── AC3: the trainee accepts on their side, exactly as the mobile app does ───
  const traineeToken = await bearer(request, TRAINEE);
  const accept = await request.post(`${API_ORIGIN}/me/my-coach/accept`, {
    headers: { Authorization: `Bearer ${traineeToken}` },
    data: { token, privacyPolicyVersion: "v1.0" },
  });
  expect(accept.status(), await accept.text()).toBe(200);
  expect(await accept.json()).toMatchObject({ coachDisplayName: COACH_NAME });

  // ── AC4: a plain reload shows the trainee. No refetch button, no logout. ─────
  await page.goto("/");
  await expect(page.getByText("1 / 2 profiles · Starter", { exact: true })).toBeVisible();
  const row = page.getByRole("link", { name: TRAINEE_NAME }).first();
  await expect(row).toBeVisible();
  // The seeded trainee has never trained: the null-carrying fields must degrade to the
  // empty copy, not to "null" or a blank cell.
  await expect(page.getByText("No plan").first()).toBeVisible();
  await expect(page.getByText("No workouts yet").first()).toBeVisible();

  // ── AC5: the read-only overview, from GET /coach-portal/clients/{id} ─────────
  await row.click();
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: TRAINEE_NAME })).toBeVisible();
  await expect(page.getByText(/^Coached since /)).toBeVisible();
  await expect(page.getByText("0 / 0", { exact: true })).toBeVisible(); // adherenceThisWeek
  await expect(page.getByText("0 days", { exact: true })).toBeVisible(); // currentStreakDays
  await expect(page.getByText("No sessions yet", { exact: true })).toBeVisible(); // lastSession null
  await expect(page.getByText("No weigh-ins in the last 8 weeks").first()).toBeVisible();
  // The api really emits NO_WEIGH_IN_14_DAYS for a trainee who has never weighed in,
  // and copy.ts must have a sentence keyed by that exact code — a missing key would
  // render the raw enum name to a coach.
  await expect(page.getByText("No weigh-in for 14 days", { exact: true })).toBeVisible();
  // PAIN_REPORTED is published by the api and never emitted (ADR-0012 D6).
  await expect(page.getByText("Reported pain in a session")).toHaveCount(0);
  /**
   * The footnote. It was "Read-only. Program editing and messaging are not part of this
   * preview." until EV-184b/EV-185b made the Routine and Nutrition tabs real writes, and
   * this assertion was not updated with it — so this spec has been RED on main since
   * then, which is the second reason the routine crash reached a coach: the one suite
   * that could have seen it was already failing before it got there.
   */
  await expect(
    page.getByText("Messaging and AI drafting are not part of this preview.")
  ).toBeVisible();

  const clientUrl = page.url();

  /* ── EV-184 AC1 live: the ROUTINE TAB, which this spec did not open until now ──
   *
   * It stopped at the overview, and that omission is exactly how the portal shipped a
   * `CoachRoutineResponse` whose four fields b-fit-api has never sent. Fixture mode
   * agreed with the invented shape, the live run never looked, and the first coach to
   * click "Routine" got a 200 with nothing on it but the Evoli Pro chrome.
   *
   * `qa/contract-drift.spec.ts` is the cheap guard that now catches that class in the
   * default gate with no api at all. This is the expensive one that proves the page
   * really renders against a real Spring response — the two are not redundant: the
   * contract test compares NAMES against a vendored artefact, and this compares PIXELS
   * against a running server.
   */
  const traineeToken2 = await bearer(request, TRAINEE);
  // Give the trainee a real stored profile, so the guardrail panel has something to say
  // and the WIRE VOCABULARY is what the assertions below are really about: the api sends
  // `BARBELL` / `PULL_UP_BAR` / `LOWER_BACK`, and a screen that prints those has failed
  // the same way BUG-047 failed on mobile.
  const profile = await request.put(`${API_ORIGIN}/me/profile`, {
    headers: { Authorization: `Bearer ${traineeToken2}` },
    data: {
      fitnessLevel: "INTERMEDIATE",
      primaryGoal: "BUILD_MUSCLE",
      weeklyDays: 3,
      sessionMinutes: 45,
      equipment: ["BARBELL", "PULL_UP_BAR"],
      injuries: ["LOWER_BACK", "Sharp pain in the left shoulder on anything overhead"],
      consentAccepted: true,
      // BUG-023 §6.5 — the server refuses a profile write that does not name the
      // versions the consent screen displayed (409 CONSENT_VERSION_STALE).
      privacyPolicyVersion: "v1.0",
      termsVersion: "v1.0",
    },
  });
  expect(profile.status(), await profile.text()).toBe(200);

  await page.goto(`${clientUrl}/routine`);

  // The crash's witness: the page body, not just the shell. If `guardrails` were read
  // under any other name this heading would never render.
  await expect(page.getByRole("heading", { name: TRAINEE_NAME })).toBeVisible();
  await expect(page.getByText("From the trainee's profile — you cannot change these here.")).toBeVisible();

  // The trainee has never had a routine, so AC1's empty state — never a blank page.
  await expect(page.getByText("No active plan", { exact: true })).toBeVisible();

  // The guardrail panel, in WORDS. `LOWER_BACK` is an onboarding chip token and gets its
  // label; the second entry is the trainee's own free-text note and is passed through
  // VERBATIM, because humanising a sentence somebody wrote about their own body is how
  // the one line a coach most needs to read exactly gets mangled.
  await expect(page.getByText("Lower back", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Sharp pain in the left shoulder on anything overhead", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Barbell", { exact: true })).toBeVisible();
  await expect(page.getByText("Pull-up bar", { exact: true })).toBeVisible();
  // Not the raw tokens, in either direction.
  await expect(page.getByText("LOWER_BACK")).toHaveCount(0);
  await expect(page.getByText("PULL_UP_BAR")).toHaveCount(0);
  await expect(page.getByText("BARBELL", { exact: true })).toHaveCount(0);

  // `equipmentChecked` is true here (the list is non-empty), so the unanswered sentence
  // must NOT appear. Its false case is reachable only from the fixture (Sara).
  await expect(page.getByText("Not answered yet.")).toHaveCount(0);

  await page.goto(clientUrl);

  // ── AC6: revoke, and the roster is right on the very next request ────────────
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Revoke access" }).click();
  await page.getByRole("button", { name: "Revoke access", exact: true }).last().click();
  await page.waitForURL("/");
  await expect(page.getByText("No trainees yet", { exact: true })).toBeVisible();
  await expect(page.getByText("0 / 2 profiles · Starter", { exact: true })).toBeVisible();

  // A revoked link answers 403 — the same 403 a foreign or nonexistent id answers, so
  // the coach sees one sentence and the prefix is not an existence oracle.
  await page.goto(clientUrl);
  await expect(
    page.getByText("This trainee is not on your roster. They may have revoked access.")
  ).toBeVisible();
});

test("a nonexistent client id is indistinguishable from a foreign one", async ({ page }) => {
  await signIn(page);
  await page.goto("/clients/11111111-2222-3333-4444-555555555555");
  await expect(
    page.getByText("This trainee is not on your roster. They may have revoked access.")
  ).toBeVisible();
});
