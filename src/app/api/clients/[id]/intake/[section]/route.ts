import { NextResponse } from "next/server";
import { ApiError } from "@/lib/apiFetch";
import { INTAKE_SECTION_NAMES, coachApi, isForbidden, isIntakeVersionConflict, type CoachIntakeSectionName } from "@/lib/coachApi";
import { isClientId } from "@/lib/clientOverview";
import { refuseCrossOrigin } from "@/lib/sameOrigin";
import { SESSION_SUBJECT_HEADER } from "@/lib/autosaveTransport";
import { sessionSubjectTag } from "@/lib/sessionSubject";

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
 *   1. any method but PUT — Next answers 405 itself (only `PUT` is exported);
 *   2. a foreign `Origin` (or `Origin: null`, or `Sec-Fetch-Site` naming another site) — 403
 *      `CROSS_ORIGIN`, `refuseCrossOrigin`, the `/api/auth/*` handlers' rule;
 *   3. a body that is not `Content-Type: application/json` — 415 (a cross-site form can only
 *      send the three "simple" content types without a preflight nothing here answers);
 *   4. an id that is not a UUID — 403 `COACH_ACCESS_DENIED`, the layout's rule (BUG-600);
 *   5. a section the api does not name, or a body that is not `{ version, values }` — 400.
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
 *   415 `{ code: "UNSUPPORTED_MEDIA_TYPE" }`
 *   502 `{ code: "UPSTREAM" }` — the api failed, did not answer, or answered something else
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };
/** A section is at most a few kB (the api's CHECK is 32,768 octets of payload); anything far larger is not ours. */
const MAX_BODY_BYTES = 64 * 1024;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function isSection(value: string): value is CoachIntakeSectionName {
  return (INTAKE_SECTION_NAMES as readonly string[]).includes(value);
}

function isJsonContentType(raw: string | null): boolean {
  const type = (raw ?? "").split(";")[0].trim().toLowerCase();
  return type === "application/json";
}

export async function PUT(request: Request, { params }: { params: { id: string; section: string } }) {
  const foreign = refuseCrossOrigin(request);
  if (foreign) {
    foreign.headers.set("Cache-Control", "no-store");
    return foreign;
  }
  if (!isJsonContentType(request.headers.get("content-type"))) {
    return json({ code: "UNSUPPORTED_MEDIA_TYPE" }, 415);
  }
  const subject = request.headers.get(SESSION_SUBJECT_HEADER);
  const current = sessionSubjectTag();
  if (!subject || !current || subject !== current) return json({ code: "SESSION_CHANGED" }, 401);
  if (!isClientId(params.id)) return json({ code: "COACH_ACCESS_DENIED" }, 403);
  if (!isSection(params.section)) return json({ code: "INVALID_REQUEST", field: "section" }, 400);

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return json({ code: "INVALID_REQUEST", field: "body" }, 400);
  let text: string;
  try {
    text = await request.text();
  } catch {
    return json({ code: "INVALID_REQUEST", field: "body" }, 400);
  }
  if (text.length > MAX_BODY_BYTES) return json({ code: "INVALID_REQUEST", field: "body" }, 400);
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

  try {
    // `values` is forwarded as sent: the api's reader is the vocabulary's one judge (an
    // undeclared key is its 400 COACH_FIELD_NOT_ACCEPTED, never dropped here in silence).
    const saved = await coachApi.saveIntakeSection(params.id, params.section, {
      version,
      values: values as Record<string, unknown>,
    });
    if (
      typeof saved?.version !== "number" ||
      !Number.isInteger(saved.version) ||
      saved.version < 1 ||
      typeof saved?.updatedAt !== "string"
    ) {
      return json({ code: "UPSTREAM" }, 502);
    }
    return json({ version: saved.version, updatedAt: saved.updatedAt }, 200);
  } catch (err) {
    if (isForbidden(err)) return json({ code: "COACH_ACCESS_DENIED" }, 403);
    if (isIntakeVersionConflict(err)) {
      const details = (err as ApiError).details ?? {};
      return json(
        {
          code: "INTAKE_VERSION_CONFLICT",
          version: typeof details.version === "number" ? details.version : null,
          updatedAt: typeof details.updatedAt === "string" ? details.updatedAt : null,
        },
        409
      );
    }
    if (err instanceof ApiError && err.status === 401) return json({ code: "SESSION_EXPIRED" }, 401);
    if (err instanceof ApiError && err.status === 400) {
      const field = err.details?.field;
      return json({ code: err.code ?? "INVALID_REQUEST", field: typeof field === "string" ? field : null }, 400);
    }
    return json({ code: "UPSTREAM" }, 502);
  }
}
