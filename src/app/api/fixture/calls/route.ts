import { NextResponse } from "next/server";
import { fixtureCalls, fixtureDraftPuts, fixtureReads } from "@/lib/coachApi.fixture";
import { COACH_API_MODE } from "@/lib/env";
import { apiJournal } from "@/lib/fixtureApiJournal";

/**
 * EV-272 — the fixture's call journal, for the Playwright gate ONLY.
 *
 *   GET → `{ calls }`: every api request the fixture answered since the last reset
 *         (`DELETE /api/fixture/state` empties it), e.g.
 *         `"GET /coach-portal/clients/{id}/nutrition/week/meals/{mealId}/swap"`.
 *
 *   and `{ reads }` (EV-284b): page-load reads the fixture journals, today only
 *         `"GET /coach-portal/clients/{id}/nutrition/log"`. A separate list because
 *         `calls` is asserted EXACTLY empty after a page load by EV-272's specs.
 *
 *   and `{ api }` (perf/coach-parallel-page-reads): EVERY `CoachApi` call, with its
 *         timing, prefetch flag and render tag — see `src/lib/fixtureApiJournal.ts`.
 *
 *   and `{ draftPuts }` (BUG-195c): every `PUT …/routine/draft` with the token it
 *         carried and the two subject lists it sent — AC3.10(i)'s witness.
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
  return NextResponse.json(
    { calls: fixtureCalls(), reads: fixtureReads(), draftPuts: fixtureDraftPuts(), api: apiJournal() },
    { headers: NO_STORE }
  );
}
