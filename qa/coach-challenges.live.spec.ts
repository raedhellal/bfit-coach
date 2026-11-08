import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * EV-321b live proof — a step challenge end to end against a REAL b-fit-api (EV-321a,
 * `feat/ev321a-coach-challenges-api` @ 1749060), no fixture: the coach creates it in the
 * portal, the trainee accepts and syncs steps through the api exactly as the app does,
 * and the portal's table renders the api's own numbers — including a day with NO row,
 * which must read as "no data" and never as 0.
 *
 * It exists for the reason `coach-live.spec.ts` does: the fixture is typed by the same
 * module as the client, so only a real api can fail on a field name.
 *
 * Run with `playwright.live.config.ts` against an api on a THROWAWAY Postgres (the
 * `local` profile seeds coach@ and user@evoli.fit). Re-runnable: it revokes every link
 * the coach holds before it starts and deletes what it created.
 */

const API_ORIGIN = process.env.COACH_LIVE_API_ORIGIN || "http://localhost:8099";
const COACH = { email: "coach@evoli.fit", password: "Password123!" };
const TRAINEE = { email: "user@evoli.fit", password: "Password123!" };
const TRAINEE_NAME = "Test User";
const TITLE = "10 000 pas par jour (live)";

async function bearer(request: APIRequestContext, who: { email: string; password: string }) {
  const res = await request.post(`${API_ORIGIN}/auth/login`, { data: who });
  expect(res.status(), "the seeded account must log in").toBe(200);
  const body = (await res.json()) as { accessToken?: string };
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

/** Revokes every link the coach holds: what "the coach holds no ACTIVE link" means to the next spec. */
async function revokeEveryLink(request: APIRequestContext, asCoach: Record<string, string>) {
  const roster = await request.get(`${API_ORIGIN}/coach-portal/clients?page=0&size=100&sort=needs_attention`, { headers: asCoach });
  expect(roster.status()).toBe(200);
  for (const item of ((await roster.json()) as { items: { id: string }[] }).items) {
    // A revoke that silently fails here brings the leak back, and it shows up later, in coach-live.
    const revoked = await request.post(`${API_ORIGIN}/coach-portal/clients/${item.id}/revoke`, { headers: asCoach });
    expect([200, 204], await revoked.text()).toContain(revoked.status());
  }
}

/** Deletes every challenge this spec titled, so no run leaves one behind for the next. */
async function deleteOwnChallenges(request: APIRequestContext, asCoach: Record<string, string>) {
  const list = await request.get(`${API_ORIGIN}/coach-portal/challenges?page=0&size=50`, { headers: asCoach });
  expect(list.status()).toBe(200);
  for (const c of ((await list.json()) as { items: { id: string; title: string }[] }).items) {
    if (c.title !== TITLE) continue;
    const deleted = await request.delete(`${API_ORIGIN}/coach-portal/challenges/${c.id}`, { headers: asCoach });
    expect([200, 204], await deleted.text()).toContain(deleted.status());
  }
}

/*
 * BUG-1095 item 5 (a): the cleanup runs in an afterEach, which Playwright also runs after a
 * FAILED test. It used to sit inline at the end of the test body, so a red anywhere above
 * it (the `:97` drift, for one) left an ACTIVE link behind, and `coach-live` then started
 * on a roster that was not empty. Witness: hub raedhellal/b-fit-mobile evidence commit
 * 774e2dec, evidence/BUG-1095-11aba360/33-witness5-forcedred-pair-tip-11aba360.log (a
 * forced-red run of this spec followed by `coach-live`) and 40-roster-reads.txt.
 */
test.afterEach(async ({ request }) => {
  const asCoach = { Authorization: `Bearer ${await bearer(request, COACH)}` };
  await deleteOwnChallenges(request, asCoach);
  await revokeEveryLink(request, asCoach);
});

function utcDay(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

test("create in the portal → trainee accepts and syncs → the ranked row shows the api's numbers", async ({
  page,
  request,
}) => {
  test.slow();
  const coach = await bearer(request, COACH);
  const trainee = await bearer(request, TRAINEE);
  const asCoach = { Authorization: `Bearer ${coach}` };
  // UTC, an exact IANA id: the api remembers it on the participation, so the coach's
  // "today" for this trainee is the UTC day this spec computes.
  const asTrainee = { Authorization: `Bearer ${trainee}`, "X-Timezone": "UTC" };

  // ── a clean slate: no link, then one fresh ACTIVE link to the seeded trainee ──
  await revokeEveryLink(request, asCoach);
  // …and no challenge left over from a run that predates the afterEach above.
  await deleteOwnChallenges(request, asCoach);
  const invite = await request.post(`${API_ORIGIN}/coach-portal/invites`, { headers: asCoach });
  expect(invite.status(), await invite.text()).toBe(201);
  const { token } = (await invite.json()) as { token: string };
  const link = await request.post(`${API_ORIGIN}/me/my-coach/accept`, {
    headers: asTrainee,
    data: { token, privacyPolicyVersion: "v1.0" },
  });
  expect(link.status(), await link.text()).toBe(200);

  // ── the coach creates the challenge IN THE PORTAL ─────────────────────────────
  await signIn(page);
  await page.goto("/challenges");
  await page.getByRole("button", { name: "New challenge" }).click();
  const dialog = page.getByRole("dialog", { name: "New challenge" });
  await dialog.getByLabel("Title").fill(TITLE);
  await expect(dialog.getByLabel("Daily step goal")).toHaveValue("10,000");
  // Started two days ago, so the table has a past day with steps, a past day WITHOUT
  // any row, and today.
  await dialog.getByLabel("Starts on").fill(utcDay(-2));
  await dialog.getByLabel("Ends on").fill(utcDay(4));
  await dialog.getByRole("checkbox", { name: TRAINEE_NAME }).check();
  await dialog.getByRole("button", { name: "Create and invite" }).click();
  await page.waitForURL(/\/challenges\/[0-9a-f-]{36}\?created=1$/);
  const id = new URL(page.url()).pathname.split("/").pop()!;

  // The api's 201 body, rendered: one INVITED participant, no number.
  await expect(page.getByRole("heading", { level: 1 })).toContainText(TITLE);
  // BUG-1095 (a): the phase left the h1 in coach 1f30ff4a (EV-337h, merged at 56e024b9;
  // BUG-676, the h1 is the name alone) and now sits on the pill beside it. The pill has
  // no role and no test id; `[data-phase]` is the hook the fixture specs already use
  // (coach-challenges.spec.ts, pro-challenges.spec.ts), so this reads it the same way.
  await expect(page.locator('.challenge-head [data-phase="ACTIVE"]')).toHaveText("Active");
  await expect(page.getByText("1 invited · 0 joined")).toBeVisible();
  // BUG-1095 item 7: 1f30ff4a (EV-337h) turned the participants table into
  // <ul class="participant-list"> / <li class="participant"> (ProgressTable.tsx).
  const row = page.locator("li.participant").filter({ hasText: TRAINEE_NAME });
  await expect(row).toContainText("Invitation sent");
  expect(await row.innerText()).not.toMatch(/\d/);

  // ── the trainee accepts (the per-challenge consent) and syncs, as the app does ─
  const accepted = await request.post(`${API_ORIGIN}/me/challenges/${id}/accept`, {
    headers: asTrainee,
    data: { consentVersion: "challenge-share-v1" },
  });
  expect(accepted.status(), await accepted.text()).toBe(200);
  const synced = await request.put(`${API_ORIGIN}/me/activity/steps`, {
    headers: asTrainee,
    // Yesterday is OMITTED — the app sends no entry for a day it has no data for.
    data: {
      entries: [
        { day: utcDay(-2), steps: 12_000, source: "HEALTH_CONNECT" },
        { day: utcDay(0), steps: 4_200, source: "HEALTH_CONNECT" },
      ],
    },
  });
  expect(synced.status(), await synced.text()).toBe(200);

  // ── Refresh: the portal re-reads GET /coach-portal/challenges/{id} ────────────
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText("1 invited · 1 joined")).toBeVisible();
  await expect(row).toContainText("Joined");
  await expect(row.locator("[data-rank-label]")).toHaveText("#1");
  // Today's source label now sits inside [data-today], so the exact number is pinned on
  // .participant-value and the label on [data-source] (BUG-1095 item 7, as ruled in (fp)).
  await expect(row.locator("[data-today]")).toHaveAttribute("data-today", "4200");
  await expect(row.locator("[data-today] .participant-value")).toHaveText("4,200 / 10,000 steps");
  await expect(row.locator('[data-today] [data-source="HEALTH_CONNECT"]')).toHaveText("Health Connect");
  await expect(row.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "4200");
  await expect(row).toContainText("1 / 3"); // days met / days elapsed
  await expect(row).toContainText("16,200 steps");
  await expect(row).toContainText("Health Connect");
  // `syncedAt` moments ago, relative ("now" in English at under a minute).
  await expect(row.locator("[data-synced]")).toHaveText(/^(now|\d+ seconds? ago|\d+ minutes? ago|1 minute ago)$/);

  // The strip, from the api's `days`: MET, NO_DATA (no row — never 0), IN_PROGRESS, 4 × FUTURE.
  const statuses = await row
    .locator("[data-status]")
    .evaluateAll((els) => els.map((e) => `${e.getAttribute("data-status")}:${e.getAttribute("data-value")}`));
  expect(statuses).toEqual([
    "MET:12000",
    "NO_DATA:",
    "IN_PROGRESS:4200",
    "FUTURE:",
    "FUTURE:",
    "FUTURE:",
    "FUTURE:",
  ]);
  await expect(row.locator('[data-status="NO_DATA"]')).toHaveAttribute("aria-label", /: no data$/);

  // ── the list reads the same challenge from GET /coach-portal/challenges ───────
  await page.getByRole("link", { name: "Back to challenges" }).click();
  const card = page.getByRole("listitem").filter({ hasText: TITLE });
  await expect(card).toContainText("10,000 steps a day");
  await expect(card).toContainText("1 invited · 1 joined");
  await expect(card).toContainText("7 days");

  // ── delete, behind the confirm; the id then reads like any foreign id ────────
  await card.getByRole("link", { name: TITLE }).click();
  await page.getByRole("button", { name: "Delete challenge" }).click();
  await page.getByRole("dialog", { name: "Delete this challenge?" }).getByRole("button", { name: "Delete", exact: true }).click();
  await page.waitForURL("/challenges");
  await expect(page.getByRole("listitem").filter({ hasText: TITLE })).toHaveCount(0);
  const gone = await request.get(`${API_ORIGIN}/coach-portal/challenges/${id}`, { headers: asCoach });
  expect(gone.status()).toBe(403);
  // Leaving the coach with no link is the afterEach's job, pass or fail.
});
