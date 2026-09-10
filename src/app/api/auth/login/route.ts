import { NextResponse } from "next/server";
import { ApiError, apiPost } from "@/lib/apiFetch";
import { COACH_API_MODE } from "@/lib/env";
import { hasCoachRole } from "@/lib/jwt";
import { writeSession } from "@/lib/session";

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
 * Fixture mode has to mint something the middleware can read, so it builds an
 * unsigned token with the same claim shape b-fit-api uses. It is accepted by nothing
 * but this app's own routing: every api call in fixture mode is served from
 * coachApi.fixture.ts and never leaves the process. Gated on the server env, so it
 * cannot be turned on from a browser.
 */
function fixtureToken(email: string): string {
  const enc = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const payload = {
    sub: "1a2b3c4d-0000-4000-8000-00000000c0ac",
    email,
    roles: ["USER", "COACH"],
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8,
  };
  return `${enc({ alg: "none", typ: "JWT" })}.${enc(payload)}.fixture`;
}

export async function POST(request: Request) {
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
    writeSession({
      accessToken: fixtureToken(email),
      refreshToken: "fixture-refresh",
      expiresIn: 60 * 60 * 8,
    });
    return NextResponse.json({ ok: true });
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

  // AC1: only COACH accounts may enter. `GET /me` (`UserResponse`) exposes id, email,
  // fullName, createdAt and emailVerified and NO roles, so the role is read from the
  // access token's `roles` claim (JwtTokenService) — see src/lib/jwt.ts.
  if (!hasCoachRole(response.accessToken)) {
    return fail(403, "NOT_A_COACH"); // no cookie is written: the session never starts
  }

  writeSession({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    expiresIn: response.expiresIn,
  });
  return NextResponse.json({ ok: true });
}
