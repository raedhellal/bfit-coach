import { NextResponse } from "next/server";

/**
 * The Origin allowlist for the `/api/auth/*` handlers — the three routes that WRITE the
 * session (sign in, activate, sign out). The list is one entry long: this portal's own
 * origin.
 *
 * SameSite=Lax already keeps the session cookies off a cross-site `fetch` POST, so this is
 * the second lock on the same door, and it is here because those handlers are the ones the
 * middleware matcher excludes: nothing else looks at them before they act. A cross-origin
 * sign-in would plant an attacker's session in the victim's browser (login CSRF); a
 * cross-origin activation would finish somebody's account with a consent they never gave.
 *
 * The rule:
 *   - an `Origin` header whose host is not this request's host → 403 `CROSS_ORIGIN`;
 *   - `Origin: null` (a sandboxed frame, a data: URL, some cross-origin redirects) → 403;
 *   - no `Origin` header at all → allowed. Every browser sends `Origin` on a POST,
 *     same-origin included, so an absent header is a non-browser client (curl, the
 *     Playwright request context), which has no victim's cookie jar to ride.
 *
 * "This request's host" is the `Host` header — `x-forwarded-host` first, which is what
 * Vercel's edge sets to the public host. A page on another site cannot set either: a
 * custom header on a cross-origin request needs a CORS preflight, and nothing here
 * answers one.
 */
export function refuseCrossOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (origin === null) return null;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin === "null" ? null : new URL(origin).host;
  } catch {
    originHost = null;
  }
  if (host && originHost && originHost.toLowerCase() === host.toLowerCase()) return null;
  return NextResponse.json({ code: "CROSS_ORIGIN" }, { status: 403 });
}
