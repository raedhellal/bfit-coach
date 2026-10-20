import { NextResponse } from "next/server";
import { ApiError } from "@/lib/apiFetch";
import { coachApi, isForbidden, isMessageIdReused, isMessageRateLimited, type CoachMessagesCursor } from "@/lib/coachApi";
import { isClientId } from "@/lib/clientOverview";
import { handlerAccessToken, withTokenSource, type HandlerSession } from "@/lib/handlerSession";
import { asMessage, asThread } from "@/lib/messages";
import { refuseCrossOrigin } from "@/lib/sameOrigin";
import { SESSION_SUBJECT_HEADER } from "@/lib/autosaveTransport";
import { sessionSubjectTag } from "@/lib/sessionSubject";

/**
 * EV-095b — the thread's BFF route (ADR-0038 D38.1): the island's reads AND sends go through
 * here, never through a server action. Actions are dispatched one at a time per tab (ADR-0033),
 * so a read every 5–15 s would queue behind, and hold up, every other action and navigation.
 *
 *   GET  `?after=n` | `?before=n` | nothing → `GET /coach-portal/clients/{id}/messages`
 *   POST `{ clientMessageId, body }`        → `POST /coach-portal/clients/{id}/messages`
 *
 * The shape of `src/app/api/bff/clients/[id]/intake-consent/route.ts` (the read) and of
 * `src/app/api/clients/[id]/intake/[section]/route.ts` (the write): `no-store`; the subject is
 * the URL segment alone; a non-UUID id is the layout's 403 (BUG-600) with no api call;
 * `handlerAccessToken` (EV-341b B17: a route handler does not see the middleware's rotated
 * cookie); every 2xx body re-built field by field, so nothing else (and never a token) rides
 * along. It sits inside the middleware matcher, so a session that cannot be continued is the
 * middleware's 307 to /login, which the island reads (`redirect: "manual"`) as signed out.
 *
 * The SEND owns CSRF itself (a server action would get Next's origin check, a handler does not),
 * in this order, each refusal reaching the api with nothing:
 *   1. a foreign `Origin` / `Sec-Fetch-Site` — 403 `CROSS_ORIGIN` (`refuseCrossOrigin`);
 *   2. not `Content-Type: application/json` — 415 (a cross-site form cannot send it unpreflighted);
 *   3. a non-UUID id — 403 `COACH_ACCESS_DENIED`;
 *   4. a body over 32 KB — 413; not `{ clientMessageId: string, body: string }` — 400;
 *   5. the session, then `x-evoli-session-subject` (ADR-0033 D33.14 point 4 / R11): a send whose
 *      cookies are another account's than the page's is 401 `SESSION_CHANGED`.
 * The text is forwarded AS SENT: the api is the one judge of it (AC-A6). The island has already
 * turned `\r\n` into `\n`; this handler does not rewrite a message.
 *
 * Answers (both methods; once a bearer is found every answer carries `x-evoli-token-source`):
 *   GET  200 the thread view (`CoachClientThread`, re-built)
 *   POST 201 `{ message, lastSeq }` — for a stored message AND for the api's 200 same-body replay
 *        (`apiFetch` returns the body only; the island treats both alike)
 *   400 `{ code }` — the api's VALIDATION_ERROR / INVALID_REQUEST, or this handler's own
 *   401 `{ code: "SESSION_EXPIRED" | "SESSION_CHANGED" }`
 *   403 `{ code: "COACH_ACCESS_DENIED" | "CROSS_ORIGIN" }`
 *   409 `{ code: "MESSAGE_ID_REUSED" }`
 *   413 / 415
 *   429 `{ code: "MESSAGE_RATE_LIMIT", retryAfterSeconds }` — the api's `Retry-After`, or null
 *   502 `{ code: "UPSTREAM" }` — the api failed, did not answer, or answered something else
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };
/** 4000 code points is at most 16 kB of UTF-8, and JSON-escaped at most ~24 kB; anything larger is not ours. */
const MAX_BODY_BYTES = 32 * 1024;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function replyWith(session: HandlerSession) {
  return (body: Record<string, unknown>, status: number) => withTokenSource(json(body, status), session);
}

