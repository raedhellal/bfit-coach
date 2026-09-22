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
  /**
   * `ApiError.details` — the third member of ADR-0013's handler envelope.
   *
   * It was dropped until EV-188b because no refusal this surface handled carried one.
   * `409 COACH_DRAFT_EXISTS` does: `details.existingUpdatedAt` is the timestamp of the
   * draft the apply refused to replace, and ADR-0016 D9.1's whole point is that the
   * portal ECHOES it back rather than pre-reading the draft itself. Without this field
   * AC3's confirm would have to check-then-act across two tabs, which is the design the
   * ADR rejected by name: "the dialog becomes a lie".
   *
   * Typed as `unknown` values, never parsed here — the shape is per-code and the one
   * reader (`draftExistsUpdatedAt`) narrows it at its own call site.
   */
  details: Record<string, unknown> | null;
  constructor(
    status: number,
    message: string,
    code: string | null = null,
    details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** The api's error envelope is `{ code, message, details? }` (`ApiError`). */
function toApiError(status: number, body: unknown): ApiError {
  const b = body as { code?: unknown; message?: unknown; details?: unknown } | null;
  const code = typeof b?.code === "string" ? b.code : null;
  const message =
    typeof b?.message === "string" ? b.message : `Request failed (${status})`;
  const details =
    b?.details && typeof b.details === "object" && !Array.isArray(b.details)
      ? (b.details as Record<string, unknown>)
      : null;
  return new ApiError(status, message, code, details);
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

/**
 * The single in-flight rotation, keyed by the refresh token that started it.
 *
 * One render can fan out several api calls — `/` fetches `/coach-portal/me` and
 * `/coach-portal/clients` in a `Promise.all` — and if the access token has just
 * expired they all come back 401 at the same moment. Without this, each of them posts
 * its own `/auth/refresh` with the SAME refresh token: the api rotates once per call,
 * so every rotation but the last invalidates the token the others are about to use,
 * and the coach is signed out by a plain reload.
 *
 * Keyed by the refresh token, not global: this is module state in a server process
 * shared by every request, and handing coach A's fresh access token to coach B's
 * request would be a session leak. Only a caller presenting the same refresh token —
 * i.e. the same session — can join the flight. The entry is dropped as soon as it
 * settles, so a later 401 refreshes again.
 */
let inFlightRefresh: { key: string; promise: Promise<string | null> } | null = null;

async function requestRefresh(refreshToken: string): Promise<string | null> {
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

function refreshAccessToken(): Promise<string | null> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) return Promise.resolve(null);
  if (inFlightRefresh && inFlightRefresh.key === refreshToken) return inFlightRefresh.promise;

  const promise = requestRefresh(refreshToken).finally(() => {
    if (inFlightRefresh?.promise === promise) inFlightRefresh = null;
  });
  inFlightRefresh = { key: refreshToken, promise };
  return promise;
}

/**
 * Authenticated call. Attaches the cookie's access token as `Authorization: Bearer`,
 * and on a 401 refreshes ONCE via `POST /auth/refresh` and replays the request. Several
 * concurrent calls that all 401 share a single rotation — see `inFlightRefresh`.
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
