import { NextResponse } from "next/server";
import { ApiError } from "@/lib/apiFetch";
import { coachApi, isForbidden, isIntakeVersionConflict, type CoachIntakeSectionName } from "@/lib/coachApi";
import { INTAKE_FORM_SECTIONS, type IntakeFormSection } from "@/lib/intakeForm";
import { isClientId } from "@/lib/clientOverview";
import { refuseCrossOrigin } from "@/lib/sameOrigin";
import { SESSION_SUBJECT_HEADER } from "@/lib/autosaveTransport";
import { sessionSubjectTag } from "@/lib/sessionSubject";
import { handlerAccessToken, withTokenSource } from "@/lib/handlerSession";
import { INTAKE_REQUEST_ENABLED } from "@/lib/env";

/**
 * EV-341b B3, B13, B13a (ADR-0034 D34.10 (1)) — the intake's autosave transport:
 * `PUT /api/clients/{id}/intake/{section}` → `PUT /coach-portal/clients/{id}/intake/sections/{section}`,
 * with the session's bearer (`apiFetch`, exactly as the server actions forward).
 *
 * A route handler and not a server action: Next 14.2 runs a tab's actions one at a time and
 * discards a pending one on a navigation, so two sections could not save at once and a blur
 * followed by a tab click would lose a save and its new version. This never revalidates and
 * renders nothing (ADR-0033 D33.6 stays true: autosave is not an action).
 *
 * The session: it sits inside the middleware matcher (which excludes only `/api/auth`), so an
 * expired access token is rotated there on every save, which is what keeps a coach who types
 * for 30 minutes signed in (D34.10 (8), B17); a session that cannot be continued is the
 * middleware's 307 to /login, which the client reads as "session ended" (B15).
 *
 * ⚠ THE PORTAL'S FIRST COOKIE-AUTHENTICATED WRITE HANDLER OUTSIDE `/api/auth`, so it owns CSRF
 * itself (B13): a server action gets Next's origin check for free, a route handler does not.
 * In this order, and each refusal reaches the api with NOTHING:
 *   0. the release hold off (`COACH_INTAKE_REQUEST`, G4) — 404 for every method;
 *   1. any method but PUT — 405 (`notPut`);
 *   2. a foreign `Origin` (or `Origin: null`, or `Sec-Fetch-Site` naming another site) — 403
 *      `CROSS_ORIGIN`, `refuseCrossOrigin`, the `/api/auth/*` handlers' rule;
 *   3. a body that is not `Content-Type: application/json` — 415 (a cross-site form can only
 *      send the three "simple" content types without a preflight nothing here answers);
 *   4. an id that is not a UUID — 403 `COACH_ACCESS_DENIED`, the layout's rule (BUG-600);
 *   5. a section this page does not save (not one of the eight), or a body that is not `{ version, values }` — 400;
 *      a body over 64 KB, with or without a Content-Length — 413;
 *   6. only then the session (a rotation is never spent on a refused request), then the account.
 * The cookies stay `SameSite=Lax`.
 *
 * ADR-0033 D33.14 point 4 (a write started by a timer must not land under another account's
 * cookies): every save names the account its page was rendered for (`x-evoli-session-subject`,
 * `src/lib/sessionSubject.ts`), and a save whose cookies belong to another account, or that
 * names none, is 401 `SESSION_CHANGED`, before any api call. The same account signed in again
 * in another tab saves (B15).
 *
 * B13a — EVERY 2xx is `200 application/json` with exactly `{ version, updatedAt }`, re-built
 * field by field from the api's answer (never the answers: the api sends none and nothing else
 * may ride along). A 2xx of any other shape is read by the client as "session ended" (B15), so
 * an api answer this handler cannot vouch for is a 502, never a bare 2xx.
 *
 * Answers:
 *   200 `{ version, updatedAt }`
 *   400 `{ code, field }`   — the api's INTAKE_FIELD_INVALID / COACH_FIELD_NOT_ACCEPTED, or this
 *                             handler's own `INVALID_REQUEST`; `field` names a field, never a value
 *   401 `{ code: "SESSION_EXPIRED" }` — no session the api would take (apiFetch already refreshed once)
 *   401 `{ code: "SESSION_CHANGED" }` — the cookies are another account's than the page's
 *   403 `{ code: "COACH_ACCESS_DENIED" }` — revoked, consent withdrawn, not this coach's (B14)
 *   403 `{ code: "CROSS_ORIGIN" }`
 *   409 `{ code: "INTAKE_VERSION_CONFLICT", version, updatedAt }` — never a value (B5)
 *   413 `{ code: "PAYLOAD_TOO_LARGE" }`
 *   415 `{ code: "UNSUPPORTED_MEDIA_TYPE" }`
 *   502 `{ code: "UPSTREAM" }` — the api failed, did not answer, or answered something else
 * Once a bearer is found, every answer carries `x-evoli-token-source: rotated | cookie | refreshed`
 * (ADR-0034 A34.1, C1: the post-deploy check of which step served it; no token data).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };
/** A section is at most a few kB (the api's CHECK is 32,768 octets of payload); anything far larger is not ours. */
const MAX_BODY_BYTES = 64 * 1024;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/** N1: the sections the page saves (EV-341b built 1–4; EV-341c all eight, `INTAKE_FORM_SECTIONS`). */
function isSection(value: string): value is IntakeFormSection & CoachIntakeSectionName {
  return (INTAKE_FORM_SECTIONS as readonly string[]).includes(value);
}

