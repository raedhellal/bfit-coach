import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type APIRequestContext, type Page, type Response } from "@playwright/test";

/**
 * EV-341b B17 — THE MERGE GATE (staff round 2): the 15-minute token, witnessed.
 *
 * ADR-0034 D34.10 (8): an interview lasts ~30 minutes, much of it typing without navigating, and
 * the access token lives 15. Every autosave passes the middleware, which rotates an expired
 * token, so a coach who types stays signed in. That was REASONED; this is the witness, against a
 * local api started with `JWT_ACCESS_TTL=1m` (`playwright.intake-live.config.ts`):
 *   1. section 1 is typed into for 3 minutes without navigating, and every save answers 200;
 *   2. in the same run, sections 1 and 2 are saved CONCURRENTLY across an expiry (both requests
 *      held in the browser until both exist, then released together, with an access token past
 *      its `exp`), and both answer 200.
 * The output is pasted in the PR.
 *
 * Setup through the api, as the apps do it: the coach mints an invite, the seeded trainee accepts
 * it (`POST /me/my-coach/accept`) and grants the interview consent (`POST
 * /me/my-coach/intake-consent`, the wording proven by its hash). Teardown revokes the link.
 */

const API_ORIGIN = process.env.COACH_LIVE_API_ORIGIN || "http://localhost:8099";
const API_DIR = resolve(process.env.B_FIT_API_DIR || join(__dirname, "..", "..", "b-fit-api"));
const COACH = { email: "coach@evoli.fit", password: "Password123!" };
const TRAINEE = { email: "user@evoli.fit", password: "Password123!" };
const TYPING_MS = 3 * 60 * 1000;

/** One line of the run's output, for the PR (B17: "the run's output is pasted"). */
function report(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function bearer(request: APIRequestContext, who: { email: string; password: string }): Promise<string> {
  const res = await request.post(`${API_ORIGIN}/auth/login`, { data: who });
  expect(res.status(), `login ${who.email}`).toBe(200);
  const token = ((await res.json()) as { accessToken?: string }).accessToken;
  expect(token, "an access token (no MFA on the seed)").toBeTruthy();
  return token!;
}

function claims(token: string): { exp: number; iat: number; sub: string } {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp: number; iat: number; sub: string };
}

async function accessCookie(page: Page): Promise<string> {
  const value = (await page.context().cookies()).find((c) => c.name === "evoli_pro_at")?.value;
  expect(value, "the portal's access cookie").toBeTruthy();
  return value!;
}

/** `GET /coach-portal/clients` → its rows (`RosterClient.id` is the link's id, the portal's `{id}`). */
async function rosterRows(request: APIRequestContext, token: string): Promise<{ id: string }[]> {
  const res = await request.get(`${API_ORIGIN}/coach-portal/clients`, { headers: { Authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { items: { id: string }[] }).items;
}

let clientId = "";
let coachToken = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  coachToken = await bearer(request, COACH);
  const ttl = claims(coachToken).exp - claims(coachToken).iat;
  expect(ttl, "B17 needs the api started with JWT_ACCESS_TTL=1m").toBeLessThanOrEqual(60);

  // A run that stopped half-way leaves its link behind: end it, so this run starts from none.
  for (const row of await rosterRows(request, coachToken)) {
    await request.post(`${API_ORIGIN}/coach-portal/clients/${row.id}/revoke`, { headers: { Authorization: `Bearer ${coachToken}` } });
  }

  const invite = await request.post(`${API_ORIGIN}/coach-portal/invites`, { headers: { Authorization: `Bearer ${coachToken}` } });
  expect(invite.status(), await invite.text()).toBe(201);
  const { token } = (await invite.json()) as { token: string };

  const legal = (await (await request.get(`${API_ORIGIN}/legal/versions`)).json()) as {
    privacyPolicyVersion: string;
    coachIntakeTextVersion: string;
  };
  const traineeToken = await bearer(request, TRAINEE);
  const accept = await request.post(`${API_ORIGIN}/me/my-coach/accept`, {
    headers: { Authorization: `Bearer ${traineeToken}` },
    data: { token, privacyPolicyVersion: legal.privacyPolicyVersion },
  });
  expect(accept.status(), await accept.text()).toBe(200);

  const wording = readFileSync(
    join(API_DIR, "src", "main", "resources", "legal", "coach-intake", `${legal.coachIntakeTextVersion}.en.txt`)
  );
  const consent = await request.post(`${API_ORIGIN}/me/my-coach/intake-consent`, {
    headers: { Authorization: `Bearer ${traineeToken}` },
    data: {
      textVersion: legal.coachIntakeTextVersion,
      textLocale: "en",
      textSha256: createHash("sha256").update(wording).digest("hex"),
      privacyPolicyVersion: legal.privacyPolicyVersion,
    },
  });
  expect(consent.status(), await consent.text()).toBe(200);

  const rows = await rosterRows(request, coachToken);
  expect(rows.length, "one ACTIVE link").toBe(1);
  clientId = rows[0].id;
  expect(clientId).toMatch(/^[0-9a-f-]{36}$/);
});

