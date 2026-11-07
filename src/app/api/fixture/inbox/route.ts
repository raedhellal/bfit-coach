import { NextResponse } from "next/server";
import { fixtureInboxState } from "@/lib/coachApi.fixture";
import { COACH_API_MODE } from "@/lib/env";

/**
 * EV-475 — the fixture inbox as the store holds it, for the Playwright gate ONLY.
 *
 *   GET → `{ items: [{ id, type, readAt }], unreadWithoutAudience }` for THIS browser context's
 *         `evoli_fixture_inbox` affordance, read with no `audience` (every type) and not
 *         journalled. It is AC-3's witness that « Tout marquer comme lu » left the coach's own
 *         `COACH_PLAN_PUBLISHED` unread: the portal's reads all say `audience=COACH`, so they
 *         cannot show it.
 *
 * **404 unless `COACH_API_MODE=fixture`**, like `/api/fixture/state` and for the same reasons
 * (see that route): in `live` there is no fixture store, and the mode check is the only guard.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  if (COACH_API_MODE !== "fixture") return new NextResponse(null, { status: 404, headers: NO_STORE });
  return NextResponse.json(await fixtureInboxState(), { headers: NO_STORE });
}
