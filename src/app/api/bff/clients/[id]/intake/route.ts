import { NextResponse } from "next/server";
import { coachApi, isForbidden } from "@/lib/coachApi";
import { isClientId } from "@/lib/clientOverview";
import { INTAKE_FORM_SECTIONS } from "@/lib/intakeForm";
import { handlerAccessToken, withTokenSource } from "@/lib/handlerSession";
import { INTAKE_REQUEST_ENABLED } from "@/lib/env";

/**
 * EV-341b B5 — « Recharger »: the intake as the api holds it now, through the BFF, so the page
 * can replace a conflicted section's values with the stored ones WITHOUT a navigation.
 *
 * The read handler shape of `/api/bff/clients/{id}/intake-consent` (ADR-0033 D33.1): GET only,
 * the subject is the URL segment alone, `no-store`, `Sec-Fetch-Site` refused when it names
 * another site, and the body re-built field by field: the state, and for sections 1–4 their
 * `version` and `values`. This IS the coach's own record (the page's server read carries the
 * same values), so the notes are in it; nothing else rides along, and it is never cached.
 *
 * Not a server action: an action would queue behind every other action of the tab, and this
 * is a read (ADR-0033 option D, rejected for reads).
 *
 * Answers:
 *   200 `{ state: "READY", sections: { GOALS: { version, values }, … } }` or `{ state: "GRANT_MISSING" }`
 *   403 `{ code: "COACH_ACCESS_DENIED" }` — revoked, foreign, unknown, or not a UUID
 *   403 `{ code: "CROSS_ORIGIN" }`
 *   401 `{ code: "SESSION_EXPIRED" }` — no session to continue
 *   502 `{ code: "UPSTREAM" }`
 * Once a bearer is found, every answer carries `x-evoli-token-source` (ADR-0034 A34.1, C1).
 * A session that cannot be continued is the middleware's 307 to /login (the page reads it with
 * `redirect: "manual"`).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

/** EV-341b G5: off, the route does not exist for any method; on, only GET is served. */
function notGet(): NextResponse {
  return INTAKE_REQUEST_ENABLED
    ? new NextResponse(null, { status: 405, headers: { ...NO_STORE, Allow: "GET" } })
    : new NextResponse(null, { status: 404, headers: NO_STORE });
}
export const POST = notGet;
export const PUT = notGet;
export const PATCH = notGet;
export const DELETE = notGet;
export const OPTIONS = notGet;

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!INTAKE_REQUEST_ENABLED) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") {
    return NextResponse.json({ code: "CROSS_ORIGIN" }, { status: 403, headers: NO_STORE });
  }
  if (!isClientId(params.id)) {
    return NextResponse.json({ code: "COACH_ACCESS_DENIED" }, { status: 403, headers: NO_STORE });
  }
  // The token the middleware rotated for this request (src/lib/handlerSession.ts, B17).
  const session = await handlerAccessToken(request);
  if (session.kind !== "token") {
    return NextResponse.json({ code: session.kind === "expired" ? "SESSION_EXPIRED" : "UPSTREAM" }, {
      status: session.kind === "expired" ? 401 : 502,
      headers: NO_STORE,
    });
  }
  try {
    const intake = await coachApi.getIntake(params.id, session.accessToken);
    if (intake?.state === "GRANT_MISSING") return withTokenSource(NextResponse.json({ state: "GRANT_MISSING" }, { headers: NO_STORE }), session);
    if (intake?.state !== "READY" || !intake.sections) {
      return withTokenSource(NextResponse.json({ code: "UPSTREAM" }, { status: 502, headers: NO_STORE }), session);
    }
    const sections: Record<string, { version: number; values: Record<string, unknown> }> = {};
    for (const name of INTAKE_FORM_SECTIONS) {
      const section = intake.sections[name];
      if (!section || typeof section.version !== "number" || !section.values || typeof section.values !== "object") {
        return withTokenSource(NextResponse.json({ code: "UPSTREAM" }, { status: 502, headers: NO_STORE }), session);
      }
      sections[name] = { version: section.version, values: section.values };
    }
    return withTokenSource(NextResponse.json({ state: "READY", sections }, { headers: NO_STORE }), session);
  } catch (err) {
    if (isForbidden(err)) {
      return withTokenSource(NextResponse.json({ code: "COACH_ACCESS_DENIED" }, { status: 403, headers: NO_STORE }), session);
    }
    return withTokenSource(NextResponse.json({ code: "UPSTREAM" }, { status: 502, headers: NO_STORE }), session);
  }
}
