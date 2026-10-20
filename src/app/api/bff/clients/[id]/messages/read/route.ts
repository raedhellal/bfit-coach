import { NextResponse } from "next/server";
import { ApiError } from "@/lib/apiFetch";
import { coachApi, isForbidden } from "@/lib/coachApi";
import { isClientId } from "@/lib/clientOverview";
import { handlerAccessToken, withTokenSource } from "@/lib/handlerSession";
import { refuseCrossOrigin } from "@/lib/sameOrigin";
import { SESSION_SUBJECT_HEADER } from "@/lib/autosaveTransport";
import { sessionSubjectTag } from "@/lib/sessionSubject";

/**
 * EV-095b — mark the thread read: `POST { seq }` → `POST /coach-portal/clients/{id}/messages/read`
 * (ADR-0038 D38.5). The island calls it when the page is VISIBLE and a read showed messages from
 * the client the coach has not read (`unread > 0`), so the roster's dot goes on the next load.
 *
 * A write started by a read's continuation, not by a click, so it is guarded by the SERVER
 * (ADR-0033 D33.14 point 4 as amended by R11): `x-evoli-session-subject` must name the account
 * whose cookies came with it, else 401 `SESSION_CHANGED`, before any api call. CSRF as the send:
 * `refuseCrossOrigin`, `application/json` only, a UUID id, a body of exactly a non-negative
 * integer `seq` (the api clamps it to `lastSeq` and never moves it backwards).
 *
 * Answers: 204; 400 `INVALID_REQUEST`; 401 `SESSION_EXPIRED` | `SESSION_CHANGED`;
 * 403 `COACH_ACCESS_DENIED` | `CROSS_ORIGIN`; 415; 502 `UPSTREAM`.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const foreign = refuseCrossOrigin(request);
  if (foreign) {
    foreign.headers.set("Cache-Control", "no-store");
    return foreign;
  }
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return json({ code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  if (!isClientId(params.id)) return json({ code: "COACH_ACCESS_DENIED" }, 403);

  // `{ "seq": n }` is a few bytes; `.text()` on anything larger than 1 kB is refused unread.
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > 1024) return json({ code: "INVALID_REQUEST" }, 400);
  let parsed: unknown;
  try {
    const text = await request.text();
    if (text.length > 1024) return json({ code: "INVALID_REQUEST" }, 400);
    parsed = JSON.parse(text);
  } catch {
    return json({ code: "INVALID_REQUEST" }, 400);
  }
  const seq = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>).seq : undefined;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) return json({ code: "INVALID_REQUEST" }, 400);

  const session = await handlerAccessToken(request);
  if (session.kind === "expired") return json({ code: "SESSION_EXPIRED" }, 401);
  if (session.kind === "unavailable") return json({ code: "UPSTREAM" }, 502);
  const reply = (body: Record<string, unknown>, status: number) => withTokenSource(json(body, status), session);
  const subject = request.headers.get(SESSION_SUBJECT_HEADER);
  const current = sessionSubjectTag(session.accessToken);
  if (!subject || !current || subject !== current) return reply({ code: "SESSION_CHANGED" }, 401);

  try {
    await coachApi.markMessagesRead(params.id, { seq }, session.accessToken);
    return withTokenSource(new NextResponse(null, { status: 204, headers: NO_STORE }), session);
  } catch (err) {
    if (isForbidden(err)) return reply({ code: "COACH_ACCESS_DENIED" }, 403);
    if (err instanceof ApiError && err.status === 401) return reply({ code: "SESSION_EXPIRED" }, 401);
    if (err instanceof ApiError && err.status === 400) return reply({ code: "INVALID_REQUEST" }, 400);
    return reply({ code: "UPSTREAM" }, 502);
  }
}