test.afterAll(async ({ request }) => {
  if (!clientId) return;
  const token = await bearer(request, COACH);
  await request.post(`${API_ORIGIN}/coach-portal/clients/${clientId}/revoke`, { headers: { Authorization: `Bearer ${token}` } });
});

test("B17: 3 minutes of typing in section 1 with a 1-minute token, then sections 1 and 2 saved concurrently across an expiry — every save 200", async ({
  page,
}) => {
  test.setTimeout(8 * 60 * 1000);

  const saves: { section: string; status: number; at: number }[] = [];
  page.on("response", (res: Response) => {
    const m = /\/api\/clients\/[^/]+\/intake\/([A-Z_]+)$/.exec(new URL(res.url()).pathname);
    if (m && res.request().method() === "PUT") saves.push({ section: m[1], status: res.status(), at: Date.now() });
  });

  // Sign in through the form, as a coach does.
  await page.goto("/login");
  for (let i = 0; i < 30; i++) {
    await page.getByLabel("Email").fill(COACH.email);
    await page.getByLabel("Password").fill(COACH.password);
    if (await page.getByRole("button", { name: "Sign in" }).isEnabled()) break;
    await page.waitForTimeout(500);
  }
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
  const first = claims(await accessCookie(page));
  expect(first.exp - first.iat, "the portal's session carries the 1-minute token").toBeLessThanOrEqual(60);

  await page.goto(`/clients/${clientId}/intake`);
  await expect(page.locator("[data-nav-progress-ready]")).toHaveCount(1);
  await expect(page.locator('[data-intake-ready="ready"]')).toHaveCount(1);
  const notes = page.locator('[data-intake-panel="GOALS"]').getByRole("textbox", { name: "Notes", exact: true });

  // ── 1. three minutes of typing, no navigation ──────────────────────────────
  const tokens = new Set<string>([await accessCookie(page)]);
  const started = Date.now();
  const url = page.url();
  let typed = 0;
  while (Date.now() - started < TYPING_MS) {
    await notes.pressSequentially(String.fromCharCode(97 + (typed % 26)), { delay: 0 });
    typed += 1;
    await page.waitForTimeout(2_000); // > 1.5 s: each pause is a save
    tokens.add(await accessCookie(page));
  }
  await expect.poll(() => saves.filter((s) => s.section === "GOALS").length, { timeout: 15_000 }).toBeGreaterThanOrEqual(typed - 1);
  await expect(page.locator('[data-intake-status="saved"]')).toHaveCount(1, { timeout: 15_000 });
  expect(page.url(), "no navigation in 3 minutes").toBe(url);
  const typingSaves = saves.filter((s) => s.section === "GOALS");
  const elapsed = Math.round((Date.now() - started) / 1000);
  report(
    `B17 typing: ${elapsed}s, ${typed} characters, ${typingSaves.length} saves, statuses ${JSON.stringify(
      [...new Set(typingSaves.map((s) => s.status))]
    )}, ${tokens.size} distinct access tokens rotated in by the middleware`
  );
  expect(typingSaves.every((s) => s.status === 200), "every save 200").toBe(true);
  expect(tokens.size, "the token was rotated (at least two expiries crossed)").toBeGreaterThanOrEqual(3);
  await expect(notes).toHaveValue(/^[a-z]+$/);

  // ── 2. sections 1 and 2 concurrently, across an expiry ─────────────────────
  // Wait until the access token in the cookie jar is PAST its exp, so both saves arrive with it.
  // The access cookie's Max-Age is the token's life, so past `exp` the browser drops it: both
  // saves then arrive with the refresh cookie alone, which is what an expiry looks like.
  const stale = await accessCookie(page);
  const waitMs = claims(stale).exp * 1000 + 1_500 - Date.now();
  if (waitMs > 0) await page.waitForTimeout(waitMs);
  const jar = await page.context().cookies();
  const now = jar.find((c) => c.name === "evoli_pro_at")?.value;
  expect(!now || claims(now).exp * 1000 < Date.now(), "no live access token in the jar: the token has expired").toBe(true);
  expect(jar.some((c) => c.name === "evoli_pro_rt"), "the refresh cookie is still there").toBe(true);

  // Hold both PUTs in the browser until both exist, then release them together.
  const held: { section: string; go: () => Promise<void> }[] = [];
  let bothHeld: () => void = () => {};
  const both = new Promise<void>((r) => {
    bothHeld = r;
  });
  await page.route(/\/api\/clients\/[^/]+\/intake\/(GOALS|HISTORY)$/, async (route) => {
    const section = /(GOALS|HISTORY)$/.exec(route.request().url())![1];
    held.push({ section, go: () => route.continue() });
    if (held.length === 2) bothHeld();
  });
  const before = saves.length;
  await page.locator('[data-intake-panel="GOALS"]').getByRole("radio", { name: "Get stronger", exact: true }).check();
  await page.locator('[data-intake-section="HISTORY"]').click(); // GOALS loses focus: saved at once
  await page.locator('[data-intake-panel="HISTORY"]').getByRole("radio", { name: "Intermediate", exact: true }).check();
  await page.locator('[data-intake-section="GOALS"]').click(); // HISTORY loses focus: saved at once
  await both;
  expect(held.map((h) => h.section).sort()).toEqual(["GOALS", "HISTORY"]);
  await Promise.all(held.map((h) => h.go()));
  await expect.poll(() => saves.length - before, { timeout: 20_000 }).toBe(2);
  const concurrent = saves.slice(before);
  report(`B17 concurrent across an expiry: ${JSON.stringify(concurrent.map((s) => ({ section: s.section, status: s.status })))}`);
  expect(concurrent.map((s) => s.status)).toEqual([200, 200]);
  const rotated = await accessCookie(page);
  expect(rotated, "the expired token was rotated by those saves").not.toBe(stale);
  await page.unroute(/\/api\/clients\/[^/]+\/intake\/(GOALS|HISTORY)$/);

  // What the api holds: both sections, at their latest values.
  const read = await page.request.get(`/api/bff/clients/${clientId}/intake`);
  expect(read.status()).toBe(200);
  const intake = (await read.json()) as { sections: Record<string, { version: number; values: Record<string, unknown> }> };
  expect(intake.sections.GOALS.values.primaryGoal).toBe("GET_STRONGER");
  expect(intake.sections.HISTORY.values.level).toBe("INTERMEDIATE");
  expect(intake.sections.GOALS.values.notes).toBe(await notes.inputValue());
  report(`B17 stored: GOALS v${intake.sections.GOALS.version}, HISTORY v${intake.sections.HISTORY.version}`);
});
