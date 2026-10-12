import { NextResponse } from "next/server";
import { coachApi, isForbidden } from "@/lib/coachApi";
import { isClientId } from "@/lib/clientOverview";
import { INTAKE_REQUEST_ENABLED } from "@/lib/env";

/**
 * EV-341w W3 — the waiting panel's poll: `GET /coach-portal/clients/{id}/intake-consent`,
 * through the BFF.
 *
 * A route handler and not a server action: actions are dispatched one at a time per client
 * (ADR-0033 option D), so a read every 3 s would queue behind, and hold up, every other action
 * and navigation on the overview. This is the one read handler of ADR-0033 D33.1's shape the
 * portal has: GET only, the subject is the URL segment alone, `no-store`, and the body is the
 * api's two booleans re-built field by field, so no other key (and never a token) can ride
 * along.
 *
 * The session: it sits inside the middleware matcher, so an expired access token is rotated
 * there exactly as for a page, and a session that cannot be continued is a 307 to /login. The
 * card fetches with `redirect: "manual"` and reads that 307 as "signed out" (D33.1's dedicated
 * `/api/bff/*` middleware branch is branch 2b's, which is not built; nothing here depends on
 * it). `apiFetch` still refreshes once on a 401 from the api, as for every server read.
 *
 * Answers:
 *   200 `{ granted, pending }`;
 *   403 `{ code: "COACH_ACCESS_DENIED" }` — the api's one denial (foreign, revoked, unknown,
 *       and here also an id that is not a UUID, the overview layout's own rule, BUG-600);
 *   403 `{ code: "CROSS_ORIGIN" }` — `Sec-Fetch-Site` names another site (D33.1);
 *   502 `{ code: "UPSTREAM" }` — the api failed or did not answer: the wait goes on;
 *   404 — the release hold is off (`COACH_INTAKE_REQUEST`): the route does not exist.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request, { params }: { params: { id: string } }) {
  if (!INTAKE_REQUEST_ENABLED) return new NextResponse(null, { status: 404, headers: NO_STORE });
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") {
    return NextResponse.json({ code: "CROSS_ORIGIN" }, { status: 403, headers: NO_STORE });
  }
  if (!isClientId(params.id)) {
    return NextResponse.json({ code: "COACH_ACCESS_DENIED" }, { status: 403, headers: NO_STORE });
  }
  try {
    const status = await coachApi.getIntakeConsent(params.id);
    if (typeof status?.granted !== "boolean" || typeof status?.pending !== "boolean") {
      return NextResponse.json({ code: "UPSTREAM" }, { status: 502, headers: NO_STORE });
    }
    return NextResponse.json({ granted: status.granted, pending: status.pending }, { headers: NO_STORE });
  } catch (err) {
    if (isForbidden(err)) {
      return NextResponse.json({ code: "COACH_ACCESS_DENIED" }, { status: 403, headers: NO_STORE });
    }
    return NextResponse.json({ code: "UPSTREAM" }, { status: 502, headers: NO_STORE });
  }
}
