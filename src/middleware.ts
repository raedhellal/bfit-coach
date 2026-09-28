import { NextResponse, type NextRequest } from "next/server";
import { hasCoachRole, isExpired, isPendingOnly } from "@/lib/jwt";
import { refreshOutcome } from "@/lib/refreshOutcome";

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
 * EV-278c — the one page a PENDING session may reach (ADR-0022 D22.9e: "only to the
 * activation route"), and a page a coach session never sees. /api/auth/activate, which
 * does the work, is under the excluded `/api/auth` prefix and checks the session itself.
 */
const ACTIVATE = "/activate";

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

/**
 * /unavailable — what a page load is served, with **503**, when its rotation could not
 * reach an answer (staff round 3 on EV-278c): `/auth/refresh` threw, answered 5xx, or
 * answered 429 from `AuthRateLimitGuard.onRefresh`, which throttles the portal server's
 * one IP for every coach at once. None of those is the session ending, so the cookies are
 * NOT cleared and nobody is sent to /login; the page says so and offers a reload of the
 * URL they asked for (a rewrite keeps it in the address bar).
 *
 * It is reached only by that rewrite. Middleware runs once per request and not again for
 * its own rewrite, so a direct visit — the only way `pathname` can be this — is sent home.
 */
const UNAVAILABLE = "/unavailable";

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
type Rotation =
  | { kind: "token"; accessToken: string; refreshToken: string; expiresIn?: number }
  | { kind: "expired" }
  | { kind: "unavailable" };

async function refresh(refreshToken: string): Promise<Rotation> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
  } catch {
    return { kind: "unavailable" };
  }
  // 401/403/4xx: the api refused this token. 429 and 5xx: it did not judge it at all.
  if (!res.ok) return { kind: refreshOutcome(res.status) };
  try {
    const body = (await res.json()) as {
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
    };
    if (!body?.accessToken || !body?.refreshToken) return { kind: "expired" };
    return {
      kind: "token",
      accessToken: body.accessToken,
      refreshToken: body.refreshToken,
      expiresIn: body.expiresIn,
    };
  } catch {
    // A 2xx whose body never arrived whole: the answer was lost, not a refusal.
    return { kind: "unavailable" };
  }
}

/** 503 at the URL asked for, cookies untouched — see `UNAVAILABLE`. */
function unavailable(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = UNAVAILABLE;
  url.search = "";
  const res = NextResponse.rewrite(url, { status: 503 });
  res.headers.set("Cache-Control", "no-store");
  return res;
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

  if (pathname === UNAVAILABLE) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!access && !refreshToken) return toLogin(req);

  let token = access;
  let rotated: Extract<Rotation, { kind: "token" }> | null = null;
  if (isExpired(token) && refreshToken) {
    const outcome = await refresh(refreshToken);
    if (outcome.kind === "expired") return toLogin(req, "expired");
    if (outcome.kind === "unavailable") return unavailable(req);
    rotated = outcome;
    token = rotated.accessToken;
  }

  if (isExpired(token)) return toLogin(req, "expired");

  /**
   * EV-278c — a PENDING session is confined to /activate, and a coach session is kept off
   * it. Checked BEFORE the coach test, and as a redirect rather than a login bounce: the
   * sign-in handler only writes a PENDING cookie after b-fit-api said the account is a
   * coach's to finish, so sending it back to /login would be a loop with no way forward.
   * Every other path — the roster, a trainee, the libraries, the fixture routes — answers
   * a 307 to /activate, so no page component that reads coach data ever renders for it.
   * (b-fit-api refuses the token on /coach-portal/* anyway; this is which screen to draw.)
   */
  let res: NextResponse;
  if (isPendingOnly(token)) {
    if (pathname === ACTIVATE) {
      res = NextResponse.next();
    } else {
      const url = req.nextUrl.clone();
      url.pathname = ACTIVATE;
      url.search = "";
      res = NextResponse.redirect(url);
    }
  } else if (!hasCoachRole(token)) {
    // AC1: only COACH accounts may enter. The sentence itself is rendered by /login.
    return toLogin(req, "not_coach");
  } else if (pathname === ACTIVATE) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    res = NextResponse.redirect(url);
  } else {
    res = DENIED_ROUTE.test(pathname)
      ? NextResponse.rewrite(req.nextUrl, { status: 403 })
      : NextResponse.next();
  }
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
