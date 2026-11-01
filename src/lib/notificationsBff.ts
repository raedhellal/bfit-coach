import "server-only";
import { NextResponse } from "next/server";
import { ApiError } from "./apiFetch";
import { SESSION_SUBJECT_HEADER } from "./autosaveTransport";
import { handlerAccessToken, withTokenSource, type HandlerSession } from "./handlerSession";
import { refuseCrossOrigin } from "./sameOrigin";
import { sessionSubjectTag } from "./sessionSubject";

/**
 * EV-455f — what the four `/api/bff/notifications*` route handlers share. Their shape is the
 * messages routes' (`src/app/api/bff/clients/[id]/messages/route.ts`, EV-095b): route handlers,
 * never server actions (the bell polls, and an action would queue behind every other action of
 * the tab, ADR-0038 D38.1); `no-store`; `handlerAccessToken` for the bearer (EV-341b B17); every
 * 2xx body re-built field by field, so nothing else (and never a token) rides along. They sit
 * inside the middleware matcher, so a session that cannot be continued is the middleware's 307 to
 * /login, which the islands read (`redirect: "manual"`) as signed out.
 *
 * Answers, every route: 401 `{ code: "SESSION_EXPIRED" | "SESSION_CHANGED" }`, 403
 * `{ code: "CROSS_ORIGIN" }`, 502 `{ code: "UPSTREAM" }` (the api failed, did not answer, or
 * answered something else). Once a bearer is found every answer carries `x-evoli-token-source`.
 */

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function noContent(session: HandlerSession): NextResponse {
  return withTokenSource(new NextResponse(null, { status: 204, headers: NO_STORE }), session);
}

/** A GET from another site is refused before anything is read (as the thread's GET). */
export function refuseCrossSiteRead(request: Request): NextResponse | null {
  const site = request.headers.get("sec-fetch-site");
  return site === "cross-site" || site === "same-site" ? json({ code: "CROSS_ORIGIN" }, 403) : null;
}

/**
 * A POST's CSRF and account checks, in the order of the thread's mark-read, each refusal
 * reaching the api with nothing: a foreign `Origin` / `Sec-Fetch-Site` (403 `CROSS_ORIGIN`);
 * not `application/json` (415: a cross-site form cannot send it unpreflighted); a body over
 * 1 kB (400: the body is `{}`); then the session, and `x-evoli-session-subject` must name the
 * account whose cookies came with the request (ADR-0033 D33.14 point 4), else 401
 * `SESSION_CHANGED`: a click on a page rendered for coach A never marks coach B's items.
 */
export async function guardWrite(
  request: Request
): Promise<{ refused: NextResponse } | { session: Extract<HandlerSession, { kind: "token" }> }> {
  const foreign = refuseCrossOrigin(request);
  if (foreign) {
    foreign.headers.set("Cache-Control", "no-store");
    return { refused: foreign };
  }
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { refused: json({ code: "UNSUPPORTED_MEDIA_TYPE" }, 415) };
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 1024) return { refused: json({ code: "INVALID_REQUEST" }, 400) };

  const session = await handlerAccessToken(request);
  if (session.kind === "expired") return { refused: json({ code: "SESSION_EXPIRED" }, 401) };
  if (session.kind === "unavailable") return { refused: json({ code: "UPSTREAM" }, 502) };
  const subject = request.headers.get(SESSION_SUBJECT_HEADER);
  const current = sessionSubjectTag(session.accessToken);
  if (!subject || !current || subject !== current) {
    return { refused: withTokenSource(json({ code: "SESSION_CHANGED" }, 401), session) };
  }
  return { session };
}

/** An api failure as the BFF's answer: 401 is the session, anything else is UPSTREAM. */
export function upstreamFailure(err: unknown, session: HandlerSession): NextResponse {
  if (err instanceof ApiError && err.status === 401) return withTokenSource(json({ code: "SESSION_EXPIRED" }, 401), session);
  return withTokenSource(json({ code: "UPSTREAM" }, 502), session);
}
