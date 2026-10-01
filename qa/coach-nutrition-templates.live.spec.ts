import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * EV-273b LIVE — the nutrition template library and "Use on a trainee" against a REAL
 * b-fit-api (main 741ed39 or later: EV-273a merged at 8b23d45), no fixture.
 *
 * Run with `playwright.live.config.ts` (COACH_API_MODE=live) against an api booted with
 * the `local` profile seed, AI off, NO `OPENAI_API_KEY` in its environment (meal images
 * are not AI-gated), and a THROWAWAY Postgres — never the shared :5433. It creates a
 * coach link and revokes it at the end, and deletes the templates it made, so it is
 * re-runnable.
 *
 * What only this run can show, because the fixture is written from the portal's own
 * reading of the contract:
 *   · the library's field names (`templates`, `limit`, `remaining`, `targets.*`) as the
 *     api really serves them, and the api's real 409 / 400 codes turning into the
 *     portal's sentences;
 *   · the api storing exactly what the editor saved (read back over HTTP, not off the
 *     page), with no meal structure;
 *   · the two trainee writes landing: the targets the api then serves for that trainee
 *     are the template's (or the floor the api applied), set by this coach.
 */

const API_ORIGIN = process.env.COACH_LIVE_API_ORIGIN || "http://localhost:8099";
const COACH = { email: "coach@evoli.fit", password: "Password123!" };
const TRAINEE = { email: "user@evoli.fit", password: "Password123!" };
const TRAINEE_NAME = "Test User";
const FIRST = "Test";
const NAME = "Live cut 1300";

async function bearer(request: APIRequestContext, who: { email: string; password: string }) {
  const res = await request.post(`${API_ORIGIN}/auth/login`, { data: who });
  expect(res.status(), "the seeded account must log in").toBe(200);
  const body = (await res.json()) as { accessToken?: string };
  expect(body.accessToken, "login must return an access token (no MFA on the seed)").toBeTruthy();
  return body.accessToken!;
}

