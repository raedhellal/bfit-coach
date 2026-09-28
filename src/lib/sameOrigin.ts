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
 *   - an `Origin` header that is not this request's origin — scheme AND host, so
 *     `https://portal` is not `http://portal` (staff round 3, nit 1) → 403 `CROSS_ORIGIN`;
 *   - `Origin: null` (a sandboxed frame, a data: URL, some cross-origin redirects) → 403;
 *   - no `Origin` header, but `Sec-Fetch-Site` saying the request came from another site
 *     (`cross-site`, `same-site`) → 403 (nit 2). A browser that omitted Origin but sent
 *     the fetch metadata has told us where the request came from;
 *   - no `Origin` header otherwise → allowed. Every browser sends `Origin` on a POST,
 *     same-origin included, so an absent header is a non-browser client (curl, the
 *     Playwright request context), which has no victim's cookie jar to ride.
 *
 * "This request's origin" is `x-forwarded-proto` + `x-forwarded-host` — what Vercel's
 * edge (and Next's own server) set to the public scheme and host — falling back to the
 * request URL's scheme and the `Host` header. A page on another site cannot set any of
 * them: a custom header on a cross-origin request needs a CORS preflight, and nothing
 * here answers one.
 */
const FOREIGN_FETCH_SITES = new Set(["cross-site", "same-site"]);

function ownOrigin(request: Request): string | null {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return null;
  let scheme = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (!scheme) {
    try {
      scheme = new URL(request.url).protocol.replace(/:$/, "");
    } catch {
      return null;
    }
  }
  try {
    return new URL(`${scheme}://${host}`).origin.toLowerCase();
  } catch {
    return null;
  }
}

export function refuseCrossOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (origin === null) {
    const site = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
    return site && FOREIGN_FETCH_SITES.has(site) ? crossOrigin() : null;
  }
  let claimed: string | null = null;
  try {
    claimed = origin === "null" ? null : new URL(origin).origin.toLowerCase();
  } catch {
    claimed = null;
  }
  const own = ownOrigin(request);
  if (own && claimed && claimed === own) return null;
  return crossOrigin();
}

function crossOrigin() {
  return NextResponse.json({ code: "CROSS_ORIGIN" }, { status: 403 });
}
