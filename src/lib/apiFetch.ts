import "server-only";
import { apiUrl } from "./env";
import { ACCESS_COOKIE, readAccessToken, readRefreshToken } from "./session";
import { cookies } from "next/headers";

/**
 * Server-side fetch against b-fit-api. The ONLY place an `Authorization` header is
 * produced in this app. Nothing here may be imported from a client component —
 * `server-only` makes that a build error rather than a review catch.
 */
export class ApiError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, message: string, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** The api's error envelope is `{ code, message }` (`ErrorResponse`). */
function toApiError(status: number, body: unknown): ApiError {
  const b = body as { code?: unknown; message?: unknown } | null;
  const code = typeof b?.code === "string" ? b.code : null;
  const message =
    typeof b?.message === "string" ? b.message : `Request failed (${status})`;
  return new ApiError(status, message, code);
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Unauthenticated call — used by the login route handler. */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await parse(res);
  if (!res.ok) throw toApiError(res.status, data);
  return data as T;
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return null;
  try {
    const tokens = await apiPost<{ accessToken?: string }>("/auth/refresh", {
      refreshToken,
    });
    if (!tokens?.accessToken) return null;
    try {
      // Best effort: during a page render Next.js makes the cookie store read-only
      // and this throws. The retry below still succeeds with the token in hand; the
      // cookie is refreshed on the next request by middleware, which CAN write.
      cookies().set(ACCESS_COOKIE, tokens.accessToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    } catch {
      /* read-only cookie store during render — see above */
    }
    return tokens.accessToken;
  } catch {
    return null;
  }
}

/**
 * Authenticated call. Attaches the cookie's access token as `Authorization: Bearer`,
 * and on a 401 refreshes ONCE via `POST /auth/refresh` and replays the request.
 *
 * `cache: "no-store"` on every call is not laziness: ADR-0012 D3 forbids caching an
 * authorization outcome, and AC6 ("revoke is visible on the coach's very next
 * request, a plain reload") is a caching assertion. A cached roster would pass every
 * test and fail the demo's closing beat.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = readAccessToken();
  if (!token) throw new ApiError(401, "No session", "AUTH_UNAUTHORIZED");

  const call = async (bearer: string) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${bearer}`);
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetch(apiUrl(path), { ...init, headers, cache: "no-store" });
  };

  let res = await call(token);
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (fresh) res = await call(fresh);
  }
  const data = await parse(res);
  if (!res.ok) throw toApiError(res.status, data);
  return data as T;
}
