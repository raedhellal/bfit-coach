import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * BUG-195c LIVE — "a coach built a routine in the portal and a trainee's app shows it"
 * (BUG-195 DoD 8), against a REAL b-fit-api that carries BUG-195b's draft contract.
 *
 * Run with `playwright.live.config.ts` (COACH_API_MODE=live). It needs an api built from
 * `fix/bug195b-routine-draft-contract` (or a main that has merged it), the `local`
 * profile seed, `EXERCISE_PROVIDER=seed` (a throwaway database has no musclewiki rows,
 * so every catalog read would be a 503), AI off, and a THROWAWAY Postgres — never the
 * shared :5433. It creates a coach link and revokes it at the end, so it is re-runnable.
 *
 * It is the proof the fixture cannot give: the fixture is written from the same reading
 * of the contract as the client. Against the pre-BUG-195c portal it fails at the FIRST
 * Save draft ("The draft could not be saved." — the api's 400 for a body with no
 * `document`), which is the bug.
 */

const API_ORIGIN = process.env.COACH_LIVE_API_ORIGIN || "http://localhost:8099";
const COACH = { email: "coach@evoli.fit", password: "Password123!" };
const TRAINEE = { email: "user@evoli.fit", password: "Password123!" };
const TRAINEE_NAME = "Test User";
const PLAN_NAME = "BUG-195c live plan";

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
  method: "GET" | "POST" | "PUT",
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

function exerciseRow(page: Page, name: string) {
  return page.getByRole("group", { name, exact: true });
}

