import { execFileSync } from "node:child_process";
import { expect, type APIRequestContext } from "@playwright/test";
import { API_ORIGIN, freshCoach, linkClient, login, type Account } from "./notifications-live";

/**
 * EV-455k — what `qa/notification-settings.live.spec.ts` adds to EV-455f's real-api rig
 * (`qa/notifications-live.ts`, whose accounts, invites and sign-ins it reuses as they are).
 * Every preference the specs read or set goes through b-fit-api's own
 * `GET`/`PUT /me/notification-preferences` (EV-455h). Nothing about preferences is SQL.
 *
 * ONE SQL step, the same one EV-455f's `freshCoach` takes and for the same reason (the api's
 * grant is the admin's MFA-gated `POST /admin/coaches`): `coachWhoTrains` grants COACH to an
 * account that is ALREADY the trainee of an ACTIVE link. EV-455h then lists the union of both
 * audiences' pairs for it (`NotificationPreferencesRepositoryImpl.READ`: COACH role, and
 * `is_linked_trainee`), four coach email pairs AND four trainee push pairs, which is the real
 * api answer with types this page does not show (story edge case).
 *
 * Environment: as EV-455f's rig (`EV455F_PSQL`, `COACH_LIVE_API_ORIGIN`, the raised auth caps).
 */

const PSQL = process.env.EV455F_PSQL ?? "";

function sql(statement: string): void {
  expect(PSQL, "EV455F_PSQL must name a psql command for the api's database (see qa/notifications-live.ts)").not.toBe("");
  execFileSync("sh", ["-c", `${PSQL} -v ON_ERROR_STOP=1 -At`], { input: statement, encoding: "utf8" });
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

export type ApiPreferences = {
  timezone: string;
  quietHours: { start: string; end: string } | null;
  channels: Record<string, { email?: boolean; push?: boolean }>;
};

/** The caller's document as the api serves it (the spec's read of AC-2). */
export async function apiPreferences(request: APIRequestContext, account: Account): Promise<ApiPreferences> {
  const res = await request.get(`${API_ORIGIN}/me/notification-preferences`, { headers: bearer(account.token) });
  expect(res.status(), `GET /me/notification-preferences: ${await res.text()}`).toBe(200);
  return (await res.json()) as ApiPreferences;
}

/** A merge `PUT`, as the api takes it. */
export async function apiPutPreferences(request: APIRequestContext, account: Account, body: Record<string, unknown>): Promise<ApiPreferences> {
  const res = await request.put(`${API_ORIGIN}/me/notification-preferences`, { headers: bearer(account.token), data: body });
  expect(res.status(), `PUT /me/notification-preferences: ${await res.text()}`).toBe(200);
  return (await res.json()) as ApiPreferences;
}

/** The four coach email values, by type, from an api document. */
export function emailValues(doc: ApiPreferences): Record<string, boolean | undefined> {
  const out: Record<string, boolean | undefined> = {};
  for (const type of ["CLIENT_MESSAGE", "CLIENT_JOINED", "CLIENT_RED_FLAG", "CLIENT_SESSION_COMPLETED"]) out[type] = doc.channels[type]?.email;
  return out;
}

/**
 * A coach whose account is also the trainee of an ACTIVE link to another coach (see above).
 * The token is minted after the grant, so it carries COACH (the portal's middleware needs it).
 */
export async function coachWhoTrains(request: APIRequestContext, name: string): Promise<Account> {
  const theirCoach = await freshCoach(request, "Coach Of A Coach");
  const { trainee } = await linkClient(request, theirCoach, name);
  expect(trainee.id).toMatch(/^[0-9a-f-]{36}$/);
  sql(
    `INSERT INTO user_roles (user_id, role) VALUES ('${trainee.id}'::uuid, 'COACH');\n` +
      `INSERT INTO coach_profiles (user_id, display_name, capacity_tier, created_at, granted_at, last_granted_at) ` +
      `VALUES ('${trainee.id}'::uuid, '${name.replace(/'/g, "''")}', 'STARTER', now(), now(), now());`
  );
  return { ...trainee, token: await login(request, trainee.email) };
}
