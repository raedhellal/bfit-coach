import { NextResponse } from "next/server";
import { fixtureCalls } from "@/lib/coachApi.fixture";
import { COACH_API_MODE } from "@/lib/env";

/**
 * EV-272 — the fixture's call journal, for the Playwright gate ONLY.
 *
 *   GET → `{ calls }`: every api request the fixture answered since the last reset
 *         (`DELETE /api/fixture/state` empties it), e.g.
 *         `"GET /coach-portal/clients/{id}/nutrition/week/meals/{mealId}/swap"`.
 *
 * It exists because the browser sees server actions, never api paths, so "no swap
 * request until Show suggestions is pressed" has no other witness in fixture mode.
 *
 * **404 unless `COACH_API_MODE=fixture`**, like `/api/fixture/state` and for the same
 * reasons (see that route): in `live` there is no journal, and the mode check is the
 * only guard.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  if (COACH_API_MODE !== "fixture") return new NextResponse(null, { status: 404, headers: NO_STORE });
  return NextResponse.json({ calls: fixtureCalls() }, { headers: NO_STORE });
}
