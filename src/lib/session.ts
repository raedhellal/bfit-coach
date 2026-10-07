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
/**
 * EV-342k — who the shell says is signed in, so no page but the roster reads
 * `GET /coach-portal/me` for it. See `writeCoachIdentity`.
 */
export const IDENTITY_COOKIE = "evoli_pro_coach";

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
  // EV-342k K.4: a session that ends takes its name with it.
  store.set(IDENTITY_COOKIE, "", { ...refreshCookieOptions(), maxAge: 0 });
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

/**
 * EV-342k — the coach's id and display name, the only two fields of `GET /coach-portal/me`
 * that a page other than the roster uses (the shell's name; the overview's analytics
 * `coachId`). Written by the sign-in and activation handlers, read by `readCoachMe`.
 *
 * **Display only, never an authorization input.** The api decides every read from the
 * bearer token; this cookie decides which name the header prints. A stale value is
 * harmless: a rename made elsewhere shows on the roster (which keeps its `/me` read for
 * the capacity, K.3) at once, and on the other pages from the next sign-in.
 *
 * **Bound to the access token's `sub`.** The value carries the subject it was written
 * for, and `readCoachIdentity` honours it only when the CURRENT token has the same
 * subject. Every session end clears it (`clearSession`, middleware's `toLogin`), but a
 * cookie that outlives a session some other way (a browser that dropped one cookie and
 * not another, a second account signed in over the first) then reads as absent, and
 * absent falls back to one `/me` read. It is never another coach's name, and never
 * another coach's id in an analytics event.
 *
 * httpOnly like the tokens, same lifetime as the refresh cookie: there is nothing for
 * browser JavaScript to do with it, and it should not outlive the session it names.
 */
export interface CoachIdentity {
  coachId: string;
  displayName: string;
}

interface IdentityCookieValue {
  /** The access token's `sub` at the time of writing. */
  s: string;
  c: string;
  n: string;
}

function tokenSubject(token: string | null): string | null {
  if (!token) return null;
  const sub = decodeJwt(token)?.sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}

/** Route handlers only, like `writeSession`. No subject in the token → no cookie. */
export function writeCoachIdentity(accessToken: string, identity: CoachIdentity): void {
  const s = tokenSubject(accessToken);
  if (!s || !identity.coachId || !identity.displayName) return;
  const value: IdentityCookieValue = { s, c: identity.coachId, n: identity.displayName };
  cookies().set(IDENTITY_COOKIE, JSON.stringify(value), refreshCookieOptions());
}

/** The identity this session's token was signed in as, or null (absent, unreadable, or written for another subject). */
export function readCoachIdentity(): CoachIdentity | null {
  const raw = cookies().get(IDENTITY_COOKIE)?.value;
  if (!raw) return null;
  const sub = tokenSubject(readAccessToken());
  if (!sub) return null;
  try {
    const value = JSON.parse(raw) as Partial<IdentityCookieValue> | null;
    if (!value || value.s !== sub) return null;
    if (typeof value.c !== "string" || !value.c) return null;
    if (typeof value.n !== "string" || !value.n.trim()) return null;
    return { coachId: value.c, displayName: value.n };
  } catch {
    return null;
  }
}

export const cookieOptions = { accessCookieOptions, refreshCookieOptions, REFRESH_PATH };
