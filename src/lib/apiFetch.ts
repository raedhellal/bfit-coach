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
  /**
   * EV-278c — the `Retry-After` header of a 429, in whole seconds, or null.
   *
   * b-fit-api sends it on every 429 (BUG-152), and the activation screen's refusal is a
   * sentence ABOUT it ("Try again in {minutes} minutes", EV-204 AC-P5c mirrored). It is a
   * header, not a body field, so without this it was dropped here with the response.
   * Only the delta-seconds form is read; an HTTP-date is null, which the one reader
   * treats as "no wait to state" rather than guessing one.
   */
  retryAfterSeconds: number | null;
  constructor(
    status: number,
    message: string,
    code: string | null = null,
    details: Record<string, unknown> | null = null,
    retryAfterSeconds: number | null = null
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * BUG-690 (audit A3) — how long a portal→api call may take before it is abandoned.
 *
 * Without a bound, a stalled api (a hung Railway instance, a lock wait) held the page's
 * server render until the Vercel function limit: the coach saw only the progress bar,
 * with no error and no retry. With one, the call fails like a lost connection and the
 * page draws the load-error state it already has for a failed read.
 *
 *   · READS (GET/HEAD): 8 s, the story's bound. Every coach read answers in tens of ms;
 *     the slowest measured endpoint, the roster at 106 links, has a p95 of 404 ms.
 *   · WRITES (everything else): 60 s. Longer on purpose: the meal-week apply, a day's
 *     regenerate and a swap are AI-backed when the api runs with AI on, and abandoning a
 *     slow write that then LANDS would tell the coach "failed" about a change that
 *     happened. 60 s bounds a truly stalled write without cutting a slow one (BUG-695
 *     tracks whether the platform's own function limit is lower).
 *
 * The bound covers the WHOLE call, the body included, and the 401 → refresh → replay of
 * `apiFetch` shares one deadline. Not covered, stated: `apiPost` (sign-in and the token
 * rotation) and `apiGetAs` (the sign-in activation check) are the session path, and
 * `middleware.ts`'s own `/auth/refresh` fetch; they are unchanged here.
 */
export const API_READ_TIMEOUT_MS = 8_000;
export const API_WRITE_TIMEOUT_MS = 60_000;

/**
 * A call that did not answer within its bound. Deliberately NOT an `ApiError`: no status
 * came back, so nothing may read it as a refusal (`isForbidden`, a 404, a 409). Every
 * reader that tells "the api said no" from "the api did not answer" by
 * `instanceof ApiError` (`nutritionTemplateActions`' `NO_ANSWER`) files it with a lost
 * connection, which is what it is.
 */
export class ApiTimeoutError extends Error {
  timeoutMs: number;
  constructor(method: string, path: string, timeoutMs: number) {
    super(`${method} ${path} did not answer within ${timeoutMs} ms`);
    this.name = "ApiTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

function isRead(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

/**
 * Runs `work` under a deadline. `AbortSignal.timeout` aborts the fetch AND a body still
 * streaming; its rejection (`TimeoutError`) is turned into `ApiTimeoutError`. Anything
 * else (a refused connection, an `ApiError`) passes through unchanged. `Promise.race`
 * handles both promises, so the loser's later rejection is never unhandled.
 */
async function withDeadline<T>(
  method: string,
  path: string,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const timeoutMs = isRead(method) ? API_READ_TIMEOUT_MS : API_WRITE_TIMEOUT_MS;
  const signal = AbortSignal.timeout(timeoutMs);
  // The race is what makes the bound hold for a step the signal cannot reach: the token
  // rotation inside `apiFetch`'s 401 path is an `apiPost` with no signal of its own.
  const deadline = new Promise<never>((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  try {
    return await Promise.race([work(signal), deadline]);
  } catch (err) {
    if (signal.aborted && (err as { name?: string } | null)?.name === "TimeoutError") {
      throw new ApiTimeoutError(method, path, timeoutMs);
    }
    throw err;
  }
}

function retryAfter(res: Response): number | null {
  const raw = res.headers.get("Retry-After");
  if (!raw || !/^\d+$/.test(raw.trim())) return null;
  const seconds = Number(raw.trim());
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** The api's error envelope is `{ code, message, details? }` (`ApiError`). */
function toApiError(status: number, body: unknown, res?: Response): ApiError {
  const b = body as { code?: unknown; message?: unknown; details?: unknown } | null;
  const code = typeof b?.code === "string" ? b.code : null;
  const message =
    typeof b?.message === "string" ? b.message : `Request failed (${status})`;
  const details =
    b?.details && typeof b.details === "object" && !Array.isArray(b.details)
      ? (b.details as Record<string, unknown>)
      : null;
  return new ApiError(status, message, code, details, res ? retryAfter(res) : null);
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
  if (!res.ok) throw toApiError(res.status, data, res);
  return data as T;
}

/**
 * Unauthenticated GET — `GET /legal/versions` (EV-278c), which the api serves with no
 * session because a consent control has to render before anyone can sign anything.
 */
export async function apiGet<T>(path: string): Promise<T> {
  return withDeadline("GET", path, async (signal) => {
    const res = await fetch(apiUrl(path), { cache: "no-store", signal });
    const data = await parse(res);
    if (!res.ok) throw toApiError(res.status, data, res);
    return data as T;
  });
}

/**
 * A GET with a bearer the CALLER holds, not the cookie's — EV-278c's sign-in check.
 *
 * `/api/auth/login` has to ask `GET /me/activation` about a `[PENDING]` token BEFORE it
 * writes that token into a cookie (ADR-0022 D22.9e: admitted only once the api says the
 * granted role is a coach's), so there is no cookie for `apiFetch` to read yet. No
 * refresh-on-401 here: the token was minted by the login a moment ago, and a 401 on it
 * is a refusal to report, not an expiry to paper over.
 */
export async function apiGetAs<T>(path: string, bearer: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(apiUrl(path), {
    headers: { Authorization: `Bearer ${bearer}` },
    cache: "no-store",
    signal,
  });
  const data = await parse(res);
  if (!res.ok) throw toApiError(res.status, data, res);
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
 *
 * BUG-690: bounded by `API_READ_TIMEOUT_MS` / `API_WRITE_TIMEOUT_MS`, one deadline for
 * the call and its replay; past it, `ApiTimeoutError`. A caller's own `signal` is not
 * supported (none passes one): the deadline's signal is the only one.
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = readAccessToken();
  if (!token) throw new ApiError(401, "No session", "AUTH_UNAUTHORIZED");

  const method = (init.method ?? "GET").toUpperCase();
  return withDeadline(method, path, async (signal) => {
    const call = async (bearer: string) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${bearer}`);
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      return fetch(apiUrl(path), { ...init, headers, cache: "no-store", signal });
    };

    let res = await call(token);
    if (res.status === 401) {
      const fresh = await refreshAccessToken();
      if (fresh) res = await call(fresh);
    }
    const data = await parse(res);
    if (!res.ok) throw toApiError(res.status, data, res);
    return data as T;
  });
}