function isJsonContentType(raw: string | null): boolean {
  const type = (raw ?? "").split(";")[0].trim().toLowerCase();
  return type === "application/json";
}

/**
 * N2: the body, read up to `MAX_BODY_BYTES` whatever `Content-Length` says (or does not say: a
 * chunked request has none). `null` = over the cap, and the rest is never read.
 */
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

/**
 * EV-341b G4: dark behind the release hold. Off, the route does not exist for ANY method, before
 * any of B13's checks and with no upstream call. On, every method but PUT is refused (B13).
 */
function notPut(): NextResponse {
  return INTAKE_REQUEST_ENABLED
    ? new NextResponse(null, { status: 405, headers: { ...NO_STORE, Allow: "PUT" } })
    : new NextResponse(null, { status: 404, headers: NO_STORE });
}
export const GET = notPut;
export const HEAD = notPut;
export const POST = notPut;
export const PATCH = notPut;
export const DELETE = notPut;
export const OPTIONS = notPut;

export async function PUT(request: Request, { params }: { params: { id: string; section: string } }) {
  if (!INTAKE_REQUEST_ENABLED) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const foreign = refuseCrossOrigin(request);
  if (foreign) {
    foreign.headers.set("Cache-Control", "no-store");
    return foreign;
  }
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return json({ code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  }
  // N3: the request is judged on its own before the session is resolved (no refresh is spent on
  // a request that would be refused anyway).
  if (!isClientId(params.id)) return json({ code: "COACH_ACCESS_DENIED" }, 403);
  if (!isSection(params.section)) return json({ code: "INVALID_REQUEST", field: "section" }, 400);

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return json({ code: "PAYLOAD_TOO_LARGE" }, 413);
  let text: string | null;
  try {
    text = await readCapped(request);
  } catch {
    return json({ code: "INVALID_REQUEST", field: "body" }, 400);
  }
  if (text === null) return json({ code: "PAYLOAD_TOO_LARGE" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ code: "INVALID_REQUEST", field: "body" }, 400);
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  const version = record?.version;
  const values = record?.values;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    return json({ code: "INVALID_REQUEST", field: "version" }, 400);
  }
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return json({ code: "INVALID_REQUEST", field: "values" }, 400);
  }

  // B17: the token the middleware rotated for THIS request, which `cookies()` does not show a
  // route handler (src/lib/handlerSession.ts).
  const session = await handlerAccessToken(request);
  if (session.kind === "expired") return json({ code: "SESSION_EXPIRED" }, 401);
  if (session.kind === "unavailable") return json({ code: "UPSTREAM" }, 502);
  // ADR-0034 A34.1 (C1): every answer from here on names the step that served the bearer.
  const reply = (body: Record<string, unknown>, status: number) => withTokenSource(json(body, status), session);
  const subject = request.headers.get(SESSION_SUBJECT_HEADER);
  const current = sessionSubjectTag(session.accessToken);
  if (!subject || !current || subject !== current) return reply({ code: "SESSION_CHANGED" }, 401);

  try {
    // `values` is forwarded as sent: the api's reader is the vocabulary's one judge (an
    // undeclared key is its 400 COACH_FIELD_NOT_ACCEPTED, never dropped here in silence).
    const saved = await coachApi.saveIntakeSection(
      params.id,
      params.section,
      { version, values: values as Record<string, unknown> },
      session.accessToken
    );
    if (
      typeof saved?.version !== "number" ||
      !Number.isInteger(saved.version) ||
      saved.version < 1 ||
      typeof saved?.updatedAt !== "string"
    ) {
      return reply({ code: "UPSTREAM" }, 502);
    }
    return reply({ version: saved.version, updatedAt: saved.updatedAt }, 200);
  } catch (err) {
    if (isForbidden(err)) return reply({ code: "COACH_ACCESS_DENIED" }, 403);
    if (isIntakeVersionConflict(err)) {
      const details = (err as ApiError).details ?? {};
      return reply(
        {
          code: "INTAKE_VERSION_CONFLICT",
          version: typeof details.version === "number" ? details.version : null,
          updatedAt: typeof details.updatedAt === "string" ? details.updatedAt : null,
        },
        409
      );
    }
    if (err instanceof ApiError && err.status === 401) return reply({ code: "SESSION_EXPIRED" }, 401);
    if (err instanceof ApiError && err.status === 400) {
      const field = err.details?.field;
      return reply({ code: err.code ?? "INVALID_REQUEST", field: typeof field === "string" ? field : null }, 400);
    }
    return reply({ code: "UPSTREAM" }, 502);
  }
}
