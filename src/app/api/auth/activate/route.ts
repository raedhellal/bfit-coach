import { NextResponse } from "next/server";
import { ApiError, coachApi, type ActivateAccountRequest } from "@/lib/coachApi";
import { hasCoachRole, isPendingOnly } from "@/lib/jwt";
import { routeAccessToken } from "@/lib/routeSession";
import { refuseCrossOrigin } from "@/lib/sameOrigin";
import { clearSession, writeSession } from "@/lib/session";

/**
 * POST /api/auth/activate — EV-278c, ADR-0022 D22.9: finish an account the admin
 * initialised, then swap the session to the fresh tokens.
 *
 * A route handler and not a server action because it WRITES the session (both cookies),
 * and this app writes cookies in `/api/auth/*` handlers only (ADR-0012 D5). It sits under
 * `/api/auth`, which the middleware matcher excludes, so it does for itself the three
 * things middleware would have done: refuses a cross-origin POST (`sameOrigin.ts`),
 * ROTATES an access token that is missing or expired (`routeSession.ts` — the access
 * cookie outlives nobody who spends fifteen minutes on the form), and checks the caller
 * holds a PENDING session. b-fit-api then decides everything else.
 *
 * ── the consent rule, which is why this file exists rather than a thin proxy ──────────
 * EV-278: *whoever creates an account only initialises it*; the person consents when they
 * finish it. So the only `consentAccepted` this surface ever sends is the coach's own
 * tick, and anything that is not the JSON literal `true` — `false`, absent, `"true"`, `1`
 * — is refused HERE with `400 CONSENT_REQUIRED` and never reaches the api. The body sent
 * on is built field by field: no `role` (D22.9a: the grant comes from the api's row) and
 * no `fullName` (the portal cannot show the name that would be corrected; see the
 * deviation register).
 *
 * On success the fresh tokens replace the PENDING ones before anything else is read: the
 * old access token still says PENDING and the api refuses it outside the allowlist, and
 * the old refresh token died with the `token_version` bump. A fresh token without COACH
 * cannot land anywhere here, so the session is cleared and the person told to sign in.
 */

type Body = Partial<Record<keyof ActivateAccountRequest, unknown>>;

function refuse(status: number, code: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ code, ...extra }, { status });
}

export async function POST(request: Request) {
  const crossOrigin = refuseCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const session = await routeAccessToken();
  if (session.kind === "unavailable") return refuse(503, "API_UNAVAILABLE");
  if (session.kind === "expired") return refuse(401, "SESSION_EXPIRED");
  // Checked on the ROTATED token too: the refresh answers with the account's current roles.
  if (!isPendingOnly(session.accessToken)) return refuse(409, "ACCOUNT_ALREADY_ACTIVE");

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return refuse(400, "VALIDATION_ERROR");
  }
  if (!body || typeof body !== "object") return refuse(400, "VALIDATION_ERROR");

  // The coach's own tick, and nothing that merely looks like one.
  if (body.consentAccepted !== true) return refuse(400, "CONSENT_REQUIRED");

  const { temporaryPassword, newPassword, privacyPolicyVersion, termsVersion } = body;
  if (
    typeof temporaryPassword !== "string" ||
    typeof newPassword !== "string" ||
    typeof privacyPolicyVersion !== "string" ||
    typeof termsVersion !== "string"
  ) {
    return refuse(400, "VALIDATION_ERROR");
  }

  const sent: ActivateAccountRequest = {
    temporaryPassword,
    newPassword,
    consentAccepted: body.consentAccepted,
    privacyPolicyVersion,
    termsVersion,
  };

  try {
    const tokens = await coachApi.activate(sent);
    if (!tokens?.accessToken || !tokens?.refreshToken || !hasCoachRole(tokens.accessToken)) {
      clearSession();
      return refuse(502, "ACTIVATED_SIGN_IN_AGAIN");
    }
    writeSession(tokens);
    // No destination: the form goes to "/" itself, and middleware decides from there.
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.status === 401) {
        // apiFetch already tried a refresh; the session is gone.
        clearSession();
        return refuse(401, "SESSION_EXPIRED");
      }
      const code = err.code || "ACTIVATION_FAILED";
      if (code === "CONSENT_VERSION_STALE") {
        const p = err.details?.privacyPolicyVersion;
        const t = err.details?.termsVersion;
        return refuse(err.status, code, {
          versions:
            typeof p === "string" && typeof t === "string"
              ? { privacyPolicyVersion: p, termsVersion: t }
              : null,
        });
      }
      if (code === "RATE_LIMITED") {
        return refuse(429, code, { retryAfterSeconds: err.retryAfterSeconds });
      }
      return refuse(err.status >= 400 && err.status < 600 ? err.status : 502, code);
    }
    // A thrown fetch: the api may have committed the activation and lost the reply, so
    // nothing said to the person may claim the account is unchanged (copy.activate.unavailable).
    return refuse(503, "API_UNAVAILABLE");
  }
}