async function call(
  request: APIRequestContext,
  token: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  data?: unknown
) {
  const res = await request.fetch(`${API_ORIGIN}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  const text = await res.text();
  return { status: res.status(), body: text ? JSON.parse(text) : null, text };
}

interface LiveTemplate {
  id: string;
  name: string;
  targets: { calories: number; proteinG: number; carbsG: number; fatG: number };
  mealStructure: unknown;
  updatedAt: string;
}

async function library(request: APIRequestContext, coach: string) {
  const res = await call(request, coach, "GET", "/coach-portal/nutrition-templates");
  expect(res.status, res.text).toBe(200);
  return res.body as { templates: LiveTemplate[]; limit: number; remaining: number };
}

/** Leftovers of an earlier run, by this spec's name prefix only. */
async function deleteMine(request: APIRequestContext, coach: string) {
  for (const t of (await library(request, coach)).templates) {
    if (t.name.startsWith("Live cut")) {
      const res = await call(request, coach, "DELETE", `/coach-portal/nutrition-templates/${t.id}`);
      expect(res.status, res.text).toBe(204);
    }
  }
}

async function revokeEveryLink(request: APIRequestContext, coach: string) {
  const roster = await call(request, coach, "GET", "/coach-portal/clients?page=0&size=100&sort=needs_attention");
  expect(roster.status, roster.text).toBe(200);
  for (const row of roster.body.items as { id: string }[]) {
    const revoked = await call(request, coach, "POST", `/coach-portal/clients/${row.id}/revoke`);
    expect([200, 204], revoked.text).toContain(revoked.status);
  }
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(COACH.email);
  await page.getByLabel("Password").fill(COACH.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
}

function row(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

async function fillEditor(page: Page, name: string, [kcal, p, c, f]: [string, string, string, string]) {
  await page.getByLabel("Template name").fill(name);
  await page.getByLabel("Calories", { exact: true }).fill(kcal);
  await page.getByLabel("Protein", { exact: true }).fill(p);
  await page.getByLabel("Carbs", { exact: true }).fill(c);
  await page.getByLabel("Fat", { exact: true }).fill(f);
}

test("EV-273b live: save, the api's refusals, duplicate, delete, then use on a linked trainee", async ({
  page,
  request,
}) => {
  test.slow();
  const coach = await bearer(request, COACH);
  await deleteMine(request, coach);
  await revokeEveryLink(request, coach);

  // ── A linked trainee with a profile ─────────────────────────────────────────
  const invite = await call(request, coach, "POST", "/coach-portal/invites");
  expect(invite.status, invite.text).toBe(201);
  const trainee = await bearer(request, TRAINEE);
  const accept = await call(request, trainee, "POST", "/me/my-coach/accept", {
    token: invite.body.token,
    privacyPolicyVersion: "v1.0",
  });
  expect(accept.status, accept.text).toBe(200);
  const profile = await call(request, trainee, "PUT", "/me/profile", {
    fitnessLevel: "INTERMEDIATE",
    primaryGoal: "LOSE_WEIGHT",
    weeklyDays: 3,
    sessionMinutes: 45,
    equipment: ["DUMBBELLS"],
    injuries: [],
    consentAccepted: true,
    privacyPolicyVersion: "v1.0",
    termsVersion: "v1.0",
  });
  expect(profile.status, profile.text).toBe(200);
  const roster = await call(request, coach, "GET", "/coach-portal/clients?page=0&size=100&sort=needs_attention");
  const link = (roster.body.items as { id: string; traineeDisplayName: string; scopes?: string[] }[]).find(
    (r) => r.traineeDisplayName === TRAINEE_NAME
  );
  expect(link, "the accepted link is on the roster").toBeTruthy();
  expect(link!.scopes, "accept grants the full scope set, NUTRITION included").toContain("NUTRITION");
  const clientId = link!.id;

  try {
    await signIn(page);

    // ── Create: the api stores exactly {name, targets}, no structure ────────────
    const before = await library(request, coach);
    await page.goto("/nutrition-templates/new");
    await fillEditor(page, NAME, ["1300", "110", "120", "40"]);
    await page.getByRole("button", { name: "Save template" }).click();
    await page.waitForURL("/nutrition-templates");
    await expect(row(page, NAME).getByText("1300 kcal · P 110 g · C 120 g · F 40 g", { exact: true })).toBeVisible();
    const afterCreate = await library(request, coach);
    const stored = afterCreate.templates.find((t) => t.name === NAME);
    expect(stored, "the api lists the template the editor saved").toBeTruthy();
    expect(stored!.targets).toEqual({ calories: 1300, proteinG: 110, carbsG: 120, fatG: 40 });
    expect(stored!.mealStructure).toBeNull();
    expect(afterCreate.remaining).toBe(before.remaining - 1);
    // AC1 — newest-updated first, as the api orders it.
    expect(afterCreate.templates[0].name).toBe(NAME);
    // The served cap is what the page says is left.
    await expect(page.getByText(`${afterCreate.remaining} of ${afterCreate.limit} left`, { exact: true })).toBeVisible();

    // ── The api's own refusals, in the portal's words ─────────────────────────
    await page.goto("/nutrition-templates/new");
    await fillEditor(page, `  ${NAME.toUpperCase()} `, ["1400", "110", "120", "40"]);
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText("You already have a nutrition template called that.", { exact: true })).toBeVisible();
    await fillEditor(page, "Live cut too much", ["9000", "110", "120", "40"]);
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(
      page.getByText(
        "Use whole numbers: calories 800 to 8000 kcal, protein up to 500 g, carbs up to 1200 g and fat up to 400 g.",
        { exact: true }
      )
    ).toBeVisible();
    expect((await library(request, coach)).templates.length, "nothing stored by either refusal").toBe(
      afterCreate.templates.length
    );

    // ── Duplicate and delete ──────────────────────────────────────────────────
    await page.goto("/nutrition-templates");
    await row(page, NAME).getByRole("button", { name: "Duplicate" }).click();
    await expect(row(page, `${NAME} (copy)`)).toBeVisible();
    await row(page, `${NAME} (copy)`).getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
    await expect(row(page, `${NAME} (copy)`)).toHaveCount(0);
    expect((await library(request, coach)).templates.some((t) => t.name === `${NAME} (copy)`)).toBe(false);

    // ── Use on the trainee: the dialog-open read, then targets, then the week ──
    await page.getByRole("button", { name: "Use on a trainee" }).first().waitFor();
    await row(page, NAME).getByRole("button", { name: "Use on a trainee" }).click();
    await page.getByRole("dialog", { name: "Use on a trainee" }).getByRole("button", { name: TRAINEE_NAME, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `Use “${NAME}” on ${FIRST}?` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Confirm" })).toBeEnabled();
    const read = await call(request, coach, "GET", `/coach-portal/clients/${clientId}/nutrition`);
    expect(read.status, read.text).toBe(200);
    // The week the dialog names is the api's currentWeekStart.
    const weekLabel = new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
      .format(new Date(`${read.body.currentWeekStart}T00:00:00Z`))
      .replace(/\bSept\b/, "Sep"); // BUG-210
    await expect(dialog.getByText(`(from ${weekLabel})`)).toBeVisible();

    await dialog.getByRole("button", { name: "Confirm" }).click();
    await page.waitForURL(`/clients/${clientId}/nutrition`, { timeout: 120_000 });
    const outcome = page.getByTestId("template-use-outcome");
    await expect(outcome).toBeVisible();

    // The targets write landed, as the api now serves it, set by this coach. The api
    // may have raised the calories to the trainee's floor; if it did, it said so.
    const after = await call(request, coach, "GET", `/coach-portal/clients/${clientId}/nutrition`);
    expect(after.status, after.text).toBe(200);
    const targets = after.body.targets as { calories: number; proteinG: number; carbsG: number; fatG: number; setByYou: boolean; source: string };
    expect({ p: targets.proteinG, c: targets.carbsG, f: targets.fatG }).toEqual({ p: 110, c: 120, f: 40 });
    expect(targets.setByYou).toBe(true);
    expect(targets.source).toBe("COACH");
    if (targets.calories === 1300) {
      await expect(outcome.getByText(/Calories raised to a safe minimum/)).toHaveCount(0);
    } else {
      expect(targets.calories, "the only change the api may make is the floor").toBe(1500);
      await expect(outcome).toContainText("Calories raised to a safe minimum of 1500 kcal.");
    }

    // Whichever week outcome the api gave, the sentence matches what it holds.
    const text = (await outcome.innerText()).trim();
    if (text.startsWith(`“${NAME}” is now ${FIRST}'s plan.`)) {
      expect(after.body.week, "APPLIED means the api holds a week").not.toBeNull();
      expect(after.body.week.weekStart).toBe(read.body.currentWeekStart);
    } else {
      expect(text).toMatch(new RegExp(`^${FIRST}'s targets are updated\\.`));
    }
  } finally {
    await deleteMine(request, coach);
    await revokeEveryLink(request, coach);
  }
});