/** Adds the catalog row whose name starts with `name` (the api sorts by name). */
async function addFromCatalog(page: Page, dayIndex: number, name: string) {
  await page.getByRole("button", { name: "Add exercise" }).nth(dayIndex).click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel("Search the catalog").fill(name);
  await picker.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  await expect(picker.getByText(`Added ${name}.`)).toBeVisible();
  await picker.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function saveDraft(page: Page) {
  await page.getByRole("button", { name: "Save draft" }).click();
  // The pre-BUG-195c portal prints "The draft could not be saved." here: the api's 400.
  await expect(page.getByText(/^Draft saved /)).toBeVisible();
  await expect(page.getByText("The draft could not be saved.")).toHaveCount(0);
}

test("BUG-195c: build, save, save again, preview, publish — and the trainee's plan is the coach's", async ({
  page,
  context,
  request,
}) => {
  test.slow();
  page.on("dialog", (d) => d.accept()); // a reload over a dirty editor raises beforeunload

  // ── A linked trainee with a real profile: NON-EMPTY equipment and injuries ──
  const coach = await bearer(request, COACH);
  await revokeEveryLink(request, coach);
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
    primaryGoal: "BUILD_MUSCLE",
    weeklyDays: 3,
    sessionMinutes: 45,
    equipment: ["DUMBBELLS", "PULL_UP_BAR"],
    injuries: ["LOWER_BACK"],
    consentAccepted: true,
    privacyPolicyVersion: "v1.0",
    termsVersion: "v1.0",
  });
  expect(profile.status, profile.text).toBe(200);
  const roster = await call(request, coach, "GET", "/coach-portal/clients?page=0&size=100&sort=needs_attention");
  const link = (roster.body.items as { id: string; traineeDisplayName: string }[]).find(
    (row) => row.traineeDisplayName === TRAINEE_NAME
  );
  expect(link, "the accepted link is on the roster").toBeTruthy();
  const clientId = link!.id;
  const draftPath = `/coach-portal/clients/${clientId}/routine/draft`;

  try {
    // ── Build a routine from scratch in the portal ──────────────────────────
    await signIn(page);
    await page.goto(`/clients/${clientId}/routine`);
    const empty = page.getByText("No active plan", { exact: true });
    await expect(empty.or(page.getByLabel("Plan name"))).toBeVisible();
    if (await empty.isVisible()) {
      // A fresh database: the trainee has never had a routine (edge case 9).
      await page.getByRole("button", { name: "Build a plan" }).click();
    } else {
      /*
       * A re-run: the plan a previous run published (Mon/Tue) is still the trainee's —
       * no trainee endpoint clears a plan. Empty both days and build it again, which
       * drives the same controls and the same writes.
       */
      const removes = page.getByRole("button", { name: /^Remove: / });
      while ((await removes.count()) > 0) await removes.first().click();
      await expect(page.getByLabel("Day 3 weekday")).toHaveCount(0);
      await expect(page.getByLabel("Day 1 weekday")).toHaveValue("1");
      await expect(page.getByLabel("Day 2 weekday")).toHaveValue("2");
    }
    await page.getByLabel("Plan name").fill(PLAN_NAME);
    await addFromCatalog(page, 0, "Goblet Squat");
    await addFromCatalog(page, 1, "Push Up");

    // ── Save #1: on a fresh database no draft exists, so the token is null ────
    await saveDraft(page);
    const first = await call(request, coach, "GET", draftPath);
    expect(first.status, first.text).toBe(200);
    expect(first.body.document.name).toBe(PLAN_NAME);
    // D3: the server resolved the trainee's own goal and level from their profile…
    expect(first.body.document.goal).toBe("BUILD_MUSCLE");
    expect(first.body.document.level).toBe("INTERMEDIATE");
    // …and the portal re-rendered what it stored, instead of the placeholder it sent.
    await expect(page.getByLabel("Goal", { exact: true })).toHaveValue("BUILD_MUSCLE");
    expect(first.body.document.constraints.equipment).toEqual([]);
    expect(first.body.document.constraints.injuries).toEqual([]);
    expect(first.body.document.daysPerWeek).toBe(2);
    const firstToken: string = first.body.updatedAt;

    // ── Save #2: every field, echoing the token the first save produced ──────
    const goblet = exerciseRow(page, "Goblet Squat");
    await goblet.getByLabel("Tempo").fill("3-1-1");
    await goblet.getByLabel("Weight").fill("16 kg");
    await goblet.getByLabel("Notes: Goblet Squat").fill("Chest tall");
    await page.getByLabel("Day 1 estimated minutes").fill("50");
    await addFromCatalog(page, 0, "Plank");
    const plank = exerciseRow(page, "Plank");
    // AC3.5 against the REAL catalog: the seed marks Plank DURATION.
    await expect(plank.getByLabel("Tracked as")).toHaveValue("DURATION");
    await plank.getByLabel("Seconds").fill("45");
    await saveDraft(page);

    const second = await call(request, coach, "GET", draftPath);
    expect(second.body.updatedAt).not.toBe(firstToken);
    const day1 = (second.body.document.trainingDays as { dayOfWeek: number; estimatedMinutes: number; exercises: Record<string, unknown>[] }[]).find(
      (d) => d.dayOfWeek === 1
    )!;
    expect(day1.estimatedMinutes).toBe(50);
    expect(day1.exercises.find((e) => e.name === "Goblet Squat")).toMatchObject({
      tempo: "3-1-1",
      weight: "16 kg",
      notes: "Chest tall",
      trackingType: "WEIGHT_REPS",
    });
    expect(day1.exercises.find((e) => e.name === "Plank")).toMatchObject({
      trackingType: "DURATION",
      reps: null,
      durationSeconds: 45,
    });

    // AC3.2 — a hard reload shows exactly what was saved.
    await page.reload();
    await expect(page.getByText("Draft — not yet published")).toBeVisible();
    await expect(exerciseRow(page, "Goblet Squat").getByLabel("Tempo")).toHaveValue("3-1-1");
    await expect(exerciseRow(page, "Plank").getByLabel("Seconds")).toHaveValue("45");
    await expect(page.getByLabel("Day 1 estimated minutes")).toHaveValue("50");

    // ── AC3.6 against the real token: another tab saves in between ───────────
    const other = await context.newPage();
    await other.goto(`/clients/${clientId}/routine`);
    await exerciseRow(other, "Goblet Squat").getByLabel("Rest").fill("75s");
    await saveDraft(other);
    await exerciseRow(page, "Goblet Squat").getByLabel("Sets").fill("4");
    await page.getByRole("button", { name: "Save draft" }).click();
    const conflict = page.getByRole("dialog", { name: "This draft changed somewhere else" });
    await expect(conflict).toBeVisible();
    await expect(
      conflict.getByText(`This replaces your unpublished draft for ${TRAINEE_NAME}. That draft cannot be recovered.`)
    ).toBeVisible();
    // Nothing was written by the refused save: the other tab's edit stands.
    const between = await call(request, coach, "GET", draftPath);
    const gobletBetween = (between.body.document.trainingDays[0].exercises as Record<string, unknown>[]).find(
      (e) => e.name === "Goblet Squat"
    );
    expect(gobletBetween).toMatchObject({ rest: "75s", sets: 3 });
    await conflict.getByRole("button", { name: "Replace the draft" }).click();
    await expect(page.getByText(/^Draft saved /)).toBeVisible();
    await other.close();

    // ── Preview (EV-184's guarded two-phase publish), then publish ───────────
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    const confirm = modal.getByRole("button", { name: /^Publish( with these changes)?$/ });
    // Nothing is written until the coach confirms: the draft is still there.
    expect((await call(request, coach, "GET", draftPath)).body.document).not.toBeNull();
    await confirm.click();
    await expect(page.getByText("Published. The trainee sees it next time they open the app.")).toBeVisible();

    // ── The TRAINEE's own app reads it (BUG-195 DoD 8) ───────────────────────
    const plan = await call(request, trainee, "GET", "/me/plan");
    expect(plan.status, plan.text).toBe(200);
    expect(plan.body.name).toBe(PLAN_NAME);
    expect(plan.body.source).toBe("COACH");
    const trainingDays = (plan.body.schedule as { dayOfWeek: number; restDay: boolean }[])
      .filter((d) => !d.restDay)
      .map((d) => d.dayOfWeek)
      .sort();
    expect(trainingDays).toEqual([1, 2]);
    const monday = await call(request, trainee, "GET", "/me/plan/day/1");
    expect(monday.status, monday.text).toBe(200);
    expect(monday.text).toContain("Plank");
    expect(monday.text).toContain("Goblet Squat");

    // ── AC3.10: edit the PUBLISHED plan and save — the lists go [] and it lands ──
    const published = await call(request, coach, "GET", `/coach-portal/clients/${clientId}/routine`);
    test.info().annotations.push({
      type: "published constraints (BUG-194 carries the trainee's own)",
      description: JSON.stringify(published.body.routine?.constraints ?? null),
    });
    // The case AC3.10 exists for: the published document carries NON-EMPTY lists, so a
    // portal that echoed them back would be refused 400 COACH_DRAFT_SUBJECT_FIELD here.
    expect(published.body.routine.constraints.equipment).toEqual(["DUMBBELLS", "PULL_UP_BAR"]);
    expect(published.body.routine.constraints.injuries).toEqual(["LOWER_BACK"]);
    await page.reload();
    await expect(page.getByText("Published plan")).toBeVisible();
    await exerciseRow(page, "Goblet Squat").getByLabel("Sets").fill("5");
    await saveDraft(page);
    const edited = await call(request, coach, "GET", draftPath);
    expect(edited.body.document.constraints.equipment).toEqual([]);
    expect(edited.body.document.constraints.injuries).toEqual([]);
    // The trainee's lists are still shown read-only by the page.
    await expect(page.getByText("Lower back", { exact: true })).toBeVisible();
  } finally {
    await revokeEveryLink(request, coach);
  }
});
