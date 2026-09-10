import "server-only";
import { cookies } from "next/headers";
import { IS_PROD } from "./env";
import { decodeJwt } from "./jwt";

/**
 * The BFF session (ADR-0012 D5, EV-183 AC1).
 *
 * Both tokens live in httpOnly cookies and never reach JavaScript: there is no
 * `localStorage` write anywhere in this app, and `document.cookie` cannot read these.
 * b-fit-admin does the opposite (`bfit_admin_access` in `localStorage`); that model is
 * deliberately NOT copied — this app is EV-060's pattern source, not its consumer.
 *
 * SameSite=Lax: the only cross-site entry point is a person following a link to
 * /login, which is a top-level GET, so Lax costs nothing and blocks form-POST CSRF
 * from another origin. Secure is set only in production because the demo runs on
 * http://<lan-ip>:3300 and a Secure cookie would simply never be stored there.
 *
 * Both cookies are scoped to `/`, not the refresh token to `/api/auth`. That tighter
 * scope was tried and rejected: a path-scoped refresh cookie is not sent on a page
 * request, so neither `middleware.ts` nor `apiFetch`'s 401 path — the two places a
 * refresh actually has to happen — can see it, and the "refresh on 401" requirement
 * becomes dead code that silently logs the coach out instead. Path-scoping a cookie
 * is not a security boundary in a same-origin app anyway; httpOnly is.
 */
export const ACCESS_COOKIE = "evoli_pro_at";
export const REFRESH_COOKIE = "evoli_pro_rt";

const REFRESH_PATH = "/";

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires, as returned by the api. */
  expiresIn?: number;
}

function accessCookieOptions(maxAge?: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: IS_PROD,
    path: "/",
    ...(maxAge ? { maxAge } : {}),
  };
}

function refreshCookieOptions() {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: IS_PROD,
    path: REFRESH_PATH,
    // 30 days: the api's refresh TTL is the real limit; this is only the browser's copy.
    maxAge: 60 * 60 * 24 * 30,
  };
}

/** Route handlers only — Next.js forbids writing cookies while rendering. */
export function writeSession(tokens: SessionTokens): void {
  const store = cookies();
  store.set(ACCESS_COOKIE, tokens.accessToken, accessCookieOptions(tokens.expiresIn));
  store.set(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOptions());
}

export function clearSession(): void {
  const store = cookies();
  store.set(ACCESS_COOKIE, "", { ...accessCookieOptions(), maxAge: 0 });
  store.set(REFRESH_COOKIE, "", { ...refreshCookieOptions(), maxAge: 0 });
}

export function readAccessToken(): string | null {
  return cookies().get(ACCESS_COOKIE)?.value || null;
}

export function readRefreshToken(): string | null {
  return cookies().get(REFRESH_COOKIE)?.value || null;
}

/** Display identity for the shell. Never an authorization decision. */
export function readSessionEmail(): string | null {
  const token = readAccessToken();
  if (!token) return null;
  const claims = decodeJwt(token);
  return claims?.email || claims?.sub || null;
}

export const cookieOptions = { accessCookieOptions, refreshCookieOptions, REFRESH_PATH };
