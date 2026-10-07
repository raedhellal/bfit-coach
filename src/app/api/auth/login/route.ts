import { NextResponse } from "next/server";
import { ApiError, apiPost } from "@/lib/apiFetch";
import { coachApi, type ActivationStatus } from "@/lib/coachApi";
import { fixtureLoginIdentity } from "@/lib/coachApi.fixture";
import { COACH_API_MODE } from "@/lib/env";
import { mintFixtureToken } from "@/lib/fixtureToken";
import { hasCoachRole, isPendingOnly } from "@/lib/jwt";
import { refuseCrossOrigin } from "@/lib/sameOrigin";
import { writeSession, type SessionTokens } from "@/lib/session";
import { rememberCoach } from "@/lib/rememberCoach";

/**
 * POST /api/auth/login — the BFF sign-in (EV-183 AC1, ADR-0012 D5).
 *
 * The browser posts credentials HERE, not to b-fit-api. This handler makes the
 * server-to-server call, and the tokens it receives go straight into httpOnly
 * cookies: they are never in the response body, never in `localStorage`, never
 * readable by `document.cookie`. b-fit-admin does the opposite; that model is
 * deliberately not copied.
 *
 * Because the browser never reaches the api directly, CORS is not involved and
 * `:3300` needs no entry in BFIT_CORS_ALLOWED_ORIGINS.
 *
 * ADR-0012 names this handler `src/app/api/session/route.ts` with POST/DELETE. It is
 * split into /api/auth/login and /api/auth/logout instead — same cookies, same
 * lifecycle, two verbs that read as what they are. Worth a line in the ADR when it
 * moves from PROPOSED to ACCEPTED.
 */

interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: string;
  mfaRequired?: boolean;
  mfaToken?: string;
  methods?: string[];
}

function fail(status: number, code: string) {
  return NextResponse.json({ code }, { status });
}

/**
 * EV-278c — where a session goes once it exists. A closed set, never a value taken from
 * the request: the form navigates to what this handler says, so an open value here would
 * be an open redirect.
 */
type Landing = "/" | "/activate";

async function signedIn(tokens: SessionTokens, next: Landing) {
  writeSession(tokens);
  if (next === "/") await rememberCoach(tokens.accessToken);
  return NextResponse.json({ ok: true, next });
}

/**
 * EV-278c / ADR-0022 D22.9e — a token whose roles are exactly `["PENDING"]`.
 *
 * It is admitted ONLY once `GET /me/activation` says the account is pending with a
 * coach's grant, and then only to /activate (middleware confines it there). Anything
 * else writes NO cookie, so the session never starts:
 *   - a trainee's pending account (`grantedRole: USER`) — "today's refusal, pointing at
 *     the app" (D22.9e): the trainee finishes in Evoli Fit;
 *   - `409 ACCOUNT_NOT_INITIALISED` — a data defect the person cannot fix from here;
 *   - `pending: false` on a PENDING token, or any other grant (a `GYM_OWNER` arrives with
 *     EV-281a, and the portal has no gym home until EV-281b) — the ordinary AC1 refusal.
 * An expired account IS admitted: the activation screen is where it is told so, with who
 * to ask, and a PENDING session can reach nothing else anyway.
 */
async function admitPending(tokens: SessionTokens) {
  let status: ActivationStatus;
  try {
    status = await coachApi.getActivation(tokens.accessToken);
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.code === "ACCOUNT_NOT_INITIALISED") return fail(409, "ACCOUNT_NOT_INITIALISED");
      return fail(502, "LOGIN_FAILED");
    }
    return fail(503, "API_UNAVAILABLE");
  }
  if (status.pending && status.grantedRole === "COACH") return signedIn(tokens, "/activate");
  if (status.pending && status.grantedRole === "USER") return fail(403, "PENDING_TRAINEE");
  return fail(403, "NOT_A_COACH");
}

export async function POST(request: Request) {
  // Login CSRF: another site must not be able to sign this browser in (see sameOrigin.ts).
  const crossOrigin = refuseCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  let email = "";
  let password = "";
  try {
    const body = (await request.json()) as { email?: string; password?: string };
    email = (body.email || "").trim();
    password = body.password || "";
  } catch {
    return fail(400, "BAD_REQUEST");
  }
  if (!email || !password) return fail(400, "BAD_REQUEST");

  if (COACH_API_MODE === "fixture") {
    // Any password signs in; the temporary one is checked where the api checks it, at
    // activation. The roles are the fixture account's (EV-278c) or the ordinary coach's.
    const identity = fixtureLoginIdentity(email);
    const tokens: SessionTokens = {
      accessToken: mintFixtureToken(email, identity.roles, identity.sub),
      refreshToken: "fixture-refresh",
      expiresIn: 60 * 60 * 8,
    };
    if (isPendingOnly(tokens.accessToken)) return admitPending(tokens);
    if (!hasCoachRole(tokens.accessToken)) return fail(403, "NOT_A_COACH");
    return signedIn(tokens, "/");
  }

  let response: LoginResponse;
  try {
    response = await apiPost<LoginResponse>("/auth/login", { email, password });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) return fail(401, "INVALID_CREDENTIALS");
      if (err.status === 429) return fail(429, "RATE_LIMITED");
      return fail(err.status, err.code || "LOGIN_FAILED");
    }
    // fetch itself failed — the api is down or the base URL is wrong.
    return fail(503, "API_UNAVAILABLE");
  }

  // `LoginResponse` is a union in one record: either the token fields are set, or
  // `mfaRequired=true` with an `mfaToken` and NO accessToken. MFA on coach login is
  // EV-059, a follow-up in ADR-0012 — so this is reported honestly instead of
  // crashing on a missing token.
  if (!response.accessToken || !response.refreshToken) {
    if (response.mfaRequired) return fail(409, "MFA_UNSUPPORTED");
    return fail(502, "LOGIN_FAILED");
  }

  const tokens: SessionTokens = {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresIn: response.expiresIn,
  };

  // EV-278c: an initialised account signing in with its emailed temporary password.
  if (isPendingOnly(tokens.accessToken)) return admitPending(tokens);

  // AC1: only COACH accounts may enter. `GET /me` (`UserResponse`) exposes id, email,
  // fullName, createdAt and emailVerified and NO roles, so the role is read from the
  // access token's `roles` claim (JwtTokenService) — see src/lib/jwt.ts.
  if (!hasCoachRole(tokens.accessToken)) {
    return fail(403, "NOT_A_COACH"); // no cookie is written: the session never starts
  }

  return signedIn(tokens, "/");
}
