import { NextResponse } from "next/server";
import {
  fixtureAiDiscards,
  fixtureAiPosts,
  fixtureCalls,
  fixtureDraftPuts,
  fixtureIntakePuts,
  fixtureReads,
} from "@/lib/coachApi.fixture";
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
 *   and `{ aiPosts }` / `{ aiDiscards }` (EV-186b / EV-186f, EV-376): every routine AI POST by key
 *         (never the notes or the instruction), and every routine AI DELETE with the
 *         `proposalId` it named and whether it touched the link's proposal.
 *
 *   and `{ intakePuts }` (EV-341b): every intake section PUT the fixture received, with its
 *         body — B5a's witness (the first save after « Recharger »).
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
    { calls: fixtureCalls(), reads: fixtureReads(), draftPuts: fixtureDraftPuts(), intakePuts: fixtureIntakePuts(), aiPosts: fixtureAiPosts(), aiDiscards: fixtureAiDiscards(), api: apiJournal() },
    { headers: NO_STORE }
  );
}
