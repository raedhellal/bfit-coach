import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Page, type Request } from "@playwright/test";

/**
 * EV-455f — the real-api rig for `qa/notifications.live.spec.ts`. No item is invented: every
 * `CLIENT_*` item the specs read was written by b-fit-api's own producers (EV-455d), driven
 * through its public endpoints exactly as the trainee app drives them:
 *
 *   CLIENT_JOINED            ← POST /coach-portal/invites (coach) + POST /me/my-coach/accept (trainee)
 *   CLIENT_MESSAGE           ← POST /me/my-coach/messages (trainee; collapses per client, X3)
 *   CLIENT_SESSION_COMPLETED ← POST /me/workouts/complete (trainee; one item per session)
 *
 * TWO steps are SQL, and only these two, each because the api has no route a spec can drive:
 *
 *   1. `grantCoach`: COACH on a freshly registered account. The api's route is the admin's
 *      `POST /admin/coaches`, which needs an admin session that proved a second factor (TOTP) and
 *      an email-verified account. The SQL writes exactly the two rows that grant writes
 *      (`user_roles` COACH, `coach_profiles` at STARTER). A fresh coach per test is what makes the
 *      counts exact (AC-1, AC-2, AC-3 count a WHOLE inbox) and the suite re-runnable: the seeded
 *      coach's inbox only grows.
 *   2. `insertRedFlagItem`: one `CLIENT_RED_FLAG` row. Its producer is EV-455e, which is not on api
 *      `main`; the row is written in the shape EV-455b's table holds, and the api serves it like any
 *      other. Used by AC-4's red-flag leg ONLY (where it opens), never to make a count.
 *
 * Environment (the run FAILS, it does not skip, when one is missing):
 *   COACH_LIVE_API_ORIGIN  the api (default http://localhost:8099, as every live spec)
 *   EV455F_PSQL            a command that runs SQL from stdin against the api's database, e.g.
 *                          `psql postgresql://bfit:bfit@127.0.0.1:5433/bfit` or
 *                          `docker exec -i b-fit-api-db-1 psql -U bfit -d bfit`
 * The api must run with its auth burst caps raised (a test registers two accounts and signs in
 * three times): BFIT_AUTH_RATE_LIMIT_LOGIN_PER_IP / _LOGIN_PER_ACCOUNT / _REGISTER_PER_IP = 1000+.
 */

export const API_ORIGIN = process.env.COACH_LIVE_API_ORIGIN || "http://localhost:8099";
const PSQL = process.env.EV455F_PSQL ?? "";
export const PASSWORD = "Password123!";
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
let serial = 0;

export type Account = { id: string; email: string; name: string; token: string };
export type Linked = { trainee: Account; coachClientId: string };

function sql(statement: string): string {
  expect(PSQL, "EV455F_PSQL must name a psql command for the api's database (see qa/notifications-live.ts)").not.toBe("");
  return execFileSync("sh", ["-c", `${PSQL} -v ON_ERROR_STOP=1 -At`], { input: statement, encoding: "utf8" }).trim();
}

const uuidLiteral = (id: string) => {
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return `'${id}'::uuid`;
};

async function register(request: APIRequestContext, name: string, kind: "coach" | "client"): Promise<Account> {
  serial += 1;
  const email = `ev455f-${kind}-${RUN}-${serial}@example.test`;
  const res = await request.post(`${API_ORIGIN}/auth/register`, {
    data: {
      email,
      password: PASSWORD,
      fullName: name,
      consentAccepted: true,
      privacyPolicyVersion: "v1.0",
      termsVersion: "v1.0",
      healthDataConsentAccepted: true,
    },
  });
  expect(res.status(), `register ${kind}: ${await res.text()}`).toBe(201);
  const body = (await res.json()) as { user: { id: string }; tokens: { accessToken: string } };
  return { id: body.user.id, email, name, token: body.tokens.accessToken };
}

export async function login(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post(`${API_ORIGIN}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status(), `login ${email}`).toBe(200);
  const body = (await res.json()) as { accessToken?: string };
  expect(body.accessToken, "login returns an access token (no MFA on these accounts)").toBeTruthy();
  return body.accessToken!;
}

/** A new coach with an EMPTY inbox (see step 1 above). The token is minted after the grant. */
export async function freshCoach(request: APIRequestContext, name = "Coach Notif"): Promise<Account> {
  const account = await register(request, name, "coach");
  sql(
    `INSERT INTO user_roles (user_id, role) VALUES (${uuidLiteral(account.id)}, 'COACH');\n` +
      `INSERT INTO coach_profiles (user_id, display_name, capacity_tier, created_at, granted_at, last_granted_at) ` +
      `VALUES (${uuidLiteral(account.id)}, '${name.replace(/'/g, "''")}', 'STARTER', now(), now(), now());`
  );
  return { ...account, token: await login(request, account.email) };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** A client of `coach`, through a real invite. Their acceptance is the coach's CLIENT_JOINED item. */