/** A cursor from the query: one non-negative integer, `after` or `before`, never both. */
function readCursor(url: URL): CoachMessagesCursor | "invalid" {
  const after = url.searchParams.get("after");
  const before = url.searchParams.get("before");
  if (after !== null && before !== null) return "invalid";
  const raw = after ?? before;
  if (raw === null) return null;
  if (!/^\d{1,9}$/.test(raw)) return "invalid";
  const n = Number(raw);
  return after !== null ? { after: n } : { before: n };
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return json({ code: "CROSS_ORIGIN" }, 403);
  if (!isClientId(params.id)) return json({ code: "COACH_ACCESS_DENIED" }, 403);
  const cursor = readCursor(new URL(request.url));
  if (cursor === "invalid") return json({ code: "INVALID_REQUEST" }, 400);

  const session = await handlerAccessToken(request);
  if (session.kind === "expired") return json({ code: "SESSION_EXPIRED" }, 401);
  if (session.kind === "unavailable") return json({ code: "UPSTREAM" }, 502);
  const reply = replyWith(session);
  try {
    const thread = asThread(await coachApi.getMessages(params.id, cursor, session.accessToken));
    if (!thread) return reply({ code: "UPSTREAM" }, 502);
    return reply({ ...thread }, 200);
  } catch (err) {
    if (isForbidden(err)) return reply({ code: "COACH_ACCESS_DENIED" }, 403);
    if (err instanceof ApiError && err.status === 401) return reply({ code: "SESSION_EXPIRED" }, 401);
    return reply({ code: "UPSTREAM" }, 502);
  }
}

function isJsonContentType(raw: string | null): boolean {
  return (raw ?? "").split(";")[0].trim().toLowerCase() === "application/json";
}

/** The body, read up to `MAX_BODY_BYTES` whatever `Content-Length` says; null = over the cap. */
async function readCapped(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const foreign = refuseCrossOrigin(request);
  if (foreign) {
    foreign.headers.set("Cache-Control", "no-store");
    return foreign;
  }
  if (!isJsonContentType(request.headers.get("content-type"))) return json({ code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  if (!isClientId(params.id)) return json({ code: "COACH_ACCESS_DENIED" }, 403);

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return json({ code: "PAYLOAD_TOO_LARGE" }, 413);
  let text: string | null;
  try {
    text = await readCapped(request);
  } catch {
    return json({ code: "INVALID_REQUEST" }, 400);
  }
  if (text === null) return json({ code: "PAYLOAD_TOO_LARGE" }, 413);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ code: "INVALID_REQUEST" }, 400);
  }
  const record = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  const clientMessageId = record?.clientMessageId;
  const body = record?.body;
  if (typeof clientMessageId !== "string" || !UUID.test(clientMessageId) || typeof body !== "string") {
    return json({ code: "INVALID_REQUEST" }, 400);
  }

  const session = await handlerAccessToken(request);
  if (session.kind === "expired") return json({ code: "SESSION_EXPIRED" }, 401);
  if (session.kind === "unavailable") return json({ code: "UPSTREAM" }, 502);
  const reply = replyWith(session);
  const subject = request.headers.get(SESSION_SUBJECT_HEADER);
  const current = sessionSubjectTag(session.accessToken);
  if (!subject || !current || subject !== current) return reply({ code: "SESSION_CHANGED" }, 401);

  try {
    const sent = await coachApi.sendMessage(params.id, { clientMessageId, body }, session.accessToken);
    const message = asMessage(sent?.message);
    const lastSeq = sent?.lastSeq;
    if (!message || typeof lastSeq !== "number" || !Number.isInteger(lastSeq) || lastSeq < message.seq) {
      return reply({ code: "UPSTREAM" }, 502);
    }
    // 201 stored, 200 replayed: `apiFetch` returns the body only, and the island treats both
    // alike (AC-B5: any 2xx clears the composer), so the handler answers 201 for both.
    return reply({ message, lastSeq }, 201);
  } catch (err) {
    if (isForbidden(err)) return reply({ code: "COACH_ACCESS_DENIED" }, 403);
    if (isMessageRateLimited(err)) {
      return reply({ code: "MESSAGE_RATE_LIMIT", retryAfterSeconds: (err as ApiError).retryAfterSeconds ?? null }, 429);
    }
    if (isMessageIdReused(err)) return reply({ code: "MESSAGE_ID_REUSED" }, 409);
    if (err instanceof ApiError && err.status === 401) return reply({ code: "SESSION_EXPIRED" }, 401);
    if (err instanceof ApiError && err.status === 400) return reply({ code: err.code ?? "INVALID_REQUEST" }, 400);
    return reply({ code: "UPSTREAM" }, 502);
  }
}
