import { NextResponse, type NextRequest } from "next/server";
import { hasCoachRole, isExpired } from "@/lib/jwt";

/**
 * The route guard (EV-183 AC1, ADR-0012 D5).
 *
 * Every page except /login requires a session cookie whose access token carries the
 * COACH role. A request without one never reaches a page component, so no roster
 * component ever mounts for a non-coach — the rejection is server-side, which is what
 * AC1 asks for.
 *
 * This is a routing decision, not the authorization decision: b-fit-api verifies the
 * token's signature and `CoachAccessGuard` decides what may be read (ADR-0001,
 * ADR-0012 D3). Middleware only decides which screen to draw. That distinction is why
 * decoding the claim without verifying the signature is acceptable here — and it is
 * also why nothing in this file may ever become the only check on a read.
 */

const ACCESS_COOKIE = "evoli_pro_at";
const REFRESH_COOKIE = "evoli_pro_rt";
const LOGIN = "/login";

/**
 * /clients/denied — the one route this app serves with a non-200 status
 * (EV-183 AC5, BUG-139).
 *
 * A Next.js page render cannot set a response status, so `/clients/[id]`'s layout
 * redirects here when b-fit-api answers 403 for the id and middleware — the only layer
 * that can — rewrites the path onto itself with `status: 403`. The rewrite (rather than a bare
 * `new NextResponse(html)`) is what keeps the friendly sentence in JSX: the page still
 * renders through the normal pipeline, it is simply served under 403.
 *
 * The authorization decision is still b-fit-api's and is still made per request by the
 * overview's own fetch. This regex only decides which status a page that has ALREADY
 * been denied is served with, which is why matching it does not weaken ADR-0012 D3.
 */
const DENIED_ROUTE = /^\/clients\/denied\/?$/;

const API_BASE_URL = (process.env.API_BASE_URL || "http://localhost:8080").replace(
  /\/+$/,
  ""
);
const IS_PROD = process.env.NODE_ENV === "production";

function cookieOptions(path = "/") {
  return { httpOnly: true, sameSite: "lax" as const, secure: IS_PROD, path };
}

function toLogin(req: NextRequest, reason?: "not_coach" | "expired") {
  const url = req.nextUrl.clone();
  url.pathname = LOGIN;
  url.search = reason ? `?error=${reason}` : "";
  const res = NextResponse.redirect(url);
  res.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return res;
}

/**
 * Proactive rotation. The alternative — letting every page render fail with a 401 and
 * refreshing there — cannot write the new cookie back, because Next.js makes the
 * cookie store read-only during a render. Middleware can, so the rotation happens
 * here and `apiFetch`'s 401 path stays as the fallback for a token that expires
 * mid-render.
 */
async function refresh(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
} | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
    };
    if (!body?.accessToken || !body?.refreshToken) return null;
    return {
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresIn: body.expiresIn,
    };
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  /**
   * /api/version is the second PUBLIC route: the deploy marker (the portal's
   * /actuator/info). It has to answer before a session exists — verifying which commit
   * is serving is what you do BEFORE anyone signs in, and a redirect to /login here
   * would make the endpoint useless. Like /i/*, it stays inside the matcher so that
   * being public is stated here rather than hidden in the regex, and the method is
   * narrowed the same way.
   */
  if (pathname === "/api/version") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new NextResponse(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    return NextResponse.next();
  }

  /**
   * /i/* is the public PAGE route (ADR-0012 D5, edge case 3): an invited trainee has no
   * Evoli Pro account and could never pass the guard below. It stays inside the matcher
   * rather than being excluded from it, so that this file — not a silent gap in a regex
   * — is what states the route is public, and so the method can be narrowed: the page is
   * a read, and a POST to a public URL that carries a single-use credential should be
   * refused rather than served.
   */
  if (pathname === "/i" || pathname.startsWith("/i/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return new NextResponse(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    return NextResponse.next();
  }
  const access = req.cookies.get(ACCESS_COOKIE)?.value || null;
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value || null;
  const onLogin = pathname === LOGIN;

  // A signed-in coach never sits on the login screen.
  if (onLogin) {
    if (access && !isExpired(access) && hasCoachRole(access)) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!access && !refreshToken) return toLogin(req);

  let token = access;
  let rotated: Awaited<ReturnType<typeof refresh>> = null;
  if (isExpired(token) && refreshToken) {
    rotated = await refresh(refreshToken);
    if (!rotated) return toLogin(req, "expired");
    token = rotated.accessToken;
  }

  if (isExpired(token)) return toLogin(req, "expired");
  // AC1: only COACH accounts may enter. The sentence itself is rendered by /login.
  if (!hasCoachRole(token)) return toLogin(req, "not_coach");

  const res = DENIED_ROUTE.test(pathname)
    ? NextResponse.rewrite(req.nextUrl, { status: 403 })
    : NextResponse.next();
  if (rotated) {
    res.cookies.set(ACCESS_COOKIE, rotated.accessToken, {
      ...cookieOptions(),
      ...(rotated.expiresIn ? { maxAge: rotated.expiresIn } : {}),
    });
    res.cookies.set(REFRESH_COOKIE, rotated.refreshToken, {
      ...cookieOptions(),
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}

export const config = {
  /**
   * Everything except Next's own assets and the auth route handlers.
   *
   * `/api/auth/*` is excluded because those handlers ARE the way in and out of a
   * session; guarding them would make login unreachable.
   *
   * `/i/*` is deliberately NOT excluded here — it is handled at the top of `middleware`,
   * where being public is an explicit statement with an explicit method check instead of
   * an absence from a regex.
   */
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