export async function linkClient(request: APIRequestContext, coach: Account, name: string): Promise<Linked> {
  const trainee = await register(request, name, "client");
  const invite = await request.post(`${API_ORIGIN}/coach-portal/invites`, { headers: bearer(coach.token), data: {} });
  expect(invite.status(), `invite: ${await invite.text()}`).toBe(201);
  const { token } = (await invite.json()) as { token: string };
  const accept = await request.post(`${API_ORIGIN}/me/my-coach/accept`, {
    headers: bearer(trainee.token),
    data: { token, privacyPolicyVersion: "v1.0" },
  });
  expect(accept.status(), `accept: ${await accept.text()}`).toBe(200);
  const roster = await request.get(`${API_ORIGIN}/coach-portal/clients`, { headers: bearer(coach.token) });
  expect(roster.status()).toBe(200);
  const rows = ((await roster.json()) as { items?: { id: string; traineeDisplayName: string | null }[] }).items ?? [];
  const row = rows.find((r) => r.traineeDisplayName === name);
  expect(row, `the roster lists ${name}`).toBeTruthy();
  return { trainee, coachClientId: row!.id };
}

/** One message from the client: the coach's CLIENT_MESSAGE item (a second one collapses into it, X3). */
export async function clientWrites(request: APIRequestContext, client: Account, body = "Bonjour coach"): Promise<void> {
  const res = await request.post(`${API_ORIGIN}/me/my-coach/messages`, {
    headers: bearer(client.token),
    data: { clientMessageId: randomUUID(), body },
  });
  expect(res.status(), `message: ${await res.text()}`).toBe(201);
}

/** The mainline seed plan's seven workouts (mainline Flyway V3): `11111111-1111-1111-1111-1111111111{01..07}`. */
const WORKOUTS = Array.from({ length: 7 }, (_, i) => `11111111-1111-1111-1111-1111111111${String(i + 1).padStart(2, "0")}`);

function isoDay(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

/**
 * `n` completed sessions: `n` CLIENT_SESSION_COMPLETED items (one per session). Each is a distinct
 * (workout, day) pair, the api's completion key, so none is the replay of another.
 */
export async function clientCompletes(request: APIRequestContext, client: Account, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const workoutId = WORKOUTS[i % WORKOUTS.length];
    const date = isoDay(1 + Math.floor(i / WORKOUTS.length));
    const res = await request.post(`${API_ORIGIN}/me/workouts/complete`, {
      headers: bearer(client.token),
      data: { workoutId, date, durationSeconds: 1800 },
    });
    expect(res.status(), `complete ${i}: ${await res.text()}`).toBe(200);
  }
}

export async function revoke(request: APIRequestContext, coach: Account, coachClientId: string): Promise<void> {
  const res = await request.post(`${API_ORIGIN}/coach-portal/clients/${coachClientId}/revoke`, { headers: bearer(coach.token) });
  expect(res.status(), `revoke: ${await res.text()}`).toBeLessThan(300);
}

export type ApiItem = { id: string; type: string; readAt: string | null; actor: { displayName: string | null }; target: { coachClientId: string | null } };

/** The coach's whole inbox as the api serves it, newest first (the order the page must show). */
export async function apiInbox(request: APIRequestContext, coach: Account): Promise<ApiItem[]> {
  const out: ApiItem[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const query: string = cursor ? `?limit=50&cursor=${encodeURIComponent(cursor)}` : "?limit=50";
    const res = await request.get(`${API_ORIGIN}/me/notifications${query}`, { headers: bearer(coach.token) });
    expect(res.status()).toBe(200);
    const page = (await res.json()) as { items: ApiItem[]; nextCursor: string | null };
    out.push(...page.items);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return out;
}

export async function apiUnread(request: APIRequestContext, coach: Account): Promise<number> {
  const res = await request.get(`${API_ORIGIN}/me/notifications/unread-count`, { headers: bearer(coach.token) });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { count: number }).count;
}

export async function apiMarkRead(request: APIRequestContext, coach: Account, id: string): Promise<void> {
  const res = await request.post(`${API_ORIGIN}/me/notifications/${id}/read`, { headers: bearer(coach.token) });
  expect(res.status()).toBe(204);
}

/** See step 2 above: one CLIENT_RED_FLAG row about `link`, in EV-455b's table shape. */
export function insertRedFlagItem(coach: Account, link: Linked): void {
  sql(
    `INSERT INTO notifications (id, recipient_id, subject_id, coach_client_id, type, event_key, count, created_at, event_at) ` +
      `VALUES (gen_random_uuid(), ${uuidLiteral(coach.id)}, ${uuidLiteral(link.trainee.id)}, ${uuidLiteral(link.coachClientId)}, ` +
      `'CLIENT_RED_FLAG', 'ev455f-spec:${randomUUID()}', 1, now(), now());`
  );
}

/** Every `GET /api/bff/notifications/unread-count` the PAGE sends, with its time. */
export function recordCountReads(page: Page): number[] {
  const at: number[] = [];
  page.on("request", (r: Request) => {
    if (r.method() === "GET" && new URL(r.url()).pathname === "/api/bff/notifications/unread-count") at.push(Date.now());
  });
  return at;
}

/** EV-095b's visibility switch: `document.visibilityState` / `hidden` overridden, and the event fired. */
export async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}
