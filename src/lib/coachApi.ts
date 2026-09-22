import "server-only";
import { apiFetch, ApiError } from "./apiFetch";
import { COACH_API_MODE, INVITE_BASE_URL } from "./env";
import { fixtureCoachApi } from "./coachApi.fixture";
import { sanitiseCoachName } from "./inviteName";

/**
 * The ONE module that knows b-fit-api's coach-portal contract.
 *
 * Every path, field name and error code the web surface depends on is written down
 * exactly once, here, and the names below are the API's own names verbatim — not a
 * prettier local vocabulary. A renamed field is a place where drift can hide; when
 * `traineeDisplayName` is called `traineeDisplayName` all the way to the JSX, a
 * contract change is a type error rather than an empty cell.
 *
 * Source of truth: `b-fit-api` `openapi.yaml` (`/coach-portal/*`) and the DTOs in
 * `com.bfit.application.dto.coachportal`, branch demo/evoli-pro-mve1.
 *
 * `COACH_API_MODE=fixture` swaps the whole module for src/lib/coachApi.fixture.ts so
 * the screens are demoable without an api. The switch is read from the server
 * environment only, and `live` is the default.
 */

/* ════════════════════════════════════════════════════════════════════════════
 * ALIGNED TO ADR-0015 — EV-184b / EV-185b, with the F1 sign-off edit of 2026-09-16.
 *
 * The block this replaces asked four questions and said it was provisional.
 * ADR-0015 (D4 publish, D5 scopes, D6 nutrition) converged and answers all four; the
 * answers are recorded at the bottom of this block, including the ONE that the ADR
 * does not decide and which therefore stays provisional.
 *
 * What is still true: these endpoints are UNBUILT on b-fit-api as of 2026-09-16
 * (EV-184a / EV-185a implement them). `live` mode calls them and 404s, which is the
 * honest failure — the portal does not fabricate a routine or a meal week. The
 * screens are demoable under `COACH_API_MODE=fixture`, whose twin is typed by the
 * exports below, so an api that lands a different shape is a compile error here and
 * not a wrong number on a coach's screen.
 *
 *   ROUTINE (EV-184)
 *   GET    /coach-portal/clients/{id}/routine            [scope WORKOUTS]
 *          → CoachRoutineResponse — active plan + days + exercises, the saved
 *            draft if one exists, and the trainee's READ-ONLY injuries/equipment.
 *   GET    /coach-portal/clients/{id}/routine/draft   → CoachRoutineDraft | 404
 *   PUT    /coach-portal/clients/{id}/routine/draft   ← CoachRoutineDraftRequest
 *   DELETE /coach-portal/clients/{id}/routine/draft   → 204
 *   POST   /coach-portal/clients/{id}/routine/publish/preview
 *          → { repairs: [{ exercise, replacedWith, rule }], digest }
 *   POST   /coach-portal/clients/{id}/routine/publish  ← { digest }
 *          409 COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED · 400 COACH_PLAN_EMPTY
 *          503 CATALOG_UNAVAILABLE
 *   GET    /coach-portal/catalog/exercises?q=&muscle=&equipment=
 *          → CatalogPage · 503 CATALOG_UNAVAILABLE
 *
 *   NUTRITION (EV-185)
 *   GET    /coach-portal/clients/{id}/nutrition          [scope NUTRITION]
 *          → CoachNutritionResponse — targets + source + activity + the current
 *            week + the trainee's READ-ONLY allergies/rules/dislikes.
 *   PUT    /coach-portal/clients/{id}/nutrition/targets ← CoachTargetsRequest
 *   POST   /coach-portal/clients/{id}/nutrition/week/apply ← { weekStart }
 *          400 COACH_WEEK_OUT_OF_RANGE (current week only — D6)
 *          429 COACH_WEEK_APPLY_RATE_LIMIT (D6.6's cap: 1 apply per link per day)
 *   POST   /coach-portal/clients/{id}/nutrition/week/days/{index}/regenerate
 *          ⛔ OPEN: the day-regen cap lives on the TRAINEE's plan row (D6) and the
 *          api has not named its refusal. Until it does, the portal can only
 *          disclose the sharing up front ("Day regenerations share {trainee}'s
 *          daily limit."); a coach who hits the cap gets the generic failure.
 *   GET    /coach-portal/clients/{id}/nutrition/week/meals/{mealId}/swap
 *          MUST bind to the CACHED reader (`WeeklyMealPlanService.getSwapOptions`),
 *          never `refreshSwapOptions`, which charges the trainee a CHAT credit.
 *          D6's "metered calls this slice does NOT make".
 *   POST   /coach-portal/clients/{id}/nutrition/week/meals/{mealId}/swap
 *          ← { candidateIndex }
 *
 * Every error body is ADR-0013's handler shape `{ code, message, details }`;
 * `apiFetch` reads `code` and nothing else here parses a message.
 *
 * **The subject is always the URL segment.** No coach id and no trainee id ever
 * travels in a body or a query from this surface. And the scope checks this module
 * drives are ADVISORY — they decide what a coach is SHOWN. The server actions take a
 * `clientId` from a client island, so a hostile caller can name any id; enforcement
 * is the api's, on every endpoint, per D5 E1.
 *
 * ── the four questions, answered ────────────────────────────────────────────
 *
 * 1. **There is NO `COACH_SCOPE_MISSING`, and there never will be** (D5, B1 and
 *    "The denial body stays undifferentiated"). Every denial — foreign link, missing
 *    link, revoked link, no coach profile, scope missing — answers the SAME 403 body;
 *    only a server log line differs. A 403 therefore tells this surface nothing about
 *    scopes and is routed to /clients/denied exactly as before.
 *    The scope sentences come from data instead: `GET /coach-portal/clients/{id}`
 *    resolves the link with `requireManagedLink` — an ACTIVE link and **no data
 *    scope** — so the overview is reachable for every linked trainee, and it now
 *    carries `scopes: CoachAccessScope[]`. The portal reads that list, renders
 *    "This trainee has not shared their …" and does not call the tab's endpoint at
 *    all. Requiring WORKOUTS on the overview would have 403'd the whole client area
 *    for a NUTRITION-only link and made EV-185 unreachable (R2-2).
 *    F1's consequence, and the reason three fields below are nullable: a block whose
 *    scope is missing is ABSENT, never a zero. `currentStreakDays: null` is "not
 *    shared" and `0` is a real streak of nothing; `redFlags: null` is "not shared"
 *    and `[]` is "No red flags"; `weightSeries: null` is "not shared" and `[]` is
 *    "no weigh-ins in the window". The portal never infers consent from a null — it
 *    reads `scopes` — the nullability exists so the api stops asserting a number it
 *    has no right to assert.
 * 2. **The publish `digest` is granted, and it is OPAQUE** (D4/D-i). The api computes
 *    `SHA-256(draftId || canonicalJson(document) || canonicalJson(orderedRepairs))`;
 *    this surface treats it as a string, stores it for exactly as long as the modal is
 *    open and echoes it back VERBATIM. Publish re-runs the policy and compares the
 *    resulting repair set to the acknowledged one, so an edit in a second tab between
 *    preview and publish is `409 COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED` (edge case 2).
 *    The portal's answer to that 409 is to re-run preview and show the modal again —
 *    never to retry publish with the stale digest, which is the one behaviour that
 *    would defeat the acknowledgement.
 * 3. **The catalog's filter vocabulary is the one question ADR-0015 does NOT answer.**
 *    It decides that the catalog gate is `CatalogAvailabilityService.hasRows()` and
 *    that search 503s, and says nothing about facets. So `CatalogPage.muscles` /
 *    `.equipment` below remain **PROVISIONAL** — the shape this surface asks for,
 *    served today by the fixture's own vocabulary (25 rows, drawn from the fixture
 *    catalog itself, never a hard-coded list). If EV-184a declines to return facets,
 *    the two selects have to be driven by something the api does return; inventing a
 *    muscle list in the web tier is product data authored outside the catalog and is
 *    not an option.
 * 4. **`reps` and `rest` stay STRINGS** ("8-12", "90s"), `sets` an int — confirmed:
 *    `RoutineExercise` persists them that way, so the editor round-trips the draft
 *    without a lossy conversion.
 * ════════════════════════════════════════════════════════════════════════════ */

// ── types (the api contract, as this surface consumes it) ────────────────────

/** `CoachProfileResponse.tier` — enum [STARTER] today; the ladder lands at MVE-6. */
export type CapacityTier = "STARTER";
/**
 * AC5's three rules. The api sends the code; src/lib/copy.ts owns the sentence.
 *
 * `PAIN_REPORTED` is published by the api and **never emitted, and cannot be**: there
 * is no structured pain signal in the product (`Feedback` is {EASY, OK, HARD} and no
 * mobile call site writes `workout_completion.notes`), so the server deliberately does
 * not compute that rule. EV-082, which would create the signal, is not scheduled.
 *
 * The constant stays in this VOCABULARY because it is b-fit-api's published enum and a
 * union that omitted it would be a false statement about the wire. **Its sentence does
 * not** — `copy.client.redFlagLabels` has two entries and EV-187 AC4 makes that
 * release-blocking: the portal may not advertise a rule that cannot fire, in a legend,
 * a tooltip, a filter or an empty state. See `qa/coach-red-flags-vocabulary.spec.ts`.
 */
export type RedFlagCode =
  | "MISSED_TWO_OR_MORE_SESSIONS"
  | "PAIN_REPORTED"
  | "NO_WEIGH_IN_14_DAYS";
/** `com.bfit.domain.workout.Feedback` — there is no PAIN value today (ADR-0012 D6). */
export type SessionFeedback = "EASY" | "OK" | "HARD";
/** The roster only ever lists ACTIVE rows; REVOKED links are history. */
export type ClientStatus = "ACTIVE";

/**
 * `com.bfit.domain.coach.CoachAccessScope` — what the trainee consented to share,
 * per link (ADR-0012, enforced per endpoint by ADR-0015 D5).
 *
 * This is the ONLY thing that tells the portal a scope is missing: a 403 is
 * undifferentiated across every denial by design, so there is no code to read and no
 * inference to make from a null field. The list arrives on the trainee overview,
 * which requires an ACTIVE link and no data scope at all.
 */
export type CoachAccessScope = "WORKOUTS" | "PROGRESS" | "NUTRITION" | "WEIGH_INS";

/**
 * `GET /coach-portal/me` → `CoachProfileResponse`.
 *
 * Flat, not `{ capacity: { … } }`: the api returns the three capacity values
 * alongside the profile and inventing a nested object here would be this surface
 * disagreeing with its own contract for cosmetic reasons.
 * @wire CoachProfileResponse
 *
 */
export interface CoachMe {
  /** The coach's user id — the same account as their Evoli Fit login. */
  coachId: string;
  displayName: string;
  tier: CapacityTier;
  /** ACTIVE links held right now. */
  active: number;
  /** How many ACTIVE links the tier allows. */
  capacity: number;
}

/**
 * One row of `GET /coach-portal/clients` → `CoachClientSummaryResponse`.
 *
 * @wire CoachClientSummaryResponse
 */
export interface RosterClient {
  /** The `coach_clients` row id — the ONLY id the coach portal addresses. */
  id: string;
  traineeDisplayName: string;
  /**
   * What this link shares — the same `CoachAccessScope[]` the overview carries, per
   * row (staff-review contract item 4, ADR-0015 D5/S1).
   *
   * B1.1 added `scopes` to the roster only if the roster ever had to choose between
   * two different labels for one absent value, and S1 created exactly that: it filters
   * `currentPlanName`, `lastCompletedWorkoutDate` and `currentStreakDays` per item, so
   * every one of those nulls now has two readings — "the trainee has none" and "the
   * trainee did not share it". Without this field the roster had to pick one and be
   * wrong about the other; worse, it had to sort an unknown date as if it were a
   * trainee who has never trained, which pinned them to the top of a needs-attention
   * list forever.
   *
   * Read it through `hasScope`, never with `.includes` — an api that predates B1 sends
   * no such field on this row either, and `hasScope` fails closed for it.
   */
  scopes: CoachAccessScope[];
  /**
   * Null when the trainee's app is on no plan — AND, since ADR-0015 D5/S1, null when
   * the link lacks WORKOUTS, because the roster is filtered per item on the link's
   * scopes exactly as the overview is. `scopes` decides which of the two the row says.
   */
  currentPlanName: string | null;
  /**
   * `YYYY-MM-DD` (UTC) of the last completed workout. Null when there has never been
   * one **or** when the link lacks PROGRESS — this is progress data and S1 filters it
   * per item. `scopes` above is what tells the two apart, and they are two different
   * sentences and two different sort positions (see `sortNeedsAttentionFirst`).
   */
  lastCompletedWorkoutDate: string | null;
  /**
   * Null when the link lacks PROGRESS (F1 change 2 — the field stopped being a
   * primitive `int` for exactly this reason). A serialised `0` would be a claim about
   * the trainee rather than an absence of consent, so the row shows neither a chip nor
   * "No streak" for a null. With PROGRESS held, `0` is a real streak of zero.
   */
  currentStreakDays: number | null;
  /**
   * EV-187 AC2 — how many red flags fired, from the SAME evaluation the trainee's own
   * page runs, so the roster badge and the flags on the page cannot disagree.
   *
   * Three values, three different renderings, and collapsing any two of them is the
   * defect this field exists to prevent:
   *   · `null` — the link carries neither WORKOUTS nor WEIGH_INS, so no rule could be
   *     evaluated. The row reads "Not shared" and the api sorts it LAST. It is never
   *     `0` in this case: a coach must not read a consent boundary as good news.
   *   · `0` — a real "no flags". NO badge at all, and never "0 flags".
   *   · `n > 0` — the badge, "1 flag" / "2 flags".
   */
  redFlagCount: number | null;
  status: ClientStatus;
  /** ISO-8601 instant — when the trainee accepted. */
  since: string;
}

/**
 * `GET /coach-portal/clients?sort=…` — EV-187 AC2's triage order.
 *
 * **The api sorts, not the portal.** The key spans the whole roster and the portal
 * holds one page of it, so a client-side sort would order page 1 among itself and call
 * it triage. `needs_attention` is the api's default and this surface's default on a
 * fresh browser session.
 */
export type RosterSort = "needs_attention" | "recent_activity";

export const ROSTER_SORTS: readonly RosterSort[] = ["needs_attention", "recent_activity"];

/** The default on a fresh browser session (AC2). */
export const DEFAULT_ROSTER_SORT: RosterSort = "needs_attention";

/**
 * A value that may have come from a cookie or a query string → a sort the api accepts.
 *
 * The api answers 400 for any other value rather than falling back silently, so the
 * portal must not forward one: a tampered cookie would otherwise turn the roster into
 * its load-error card.
 */
export function asRosterSort(value: string | null | undefined): RosterSort {
  return ROSTER_SORTS.includes(value as RosterSort) ? (value as RosterSort) : DEFAULT_ROSTER_SORT;
}

/**
 * `GET /coach-portal/clients` → `CoachClientPageResponse`.
 *
 * A paged envelope, not a bare array: every collection endpoint on b-fit-api
 * paginates. The roster is one page in practice (see `ROSTER_PAGE_SIZE`).
 * @wire CoachClientPageResponse
 *
 */
export interface RosterPage {
  items: RosterClient[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * The api caps `size` at 100 and the largest contemplated tier is 100 profiles, so
 * one page of 100 is the whole roster for every tier that can exist. If a tier ever
 * exceeds that, this constant stops being sufficient and the roster needs real
 * pagination — which is why the page reads `totalElements` and not `items.length`.
 */
export const ROSTER_PAGE_SIZE = 100;

/**
 * `POST /coach-portal/invites` → 201 `CoachInviteResponse`. Raw token, once, ever.
 *
 * @wire CoachInviteResponse
 */
export interface InviteResponse {
  inviteId: string;
  token: string;
  /** ISO-8601 instant, creation + 7 days. */
  expiresAt: string;
}

/** What the UI actually renders: the api's token wrapped in this surface's URL. */
export interface Invite extends InviteResponse {
  url: string;
}

/**
 * `TraineeWeightPoint`.
 *
 * @wire TraineeWeightPoint
 */
export interface WeightPoint {
  /** `YYYY-MM-DD`. */
  date: string;
  weightKg: number;
}

/**
 * `TraineeLastSession` — block 3.
 *
 * @wire TraineeLastSession
 */
export interface LastSession {
  /** `YYYY-MM-DD` (UTC) of completion. */
  date: string;
  /** The workout's title; null if the workout row has since gone. */
  name: string | null;
  /** Null renders "No feedback given". */
  difficulty: SessionFeedback | null;
}

/**
 * `GET /coach-portal/clients/{id}` → `TraineeOverviewResponse`.
 *
 * AC5's five blocks, plus `scopes` (ADR-0015 B1). Note there is still **no plan name
 * here** — the plan is a roster-row field only, so the overview header must not claim
 * one; R2-2's "`currentPlanName` is omitted without WORKOUTS" is about that roster
 * row, and `TraineeOverviewResponse`'s field list in B1 confirms the overview has none.
 *
 * The endpoint requires an ACTIVE link and NO data scope (`requireManagedLink`), which
 * is why every child route of `/clients/[id]` can be reached by a link that shares only
 * one kind of data. Each block below is then omitted per scope, and "omitted" is
 * `null` — never `0`, never `[]`, never a placeholder that reads like data.
 * @wire TraineeOverviewResponse
 *
 */
export interface ClientOverview {
  /** The `coach_clients` row id. */
  clientId: string;
  traineeDisplayName: string;
  /** ISO-8601 instant — when the trainee accepted. */
  since: string;
  /**
   * What this link is allowed to read. The portal renders every "not shared" state
   * from this list and from nothing else (D5/B1).
   */
  scopes: CoachAccessScope[];
  /** Block 1 [PROGRESS]. Week boundaries are UTC (ADR-0012 risk (c)). Null = not shared. */
  adherenceThisWeek: { done: number; planned: number } | null;
  /** Block 2 [PROGRESS]. Null = not shared; `0` is a real streak of zero days. */
  currentStreakDays: number | null;
  /** Block 3 [PROGRESS] — null renders "No sessions yet" when PROGRESS is held. */
  lastSession: LastSession | null;
  /**
   * Block 4 [WEIGH_INS] — weigh-ins over the last 8 weeks, oldest first.
   * `null` = not shared; `[]` = shared, and none in the window.
   */
  weightSeries: WeightPoint[] | null;
  /**
   * Block 5 — composite across PROGRESS (`MISSED_TWO_OR_MORE_SESSIONS`) and WEIGH_INS
   * (`NO_WEIGH_IN_14_DAYS`). `null` = neither scope is held; `[]` = "No red flags";
   * a list filtered to the held scope when only one is.
   */
  redFlags: RedFlagCode[] | null;
}

/**
 * Does this link share `scope`? One helper so no screen hand-writes `.includes`, and
 * so "the portal decides from `scopes`" is greppable.
 *
 * A missing overview (the api did not answer) is NOT "not shared": the caller must
 * render its load error instead, which is why this takes the list and not the
 * nullable overview. That distinction stays the CALLER's and this function must not
 * blur it — `!overview` is a load error; an overview that arrived without a usable
 * `scopes` is an answer that says nothing about consent, which is a different thing.
 *
 * **Why the `Array.isArray` guard, and why it is not defensive noise.**
 * `scopes` is typed non-nullable because ADR-0015 B1 puts it on
 * `TraineeOverviewResponse` — but the type describes the api we are BUILDING, not
 * every api this build can be pointed at. b-fit-api main predates B1 and serves an
 * overview with **no `scopes` field at all**, so at runtime the argument is
 * `undefined` and an unguarded `.includes` is a TypeError thrown inside a server
 * component's render: the coach gets a 500 opening any trainee from the roster, not a
 * degraded block. The type system cannot catch it, because the value crosses an
 * untyped JSON boundary (`apiFetch` casts the parsed body).
 *
 * The fallback is `false`, deliberately — FAIL CLOSED. An api that predates B1 has
 * said nothing about what the trainee consented to share, and the only honest reading
 * of silence is "not shared", never "shared". The cost is named rather than hidden: a
 * legacy api that IS serving progress data will have those blocks labelled "Not
 * shared", which UNDER-claims. Under-claiming shows a coach less than they are
 * entitled to see; over-claiming shows them a trainee's data on the strength of a
 * guess, and F1 exists to stop exactly that.
 */
export function hasScope(
  scopes: CoachAccessScope[] | null | undefined,
  scope: CoachAccessScope
): boolean {
  if (!Array.isArray(scopes)) return false;
  return scopes.includes(scope);
}

// ── EV-187b: the monitoring contract ─────────────────────────────────────────

/*
 * `GET /coach-portal/clients/{id}/progress` — EV-187a, b-fit-api `b19c1f3`, on main
 * and deployed. The ONE operation this story adds, and it is a GET: EV-187 AC6's
 * closed list is asserted against the OpenAPI diff, which went 91 → 92 operations with
 * zero removals and no non-GET mapping.
 *
 * These types are read off the vendored `spec/b-fit-api.openapi.yaml`, not asked for,
 * and every one of them carries an `@wire` tag so `qa/contract-drift.spec.ts` checks
 * the claim rather than trusting it.
 */

/**
 * `TraineeWeekAdherence` — one ISO week of the series, oldest first.
 *
 * **`planned` and `plannedSoFar` are two facts, not a rounding choice.** AC3 asks for
 * the current week to count only days strictly before today (ADR-0012 D6, so a Monday
 * does not render as a 0 % week) AND for the current week to be identical to the
 * shipped "adherence this week" block, which on a Monday are 0/0 and 0/3. The api
 * sends both; the portal renders `plannedSoFar` in the bar and `planned` where it has
 * to agree with the shipped block. They differ only when `partial` is true.
 *
 * @wire TraineeWeekAdherence
 */
export interface WeekAdherence {
  /** `YYYY-MM-DD`, the Monday — AC3's week-commencing label. */
  weekCommencing: string;
  /** Sessions completed AS PLANNED WORK: always 0 when `hasPlan` is false. */
  done: number;
  planned: number;
  plannedSoFar: number;
  /**
   * False when no plan existed during this week. `done` and `planned` are then both 0
   * and the portal MUST render "No plan" — never a 0 % week. A week nothing was
   * scheduled in is not a week the trainee failed.
   */
  hasPlan: boolean;
  /** True for the week containing today. */
  partial: boolean;
}

/**
 * `TraineeAdherenceSeries` — AC3's series and the headline above it.
 *
 * `done` and `planned` are the api's own sums of `weeks[]`. **The portal does not add
 * them up itself** (BUG-198: a workout on a declared rest day already counts as a
 * planned session, and portal-side arithmetic on top of that would compound one wrong
 * number into two that disagree).
 *
 * @wire TraineeAdherenceSeries
 */
export interface AdherenceSeries {
  done: number;
  planned: number;
  weeks: WeekAdherence[];
}

/**
 * `TraineeSessionHistoryItem` — AC5's row: date, name, difficulty, nothing else.
 *
 * @wire TraineeSessionHistoryItem
 */
export interface SessionHistoryItem {
  /** `YYYY-MM-DD` (UTC) of completion. */
  date: string;
  /** Null when the workout row has gone; the portal renders the date alone. */
  name: string | null;
  /** Null renders "No feedback given". It is not a fourth difficulty. */
  difficulty: SessionFeedback | null;
}

/**
 * `TraineeSessionHistory` — the last ten completed sessions and their summary line.
 *
 * `returned` is the REAL count, which is what makes AC5's "Of the last 6 sessions: …"
 * possible without the portal counting rows and hoping the api agrees.
 * `easy + ok + hard + noFeedback === returned`.
 *
 * @wire TraineeSessionHistory
 */
export interface SessionHistory {
  returned: number;
  easy: number;
  ok: number;
  hard: number;
  noFeedback: number;
  /** At most 10, newest first. The cap is server-side and has no parameter. */
  items: SessionHistoryItem[];
}

/**
 * `TraineeMissedSession` — one scheduled day, already passed, with nothing completed
 * on it. AC4's evidence for `MISSED_TWO_OR_MORE_SESSIONS`.
 *
 * @wire TraineeMissedSession
 */
export interface MissedSession {
  /** `YYYY-MM-DD`. Only days strictly before today are ever listed. */
  date: string;
  /** Null when the plan's schedule names no workout for that day. Never invented. */
  sessionName: string | null;
}

/**
 * `TraineeWeighInEvidence` — AC4's evidence for `NO_WEIGH_IN_14_DAYS`.
 *
 * Both fields are null TOGETHER and **only** for a trainee who has never logged a
 * weight in either weight table (BUG-143's two tables, merged api-side). That is the
 * only case that may render "Never weighed in" — a trainee who weighed in nine weeks
 * ago carries a real date here while `weightSeries` is empty, and "nothing recently"
 * is not "nothing ever".
 *
 * @wire TraineeWeighInEvidence
 */
export interface WeighInEvidence {
  /** `YYYY-MM-DD`, of ANY age — not bounded by the 8-week chart window. */
  lastWeighInDate: string | null;
  daysSince: number | null;
}

/**
 * `TraineeFiredRedFlag` — a flag that fired, WITH the evidence it fired on.
 *
 * Exactly one evidence field is populated and the flag decides which. The portal never
 * renders a flag with an empty evidence block and never renders evidence for a flag
 * that did not fire — the list only ever contains flags that fired.
 *
 * @wire TraineeFiredRedFlag
 */
export interface FiredRedFlag {
  flag: RedFlagCode;
  /** `MISSED_TWO_OR_MORE_SESSIONS` only. Never empty — the rule needs two. */
  missedSessions: MissedSession[] | null;
  /** `NO_WEIGH_IN_14_DAYS` only. */
  weighIn: WeighInEvidence | null;
}

/**
 * `GET /coach-portal/clients/{id}/progress` → `TraineeProgressResponse`.
 *
 * Three blocks in one read, each blanking on its OWN scope exactly as the overview's
 * blocks do (ADR-0015 R2-2 / F1): `null` is "not shared", never `0` and never an empty
 * list that reads like data. The portal renders "not shared" from `scopes` and from
 * nothing else — never from a null, never from a 403.
 *
 * @wire TraineeProgressResponse
 */
export interface TraineeProgress {
  clientId: string;
  /** How many ISO weeks the series covers. A server constant; there is no picker. */
  weeks: number;
  /** [WORKOUTS] null = not shared. */
  adherence: AdherenceSeries | null;
  /** [WORKOUTS] null = not shared. */
  sessions: SessionHistory | null;
  /**
   * null = the link carries neither WORKOUTS nor WEIGH_INS; `[]` = "No red flags".
   * Identical, flag for flag, to the overview's `redFlags` — one evaluation, two
   * projections.
   */
  redFlags: FiredRedFlag[] | null;
  scopes: CoachAccessScope[];
}

// ── EV-184b: the routine contract ───────────────────────────────────────────

/*
 * ════════════════════════════════════════════════════════════════════════════
 * NO LONGER PROVISIONAL — realigned to b-fit-api main (`5bc455c`) on 2026-09-18.
 *
 * EV-184a landed and the shapes below are now read off the DEPLOYED api, not asked
 * for: `CoachRoutineResponse`, `CoachRoutineDraftResponse` and the
 * `com.bfit.application.dto.routine` records they carry. The block that stood here
 * described an api that had not been built, and the difference was not academic —
 * `trainingProfile` was a field b-fit-api has never sent, and dereferencing it threw
 * inside a server component's render, so the live routine page was a 200 with nothing
 * but the shell on it (BUG: the live routine crash of 2026-09-18).
 *
 * THE TWO LAYERS BELOW ARE DIFFERENT THINGS AND THE NAMES SAY SO.
 *
 *   · `Routine` / `RoutineTrainingDay` / `RoutineExercise` and the two `Coach*Response`
 *     records are THE WIRE. Field for field what b-fit-api serves, api names verbatim,
 *     no reshaping. Anything typed here is a claim about a deployment, and
 *     `qa/contract-drift.test.mjs` checks every one of those claims against the
 *     vendored `spec/b-fit-api.openapi.yaml`.
 *
 *   · `RoutinePlanView` / `RoutineDayEntry` / `RoutineExerciseEntry` are THE EDITOR'S
 *     MODEL — a flatter shape the routine editor edits, derived from the wire by
 *     `src/lib/routineDocument.ts`. They are NOT a contract and must never be typed as
 *     one; the previous version of this file blurred exactly that line, which is how a
 *     field nobody serves ended up looking like a field somebody serves.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** `RoutineExercise.trackingType`. Null is WEIGHT_REPS for backward compatibility. */
export type TrackingType = "WEIGHT_REPS" | "DURATION";

/**
 * 🔌 WIRE — `com.bfit.application.dto.routine.RoutineExercise`.
 *
 * Note what is NOT here, because its absence is a product fact and not an omission:
 * there is **no `catalogSlug`, no `primaryMuscles` and no `equipment`**. The persisted
 * routine document carries an exercise NAME and nothing that identifies a catalog row,
 * so the identity the coach picked in `CatalogPicker` does not survive a save/publish
 * round trip — `RoutinePolicy` matches on the name, which is why it can. The editor's
 * `RoutineExerciseEntry` therefore carries those three as NULLABLE: populated for an
 * exercise the coach just picked in this session, null for every exercise read back.
 * @wire RoutineExercise
 *
 */
export interface RoutineExercise {
  name: string;
  sets: number;
  /** "8-12", "AMRAP". Null on a DURATION exercise. */
  reps: string | null;
  /** "90s". */
  rest: string;
  tempo: string | null;
  notes: string | null;
  /** Null is treated as WEIGHT_REPS by the api. */
  trackingType: TrackingType | null;
  durationSeconds: number | null;
  weight: string | null;
}

/**
 * 🔌 WIRE — `com.bfit.application.dto.routine.TrainingDay`. ISO 1=Monday…7=Sunday.
 *
 * @wire TrainingDay
 */
export interface RoutineTrainingDay {
  dayOfWeek: number;
  focus: string;
  /** `@Positive Integer`, so absent is possible. */
  estimatedMinutes: number | null;
  exercises: RoutineExercise[];
}

/**
 * 🔌 WIRE — `com.bfit.application.dto.routine.ProgressionRule`.
 *
 * @wire ProgressionRule
 */
export interface ProgressionRule {
  week: number;
  adjustment: string;
  rationale: string | null;
}

/**
 * 🔌 WIRE — `com.bfit.application.dto.routine.Constraints`.
 *
 * @wire RoutineConstraints
 */
export interface RoutineConstraints {
  equipment: string[];
  injuries: string[];
  minutesPerSession: number;
  daysPerWeek: number;
}

/**
 * 🔌 WIRE — `com.bfit.application.dto.routine.Routine`, the document the trainee's own
 * app renders. `GET …/routine` serves it under `routine` and `GET …/routine/draft`
 * serves it under `document`; `PUT …/routine/draft` takes one as its whole body.
 * @wire Routine
 *
 */
export interface Routine {
  name: string;
  goal: string;
  level: string;
  daysPerWeek: number;
  trainingDays: RoutineTrainingDay[];
  weeklyProgression: ProgressionRule[];
  constraints: RoutineConstraints;
  summary: string | null;
}

/**
 * 🔌 WIRE — `CoachRoutineResponse.Guardrails`. EV-184 AC1's read-only panel.
 *
 * **This is the field the page renders, and its name is the api's.** It was
 * `trainingProfile: { injuries, equipment }` here until 2026-09-18 — a name b-fit-api
 * has never sent on any endpoint. Adopting `guardrails` rather than translating it in
 * the adapter is deliberate on three grounds: the api is the source of truth and this
 * module's whole rule is that its names travel verbatim to the JSX; the api's name is
 * the *better* name, because these two lists are the policy's inputs and not a
 * "profile"; and the api's record carries a third field the translated shape dropped.
 *
 * `injuries` is the trainee's stored `user_profiles.injuries` — SCREAMING_SNAKE tokens
 * for the eight onboarding chips PLUS whatever free text they typed into the "Anything
 * else?" box, verbatim. `equipment` is their stored equipment answer, ADR-0005 D1a's
 * eleven published tokens. Both are wire vocabularies and neither is renderable as-is;
 * `src/lib/guardrailLabels.ts` turns them into words.
 * @wire CoachRoutineGuardrails
 *
 */
export interface CoachRoutineGuardrails {
  injuries: string[];
  equipment: string[];
  /**
   * Whether a NON-EMPTY equipment list reached the policy — derived server-side from
   * the stored profile, never hardcoded.
   *
   * It is on this response as well as on the publish preview because, as
   * `CoachRoutineResponse.Guardrails`' javadoc puts it, "the sentence it governs is on
   * this screen too". What it governs here is NOT an equipment-safety claim — EV-184
   * AC3's warning box already says the plan is checked against injuries and not
   * equipment, and BUG-053 is undeployed. What it disambiguates is the EMPTY LIST:
   * `equipment: []` with `equipmentChecked: false` means the trainee never ANSWERED the
   * equipment question, which is a different sentence from "they recorded none", and
   * rendering the second for the first is a claim about a trainee nobody made. See
   * `copy.routine.equipmentUnanswered`.
   */
  equipmentChecked: boolean;
}

/**
 * 🔌 WIRE — `GET /coach-portal/clients/{id}/routine` → `CoachRoutineResponse`.
 *
 * An ENVELOPE, not the editor's model: the active plan arrives as three sibling fields
 * (`planId`, `planName`, `routine`) and the draft arrives as a PRESENCE
 * (`hasDraft` + `draftUpdatedAt`) whose document costs a second call to
 * `GET …/routine/draft`. Both differences were invisible while the fixture served a
 * shape of this surface's own invention.
 *
 * There is **no `traineeDisplayName` here** — the routine page takes the name from the
 * overview, which the `[id]` layout has already awaited and `React.cache` makes free.
 * @wire CoachRoutineResponse
 *
 */
export interface CoachRoutineResponse {
  clientId: string;
  /** Null when the trainee is on no plan. */
  planId: string | null;
  /** Null renders AC1's "No active plan" empty state. */
  planName: string | null;
  /** Null when the trainee has never had a routine (edge case 9). */
  routine: Routine | null;
  guardrails: CoachRoutineGuardrails;
  hasDraft: boolean;
  /** ISO instant; null when there is no draft. */
  draftUpdatedAt: string | null;
}

/**
 * 🔌 WIRE — `GET/PUT /coach-portal/clients/{id}/routine/draft`.
 *
 * **A 200 with nulls, never a 404** — the absence IS the information, and this surface
 * must not treat "no draft" as an error. `schemaVersion` is the `Routine` shape version
 * the row was written at; the portal reads it for nothing today and types it so that a
 * future migration is a visible decision rather than a silently ignored field.
 * @wire CoachRoutineDraftResponse
 *
 */
export interface CoachRoutineDraftResponse {
  document: Routine | null;
  schemaVersion: number | null;
  updatedAt: string | null;
  /**
   * EV-188a. Which template this draft was started from, for the editor's "Started
   * from {name}" line — null for a hand-built draft, and **null again once that
   * template is deleted** (`ON DELETE SET NULL`), which is AC2's delete rule showing
   * through the read: deleting a template makes the line disappear and changes nothing
   * else about the draft.
   *
   * It is an ID and not a name, so the line costs a lookup against the library list.
   * It is never provenance on the PUBLISHED plan: publish deletes the draft row, so
   * after a publish no row anywhere joins a plan to a template.
   */
  sourceTemplateId: string | null;
  /**
   * EV-188 AC5 — exercise NAMES in this draft the catalogue would not match today,
   * re-derived on every open and NEVER stored.
   *
   * The portal marks the matching rows in place and offers Replace and Remove, and
   * that is the whole of its authority here: **nothing removes an exercise from a
   * coach's programming except the coach pressing Remove.** Because the list is
   * re-derived, the marks are gone after a catalogue re-sync with no edit having been
   * made — and two opens of an unedited draft may legitimately differ.
   */
  unbindableExercises: string[];
  /**
   * Whether the catalogue check RAN. `false` with an empty list means NOT CHECKED,
   * which is a different fact from "checked and clean" — the same distinction
   * `CoachRoutineGuardrails.equipmentChecked` exists for. The portal renders no
   * clean-bill sentence for the unchecked case, because on a fresh deploy the derived
   * index is built over zero rows.
   */
  catalogChecked: boolean;
}

// ── the editor's model (NOT a contract — derived by src/lib/routineDocument.ts) ──

/**
 * ✏️ EDITOR MODEL — one prescription row as the editor holds it.
 *
 * `catalogSlug`, `primaryMuscles` and `equipment` are nullable because the WIRE does
 * not carry them (see `RoutineExercise`). They are populated only for an exercise the
 * coach picked from the catalog in this session, and they are lost on the next read —
 * which is worth knowing before anything is built on them. `sets` is a number; `reps`
 * and `rest` are strings because the persisted record's are.
 */
export interface RoutineExerciseEntry {
  /** `ExerciseCatalogEntry.slug` — the identity the coach PICKED, when they just did. */
  catalogSlug: string | null;
  name: string;
  primaryMuscles: string | null;
  equipment: string | null;
  sets: number;
  reps: string;
  rest: string;
}

/** ✏️ EDITOR MODEL — one training day. `dayOfWeek` is ISO 1=Monday…7=Sunday. */
export interface RoutineDayEntry {
  dayOfWeek: number;
  /** The split label the coach reads ("Upper body"). */
  focus: string;
  exercises: RoutineExerciseEntry[];
}

/** ✏️ EDITOR MODEL — a plan as the coach edits it: name + days. */
export interface RoutinePlanView {
  /** Null for a draft that has never been published. */
  planId: string | null;
  name: string;
  /** Schedule order is the api's order; this surface does not re-sort it. */
  trainingDays: RoutineDayEntry[];
}

/** ✏️ EDITOR MODEL — a saved draft. `updatedAt` is an ISO instant; last write wins. */
export interface CoachRoutineDraft extends RoutinePlanView {
  updatedAt: string;
}

/* ════════════════════════════════════════════════════════════════════════════
 * ⛔ KNOWN BROKEN AGAINST LIVE — the routine WRITE path (EV-184 AC2/AC3).
 *
 * The read path above was realigned to b-fit-api main on 2026-09-18. The write path
 * was NOT, and this block is why, so that nobody reads the silence as agreement.
 *
 * `PUT /coach-portal/clients/{id}/routine/draft` takes `@Valid @RequestBody Routine` —
 * the WHOLE document — and answers `CoachRoutineDraftResponse`. This surface sends
 * `{name, trainingDays}` and expects a flat draft back, so against a real api a "Save
 * draft" is a 400 and the editor shows its generic failure. That is pre-existing and
 * unchanged by this branch; it is registered field by field in
 * `qa/contract-deviations.mjs` so the contract test keeps it visible.
 *
 * It is NOT fixed here because fixing it is not a web decision:
 *
 *   1. `Routine` requires `goal`, `level` (`@NotBlank`), `weeklyProgression`,
 *      `constraints` and `constraints.minutesPerSession` (`@Positive`). For a trainee
 *      who has never had a routine — the api's own edge case 9, "the coach builds one
 *      from scratch" — the portal has no honest source for any of them, and inventing
 *      a goal and a training level for somebody else's trainee in the web tier is
 *      exactly the kind of fabrication this surface refuses.
 *   2. Even with an existing document to carry forward, the editor edits a LOSSY
 *      projection: `tempo`, `notes`, `trackingType`, `durationSeconds`, `weight` and
 *      `estimatedMinutes` are on the wire and on no coach control, so a naive rebuild
 *      of the document would silently delete a DURATION exercise's prescription from a
 *      trainee's plan. Deciding how a partial edit merges is a story/api question.
 *
 * → Needs `architect` + `java-engineer`: either the api accepts a coach-shaped draft
 *   body (name + days, merged server-side against the stored document, defaults for a
 *   from-scratch plan), or EV-184 gains the fields a coach must author. Until one of
 *   those lands, these two types describe a request b-fit-api refuses.
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * ⛔ `PUT …/routine/draft` as this surface sends it — see the block above.
 *
 * @wire Routine
 */
export interface CoachRoutineDraftRequest {
  name: string;
  trainingDays: RoutineDayEntry[];
}


/* ════════════════════════════════════════════════════════════════════════════
 * EV-188b — THE COACH'S ROUTINE LIBRARY. The first resource on this prefix that
 * the COACH owns rather than one they reach through a trainee.
 *
 * ✅ TYPED AGAINST A SHIPPED API — but only since 2026-09-21, and the history is
 * the point. Every name below was written against `b-fit-api`
 * `feat/ev188a-template-library-api` @ `341f752` while that branch was APPROVE +
 * QA PASS and **unmerged**, under a hard merge condition. `b-fit-api` main is now
 * `21ed43f` (the merge of that branch) and `341f752` is an ancestor of it, so the
 * condition is DISCHARGED and `spec/b-fit-api.sha` reads `on-api-main: YES`.
 *
 * Two facts worth keeping, because they are what makes the re-sync a check rather
 * than a formality: `341f752:openapi.yaml` and `21ed43f:openapi.yaml` are
 * BYTE-IDENTICAL (sha256 13f0662…), so nothing typed below depends on anything
 * the merged spec lacks; and the re-sync was not remembered by a person — the
 * forcing function in `qa/api-merge-condition.spec.ts` turned red the moment the
 * api caught up, which is exactly the job it was written for.
 *
 * WHAT THE PORTAL MUST NOT ASSUME, from the api's own QA pass:
 *   · The server accepts only a PUBLISHABLE template (ADR-0016 §Amendment V1b).
 *     Full `@Valid Routine` runs at the save boundary: fewer than two training
 *     days, a day with no exercises, or a `daysPerWeek` that disagrees with the
 *     list, and the save is a 400. There is no validation group and there will
 *     not be one. **The editor owns transient invalid state** — see
 *     `src/lib/templateDocument.ts`, which refuses to POST rather than
 *     discovering the 400, and `TemplateEditor`, which holds the work locally.
 *   · Apply is DEFAULT-REFUSING and the confirm is a 409 RETRY, not a pre-read
 *     (D9.1). `replacesDraftUpdatedAt` is echoed from the 409's
 *     `details.existingUpdatedAt`, and the comparison happens inside the write
 *     transaction, so a second tab that saved in between is refused AGAIN.
 *   · **Apply does not publish.** It writes the coach's draft for that trainee
 *     and touches no `plans` row. The trainee's app, refreshed at that moment,
 *     still shows their old plan. Every sentence this surface renders around
 *     apply has to survive that fact — EV-201 exists because "Publish" did not
 *     publish and the screen never said so.
 * ════════════════════════════════════════════════════════════════════════════ */

/*
 * `TEMPLATE_NAME_MAX` is in `src/lib/templateDocument.ts`, not here, and that is not
 * tidiness: this module is `server-only`, so a client island importing one VALUE from
 * it drags `apiFetch` and the bearer token into the browser bundle and Next refuses to
 * build. Client components may import TYPES from here (erased at compile time) and
 * nothing else.
 */

/**
 * 🔌 WIRE — one row of `GET /coach-portal/templates`.
 *
 * Name, day count, exercise count, last-updated — "and nothing else" is AC2's own
 * phrase and it is the reason this is a separate type from `CoachTemplate`: the list
 * does not carry the document, and a row that could render an exercise would grow one.
 * The two counts are derived server-side from the document on every list call.
 *
 * @wire CoachTemplateSummaryResponse
 */
export interface CoachTemplateSummary {
  id: string;
  name: string;
  dayCount: number;
  exerciseCount: number;
  /** ISO instant. The list is newest-updated first and this surface does not re-sort it. */
  updatedAt: string;
}

/**
 * 🔌 WIRE — `GET /coach-portal/templates`.
 *
 * `limit` and `remaining` are served so the portal can say "You can keep up to 50
 * templates" without hardcoding 50, and can show "Delete one to make room" BEFORE the
 * 409 rather than only after it. Unpaged by design: the cap is a product bound, so a
 * flat list needs no folders, tags or search.
 *
 * @wire CoachTemplateListResponse
 */
export interface CoachTemplateList {
  templates: CoachTemplateSummary[];
  limit: number;
  remaining: number;
}

/**
 * 🔌 WIRE — `CoachTemplateResponse`: a template with its document.
 *
 * `document.constraints.equipment` and `.injuries` are ALWAYS empty — the api strips
 * them at the write boundary and REFUSES any row where they are not at the read
 * boundary (AC4). The portal must send them empty too, and
 * `src/lib/templateDocument.ts` is the one place that guarantees it: a template carries
 * the coach's prescription and nothing a trainee said about themselves.
 *
 * `minutesPerSession` and `daysPerWeek` DO survive — they are the coach's own
 * prescription, not a trainee's answer.
 *
 * @wire CoachTemplateResponse
 */
export interface CoachTemplate {
  id: string;
  name: string;
  schemaVersion: number;
  document: Routine;
  createdAt: string;
  updatedAt: string;
}

/**
 * 🔌 WIRE — the body of `POST /coach-portal/templates` and `PUT …/templates/{id}`.
 *
 * **The whole `Routine`, not a projection.** This is the one place this surface differs
 * in kind from EV-184b's still-broken `CoachRoutineDraftRequest`, and the difference is
 * not a style choice — it is what makes the write path sendable at all:
 *
 *   · the ⛔ draft path cannot send `goal`/`level` because inventing a training goal
 *     for SOMEBODY ELSE'S TRAINEE in the web tier is a fabrication. A template belongs
 *     to the coach and describes nobody, so the coach authors those fields themselves,
 *     through controls, and the editor shows every one of them;
 *   · the ⛔ draft path would drop `tempo`, `notes`, `trackingType`, `durationSeconds`,
 *     `weight` and `estimatedMinutes` on a round trip because the editor edits a lossy
 *     projection. The template editor edits the DOCUMENT, so nothing is lost — which
 *     AC4 requires from the other direction too: "nothing travels in a template that
 *     the coach cannot see and edit", so any field that survives has to be on screen.
 *
 * @wire CoachTemplateSaveRequest
 */
export interface CoachTemplateSaveRequest {
  name: string;
  document: Routine;
}

/**
 * 🔌 WIRE — `POST …/templates/{id}/rename`.
 *
 * Its own mapping rather than a nullable field on the save body, so a rename from the
 * library list does not have to fetch the whole document first.
 *
 * @wire CoachTemplateRenameRequest
 */
export interface CoachTemplateRenameRequest {
  name: string;
}

/** Which of the trainee's two routines "Save as template" copies (AC1). */
export type CoachTemplateSource = "PLAN" | "DRAFT";

/**
 * 🔌 WIRE — `POST /coach-portal/clients/{id}/routine/save-as-template`.
 *
 * `source` is a closed enum and not a boolean, deliberately: "from the published plan"
 * and "from my unpublished draft" are two facts, and a `fromDraft: boolean` is how a
 * third source becomes a second boolean.
 *
 * @wire CoachTemplateFromRoutineRequest
 */
export interface CoachTemplateFromRoutineRequest {
  name: string;
  source: CoachTemplateSource;
}

/**
 * 🔌 WIRE — `POST …/templates/{id}/apply`.
 *
 * `clientId` is the `coach_clients` LINK id, the same id every other mapping on this
 * prefix takes in its path — it is in a body here because the URL addresses the
 * TEMPLATE, and it is resolved through `requireActiveLinkRow(WORKOUTS)` exactly as a
 * path segment would be. A trainee this coach may not write to is refused, and the
 * portal never offers them in the picker in the first place (AC3).
 *
 * `replacesDraftUpdatedAt` ABSENT means "only if there is no draft". That is the whole
 * of D9.1: the first apply asserts nothing, a 409 says what exists, and the retry
 * echoes the timestamp the coach was shown.
 *
 * @wire CoachTemplateApplyRequest
 */
export interface CoachTemplateApplyRequest {
  clientId: string;
  replacesDraftUpdatedAt?: string | null;
}

/**
 * 🔌 WIRE — the trainee's DRAFT as it stands after a template was copied into it.
 *
 * ⚠ It is a draft. No `plans` row was written, no `user_plan` row, no assignment. The
 * trainee sees nothing until the coach publishes, and every sentence this surface
 * renders after an apply says so.
 *
 * `unbindableExercises` is AC5's advisory list of exercise NAMES the catalogue would
 * not match today — re-derived on every read and never stored. `catalogChecked: false`
 * with an empty list means NOT CHECKED, which is a different fact from "checked and
 * clean"; the portal must not render the clean sentence for the unchecked case.
 *
 * @wire CoachTemplateApplyResponse
 */
export interface CoachTemplateApplyResult {
  clientId: string;
  sourceTemplateId: string;
  sourceTemplateName: string;
  document: Routine;
  updatedAt: string;
  replacedExistingDraft: boolean;
  unbindableExercises: string[];
  catalogChecked: boolean;
}

/**
 * One line of the publish preview — **a whole sentence, in the engine's own words**.
 *
 * This module asked for a triple (`{ exercise, replacedWith, rule }`) and EV-184a
 * ships `List<String>` (`CoachPublishPreviewResponse.repairs`, branch
 * feat/ev184a-coach-routine-api). The portal adapts to what the api serves, so this is
 * an alias rather than a record: the whole surface names ONE type, and if the staff
 * review of EV-184a — where contract item (e) challenges exactly this, on the ground
 * that EV-184 AC3 asks for the triple — forces the structured shape back, this alias
 * becomes the interface again and the rest of the diff is the JSX that renders it.
 *
 * What the portal loses by taking a string, recorded so the review can weigh it: it
 * cannot truncate the exercise name inside the modal (EV-184 edge case 6), cannot
 * style the three parts differently, and cannot assert in a test that the replacement
 * is a real catalog entry. What it gains is that the rule sentence is unambiguously
 * the engine's; the portal composes nothing.
 *
 * Either way the portal never invents a repair sentence: `RoutinePolicy` is the only
 * thing that knows which rule fired.
 */
export type PublishRepair = string;

/**
 * `POST …/routine/publish/preview`. An EMPTY `repairs` is "No changes were needed".
 *
 * @wire CoachPublishPreviewResponse
 */
export interface PublishPreview {
  repairs: PublishRepair[];
  /**
   * `repairs.length`, served by the api (`CoachPublishPreviewResponse.repairCount`) so
   * AC3's heading "We changed N things to keep this safe" cannot disagree with the
   * list beside it. The modal still counts the array it renders — a heading derived
   * from a different number than the list it heads is the bug this field exists to
   * make impossible, and reading the field instead would just move the disagreement.
   * It is consumed here to keep the contract honest and asserted equal in the fixture.
   */
  repairCount: number;
  /**
   * OPAQUE. The api hashes (draftId, document, ordered repairs); this surface never
   * parses, shortens, stores or recomputes it — it echoes the exact string back to
   * `POST …/routine/publish`. See answer 2 in the block at the top.
   */
  digest: string;
  /**
   * D4/A12: whether a NON-EMPTY equipment list actually reached the policy, derived by
   * the api and never hardcoded — it reads `false` until BUG-053 is deployed and turns
   * true on its own afterwards.
   *
   * Consumed here and deliberately NOT RENDERED. EV-184 AC3's warning box says the
   * plan is checked against injuries and not equipment, and that sentence is the
   * story's; turning it into a conditional claim ("equipment checked ✓") would be this
   * surface promising a guarantee out of a boolean whose false is the current truth.
   * It is typed so the day the box changes, the data is already here.
   */
  equipmentChecked: boolean;
}

/**
 * `POST …/routine/publish` → the plan the trainee now has.
 *
 * @wire CoachPublishResultResponse
 */
export interface PublishResult {
  planId: string;
  publishedAt: string;
  /**
   * The repairs that WERE applied — identical to the acknowledged preview's, by
   * construction (`CoachPublishResultResponse.repairs`). The portal does not render
   * them: the coach acknowledged the same list one modal ago, and repeating it after
   * the fact would read as a second, different set of changes.
   */
  repairs: PublishRepair[];
  /**
   * EQUAL BY CONSTRUCTION to the previewed `repairs.length`. D4: publish re-runs the
   * policy and answers 409 on ANY mismatch with the acknowledged set, so a publish that
   * succeeds applied exactly what the coach was shown. If these two ever differ, the
   * digest comparison is broken — it is not a number for the portal to reconcile.
   */
  repairCount: number;
}

/**
 * One catalog row, pick-only. `slug` is the identity, `name` is the label.
 *
 * @wire ExerciseCatalogDto
 */
export interface CatalogExercise {
  slug: string;
  name: string;
  primaryMuscles: string | null;
  equipment: string | null;
}

/**
 * 🔌 WIRE — `GET /coach-portal/catalog/exercises` → `CoachCatalogPageResponse`.
 *
 * `searchCatalog` always sends all three parameters, EMPTY STRING INCLUDED
 * (`?q=&muscle=&equipment=`): an empty value means "no filter", never "match nothing".
 * Omitting them instead would make the absent case a second code path on both sides.
 *
 * The facets ARRIVED — `muscles` and `equipment` are derived from the catalog by the
 * api (EV-184a), so the note that used to stand here calling them provisional is
 * settled. What did NOT arrive is `truncated`: this is an ordinary paged envelope, the
 * same one every collection endpoint on b-fit-api serves, and "more rows matched than
 * were returned" is `totalElements > items.length`. The portal computes that where it
 * renders it rather than typing a boolean nobody sends.
 * @wire CoachCatalogPageResponse
 *
 */
export interface CatalogPage {
  items: CatalogExercise[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  /** Every distinct target muscle in the catalog, sorted. */
  muscles: string[];
  /** Every distinct equipment value in the catalog, sorted. */
  equipment: string[];
}

// ── EV-185b: the nutrition contract (PROVISIONAL) ───────────────────────────

/**
 * `NutritionTarget.Source` is `AUTO | MANUAL` today; EV-185's migration adds
 * `COACH`. All three are here so the day the column gains its value this file does
 * not need editing — and so a value with no sentence cannot reach a coach's screen.
 */
export type NutritionTargetSource = "AUTO" | "MANUAL" | "COACH";

/** `ActivityLevel` — the enum verbatim; `copy.ts` owns the words. */
export type ActivityLevel = "SEDENTARY" | "LIGHT" | "MODERATE" | "ACTIVE" | "VERY_ACTIVE";

/** `WeeklyMealPlan.MealSlot`. */
export type MealSlot = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

/**
 * `NutritionTarget`, with the api's `…G` gram suffixes kept verbatim.
 *
 * @wire CoachNutritionTargets
 */
export interface NutritionTargets {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: NutritionTargetSource;
  /** `ActivityLevel`; null for a trainee who never completed nutrition onboarding. */
  activity: ActivityLevel | null;
  /**
   * Did the SIGNED-IN coach write this target? Computed server-side from
   * `nutrition_targets.set_by`, which the portal never receives.
   *
   * ADR-0015's 2026-09-16 amendment, ruling (b), Q2 — and it rules AGAINST the uuid
   * this module asked for. A raw `set_by` would be the first user id of another person
   * this surface has ever been served: ADR-0012 D4 built the whole portal so that
   * `{id}` is a `coach_clients` row id and "a leaked or guessed user id buys nothing",
   * and a previous coach's uuid showing up on two trainees would tell this coach those
   * two trainees shared a coach. A boolean answers the only question the screen asks
   * and leaks nothing.
   *
   * `source === "COACH"` alone is NOT "you": a re-link after a revoke leaves the
   * previous coach's target in place, and `set_by` is NULL after that account is
   * erased. Both make `setByYou` false, which is the fourth label the amendment names.
   */
  setByYou: boolean;
  /** ISO instant — the date in "Set by you on {date}". */
  updatedAt: string;
}

/**
 * `WeeklyMealPlan.PlannedMeal`, reduced to what the coach's week renders.
 *
 * @wire CoachPlannedMeal
 */
export interface PlannedMealView {
  mealId: string;
  slot: MealSlot;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /**
   * The trainee locked this meal. D6.7: `generateWeek` reuses the plan id and CARRIES
   * LOCKED MEALS FORWARD, so an "Apply" replaces the row and not every meal in it.
   * Without this flag the confirm dialog's promise ("Meals the trainee has locked are
   * kept.") is unverifiable on the screen that follows it — the coach sees a week they
   * did not generate and cannot tell which parts of it are the trainee's.
   */
  locked: boolean;
}

/**
 * `WeeklyMealPlan.PlannedDay`. `index` is 0–6 from the week start.
 *
 * @wire CoachPlannedDay
 */
export interface PlannedDayView {
  index: number;
  /** `YYYY-MM-DD`. */
  date: string;
  trainingDay: boolean;
  meals: PlannedMealView[];
}

/**
 * The current week. Seven days, always — a short week is an api bug, not a state.
 *
 * ⛔ OPEN: the amendment's ruling (a) gives the WEEK its own attribution
 * (`weekly_meal_plan.set_by`, week-level provenance — `regenerateDay`, `applySwap` and
 * `markMealEaten` carry it forward unchanged) and ruling (b) serves the trainee a
 * `setByName` for it. It does not say whether the coach portal gets a `setByYou` on
 * the week too. The portal renders no week byline today and will not invent one.
 * @wire CoachMealWeek
 *
 */
export interface MealWeekView {
  /** `YYYY-MM-DD`, the Monday. */
  weekStart: string;
  days: PlannedDayView[];
}

/**
 * The trainee's stored `nutrition_preferences`, READ-ONLY.
 *
 * `rules` is `FoodRule` (HALAL / KOSHER) — hard exclusions. Nothing here is
 * submittable: no request type in this module carries an allergy, a rule or a dislike,
 * which is EV-185's "there is no control anywhere that would let them", enforced by
 * the type system rather than by review.
 * @wire CoachTraineeDietProfile
 *
 */
export interface TraineeDietProfile {
  allergies: string[];
  rules: string[];
  dislikes: string[];
}

/**
 * `GET /coach-portal/clients/{id}/nutrition`.
 *
 * @wire CoachNutritionResponse
 */
export interface CoachNutritionResponse {
  clientId: string;
  traineeDisplayName: string;
  /** Null + a null week is AC1's "No nutrition set up yet". */
  targets: NutritionTargets | null;
  week: MealWeekView | null;
  /**
   * `YYYY-MM-DD` of the week the api considers current. The portal NEVER computes
   * this: a browser-derived Monday would disagree with the server for anyone whose
   * zone crosses the boundary, and "apply" would then be refused with
   * COACH_WEEK_OUT_OF_RANGE for reasons invisible to the coach (edge case 3/5).
   */
  currentWeekStart: string;
  dietProfile: TraineeDietProfile;
}

/**
 * `PUT …/nutrition/targets`. Calories are clamped SERVER-side by the engine's floor.
 *
 * @wire CoachTargetsRequest
 */
export interface CoachTargetsRequest {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * The saved targets plus the engine's own flag.
 *
 * `floorCalories` is non-null exactly when `NutritionService.setTarget` raised the
 * value — D6.1's extraction, where `setManual` becomes one caller of it and the floor
 * becomes the one function no caller can skip. The portal renders the engine's
 * sentence from it rather than deciding for itself that a floor applied: the floor is
 * 1500/1200 by profile sex and this surface does not know the trainee's sex and must
 * not guess it.
 *
 * It is a NUMBER and never a sentence. The api returns what the floor was;
 * `copy.nutrition.floorApplied` is the only place the words exist.
 * @wire CoachTargetsResult
 *
 */
export interface CoachTargetsResult {
  targets: NutritionTargets;
  floorCalories: number | null;
}

/**
 * `POST …/nutrition/week/apply` — current week only in slice 1.
 *
 * @wire CoachApplyWeekRequest
 */
export interface CoachApplyWeekRequest {
  weekStart: string;
}

/**
 * One swap candidate. `index` is `SwapOptionsResponse.Candidate.index`.
 *
 * @wire CoachSwapCandidate
 */
export interface SwapCandidate {
  index: number;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/**
 * `GET …/week/meals/{mealId}/swap`.
 *
 * @wire CoachSwapOptions
 */
export interface SwapOptions {
  mealId: string;
  candidates: SwapCandidate[];
}

/**
 * `POST …/week/meals/{mealId}/swap`.
 *
 * @wire CoachApplySwapRequest
 */
export interface CoachApplySwapRequest {
  candidateIndex: number;
}

// ── error helpers ────────────────────────────────────────────────────────────

export { ApiError } from "./apiFetch";

/**
 * The coach portal answers 403 uniformly for a foreign id, a revoked link AND an id
 * that never existed, so the prefix is not an existence oracle. All three land here
 * and must read the same to the coach.
 */
export function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}
export function isCapacityReached(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_CAPACITY_REACHED";
}

/*
 * There is deliberately NO `isScopeMissing`. ADR-0015 D5 keeps the 403 body
 * undifferentiated across all five denials, so a scope denial is indistinguishable
 * from a foreign id at the transport layer and any helper claiming otherwise would be
 * reading a code the api does not send. The scope sentences come from
 * `ClientOverview.scopes` via `hasScope`, before the tab's endpoint is called at all.
 */
/**
 * 503 — ADR-0013's handler shape `{ code, message, details }`, raised by ADR-0015 D4's
 * `CatalogAvailabilityService.hasRows()` gate on catalog search AND on publish. A
 * trainee may generate against an empty catalog; a coach may not publish against one.
 */
export function isCatalogUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.code === "CATALOG_UNAVAILABLE";
}
/** 400 — a draft with zero training days (EV-184 AC4). */
export function isPlanEmpty(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_PLAN_EMPTY";
}
/**
 * 409 — the draft changed since the preview, so the repair set the coach acknowledged
 * is not the one publish computed (EV-184 AC3, edge case 2: a second tab).
 *
 * The ONLY correct response is to run `previewPublish` again and show the modal with
 * the new repairs. Re-sending the stale digest cannot succeed and re-sending a fresh
 * digest the coach has not seen would defeat the acknowledgement entirely.
 */
export function isRepairsUnacknowledged(err: unknown): boolean {
  return (
    err instanceof ApiError && err.code === "COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED"
  );
}
/* ── EV-188's five refusals (ADR-0016 D9.5) ────────────────────────────────────
 *
 * Each is its OWN code and each has its own sentence, because a template limit reported
 * as a generic denial is a coach who thinks the product is broken. The api-side test
 * `CoachTemplateErrorCodeResolutionTest` holds the handler to these names; these five
 * predicates are the only place the portal reads them.
 */

/** 409 — AC2: the coach already has a template with that name (folded for case). */
export function isTemplateNameTaken(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_TEMPLATE_NAME_TAKEN";
}
/** 409 — AC2's cap at 50. A product bound, NOT a storage control (Ruling 5c). */
export function isTemplateLimitReached(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_TEMPLATE_LIMIT_REACHED";
}
/** 400 — AC2: a training day over 12 exercises. Nothing is truncated. */
export function isTemplateTooLarge(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_TEMPLATE_TOO_LARGE";
}
/**
 * 400 — edge case 12: an active plan with no routine document (the legacy population
 * that predates generated routines). The portal hides "Save as template" for that
 * trainee, so this is the direct-call refusal and a belt to that brace.
 */
export function isTemplateSourceEmpty(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_TEMPLATE_SOURCE_EMPTY";
}
/**
 * 400 — a stored template whose day count a plan cannot carry. ADR-0016's §Amendment
 * describes this and `COACH_PLAN_EMPTY` as **fail-closed backstops for rows not written
 * through the application**: since V1b validates the full publish contract at the save
 * boundary, no template this portal can create can reach it. It is handled anyway,
 * because "unreachable" is a claim about today's writers.
 */
export function isTemplateNotPublishable(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_TEMPLATE_NOT_PUBLISHABLE";
}

/**
 * 409 `COACH_DRAFT_EXISTS` — AC3's confirm, and the reason it is a RETRY.
 *
 * ADR-0016 D9.1 rejected the obvious design (read the draft, show the dialog, then
 * POST) because it is check-then-act across two browser tabs: between the read and the
 * POST the draft can change, and then "this replaces your unpublished draft" is a
 * sentence about something that no longer exists. Apply is default-refusing instead —
 * the first call asserts nothing, this 409 reports what is there, and the retry echoes
 * the timestamp the coach was actually shown. The comparison runs inside the write
 * transaction, so a second tab that saved in between causes the retry to be refused
 * AGAIN rather than to overwrite.
 *
 * Returns the `updatedAt` to echo, or null if the api sent a 409 with no details —
 * in which case the portal must NOT retry blind. Not retrying is a coach who presses
 * the button again; retrying without the assertion is a draft destroyed on a guess.
 */
export function draftExistsUpdatedAt(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.code !== "COACH_DRAFT_EXISTS") return null;
  const value = err.details?.existingUpdatedAt;
  return typeof value === "string" ? value : null;
}
export function isDraftExists(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_DRAFT_EXISTS";
}

/**
 * 429 — D6.6's cap: ONE apply per link per day. The ADR sizes what it bounds (3
 * applies × 30 clients ≈ 630 model calls per coach per day) and records the number so
 * raising it is a decision rather than a default. It is not a transient failure, so
 * the sentence must not invite a retry that cannot work until tomorrow.
 */
export function isWeekApplyRateLimited(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_WEEK_APPLY_RATE_LIMIT";
}

/**
 * 400 — ADR-0015 D6 applies the CURRENT week only, judged on the SERVER clock (the
 * portal sends no timezone; ADR-0011 is mobile-only). EV-185 edge case 3.
 */
export function isWeekOutOfRange(err: unknown): boolean {
  return err instanceof ApiError && err.code === "COACH_WEEK_OUT_OF_RANGE";
}

// ── the live client ──────────────────────────────────────────────────────────

/**
 * `/coach-portal/clients/{id}` — the one id this surface addresses (the
 * `coach_clients` row id, never a user id), encoded once so no call site can forget.
 */
function client(id: string): string {
  return `/coach-portal/clients/${encodeURIComponent(id)}`;
}

const liveCoachApi = {
  getMe(): Promise<CoachMe> {
    return apiFetch<CoachMe>("/coach-portal/me");
  },
  /**
   * `sort` is sent on every call, including for the default: the api's default and
   * this surface's default happen to agree today, and a portal that relied on that
   * agreement would silently change order the day the api's default changed.
   */
  listClients(
    sort: RosterSort = DEFAULT_ROSTER_SORT,
    page = 0,
    size = ROSTER_PAGE_SIZE
  ): Promise<RosterPage> {
    return apiFetch<RosterPage>(
      `/coach-portal/clients?page=${page}&size=${size}&sort=${encodeURIComponent(sort)}`
    );
  },
  createInvite(): Promise<InviteResponse> {
    return apiFetch<InviteResponse>("/coach-portal/invites", { method: "POST" });
  },
  getClient(id: string): Promise<ClientOverview> {
    return apiFetch<ClientOverview>(
      `/coach-portal/clients/${encodeURIComponent(id)}`
    );
  },
  /** EV-187b — the monitoring blocks. GET only; nothing on that page writes. */
  getClientProgress(id: string): Promise<TraineeProgress> {
    return apiFetch<TraineeProgress>(`${client(id)}/progress`);
  },
  async revokeClient(id: string): Promise<void> {
    // 204 No Content — `apiFetch` parses an empty body to null, which is the point.
    await apiFetch<void>(
      `/coach-portal/clients/${encodeURIComponent(id)}/revoke`,
      { method: "POST" }
    );
  },

  // ── EV-184b routine (PROVISIONAL paths — see the block at the top) ─────────

  getRoutine(id: string): Promise<CoachRoutineResponse> {
    return apiFetch<CoachRoutineResponse>(`${client(id)}/routine`);
  },
  /**
   * The draft DOCUMENT, which `GET …/routine` does not carry — it reports the draft's
   * PRESENCE (`hasDraft` + `draftUpdatedAt`) and nothing else, so the editor's starting
   * state costs a second read. Called only when `hasDraft` is true: a 200 full of nulls
   * is the "no draft" answer and asking for it when the envelope already said there is
   * none is a round trip that can only agree.
   */
  getRoutineDraft(id: string): Promise<CoachRoutineDraftResponse> {
    return apiFetch<CoachRoutineDraftResponse>(`${client(id)}/routine/draft`);
  },
  saveRoutineDraft(id: string, draft: CoachRoutineDraftRequest): Promise<CoachRoutineDraft> {
    return apiFetch<CoachRoutineDraft>(`${client(id)}/routine/draft`, {
      method: "PUT",
      body: JSON.stringify(draft),
    });
  },
  async discardRoutineDraft(id: string): Promise<void> {
    // 204 No Content.
    await apiFetch<void>(`${client(id)}/routine/draft`, { method: "DELETE" });
  },
  previewPublish(id: string): Promise<PublishPreview> {
    return apiFetch<PublishPreview>(`${client(id)}/routine/publish/preview`, {
      method: "POST",
    });
  },
  publishRoutine(id: string, digest: string): Promise<PublishResult> {
    return apiFetch<PublishResult>(`${client(id)}/routine/publish`, {
      method: "POST",
      body: JSON.stringify({ digest }),
    });
  },
  searchCatalog(q: string, muscle: string, equipment: string): Promise<CatalogPage> {
    const query = new URLSearchParams({ q, muscle, equipment });
    return apiFetch<CatalogPage>(`/coach-portal/catalog/exercises?${query.toString()}`);
  },

  // ── EV-188b the coach's routine library ───────────────────────────────────
  //
  // 🔴 Nine mappings, all of them on an api branch that has NOT merged. See the block
  // above the template types and `qa/api-merge-condition.spec.ts`.

  listTemplates(): Promise<CoachTemplateList> {
    return apiFetch<CoachTemplateList>("/coach-portal/templates");
  },
  getTemplate(id: string): Promise<CoachTemplate> {
    return apiFetch<CoachTemplate>(`/coach-portal/templates/${encodeURIComponent(id)}`);
  },
  createTemplate(body: CoachTemplateSaveRequest): Promise<CoachTemplate> {
    return apiFetch<CoachTemplate>("/coach-portal/templates", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  updateTemplate(id: string, body: CoachTemplateSaveRequest): Promise<CoachTemplate> {
    return apiFetch<CoachTemplate>(`/coach-portal/templates/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  renameTemplate(id: string, name: string): Promise<CoachTemplate> {
    const body: CoachTemplateRenameRequest = { name };
    return apiFetch<CoachTemplate>(`/coach-portal/templates/${encodeURIComponent(id)}/rename`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  duplicateTemplate(id: string): Promise<CoachTemplate> {
    return apiFetch<CoachTemplate>(
      `/coach-portal/templates/${encodeURIComponent(id)}/duplicate`,
      { method: "POST" }
    );
  },
  async deleteTemplate(id: string): Promise<void> {
    // 204 No Content.
    await apiFetch<void>(`/coach-portal/templates/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  /**
   * AC3. `replacesDraftUpdatedAt` is OMITTED on the first attempt — absent means "only
   * if there is no draft" — and carries the echo from the 409 on the retry. It is never
   * sent as null-meaning-force: there is no force.
   */
  applyTemplate(
    id: string,
    clientId: string,
    replacesDraftUpdatedAt?: string
  ): Promise<CoachTemplateApplyResult> {
    const body: CoachTemplateApplyRequest = replacesDraftUpdatedAt
      ? { clientId, replacesDraftUpdatedAt }
      : { clientId };
    return apiFetch<CoachTemplateApplyResult>(
      `/coach-portal/templates/${encodeURIComponent(id)}/apply`,
      { method: "POST", body: JSON.stringify(body) }
    );
  },
  /**
   * AC1's other two entry points. This one is under `/clients/{id}` and not under
   * `/templates` because its SUBJECT is a trainee — it reads that trainee's plan or the
   * coach's draft for them, so it is guarded by `requireActiveLinkRow(WORKOUTS)` like
   * every other mapping that reads trainee data.
   */
  saveRoutineAsTemplate(
    id: string,
    body: CoachTemplateFromRoutineRequest
  ): Promise<CoachTemplate> {
    return apiFetch<CoachTemplate>(`${client(id)}/routine/save-as-template`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  // ── EV-185b nutrition (PROVISIONAL paths) ─────────────────────────────────

  getNutrition(id: string): Promise<CoachNutritionResponse> {
    return apiFetch<CoachNutritionResponse>(`${client(id)}/nutrition`);
  },
  saveNutritionTargets(id: string, body: CoachTargetsRequest): Promise<CoachTargetsResult> {
    return apiFetch<CoachTargetsResult>(`${client(id)}/nutrition/targets`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  applyMealWeek(id: string, weekStart: string): Promise<MealWeekView> {
    const body: CoachApplyWeekRequest = { weekStart };
    return apiFetch<MealWeekView>(`${client(id)}/nutrition/week/apply`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
  regenerateDay(id: string, index: number): Promise<MealWeekView> {
    return apiFetch<MealWeekView>(
      `${client(id)}/nutrition/week/days/${index}/regenerate`,
      { method: "POST" }
    );
  },
  getSwapOptions(id: string, mealId: string): Promise<SwapOptions> {
    return apiFetch<SwapOptions>(
      `${client(id)}/nutrition/week/meals/${encodeURIComponent(mealId)}/swap`
    );
  },
  applySwap(id: string, mealId: string, candidateIndex: number): Promise<MealWeekView> {
    const body: CoachApplySwapRequest = { candidateIndex };
    return apiFetch<MealWeekView>(
      `${client(id)}/nutrition/week/meals/${encodeURIComponent(mealId)}/swap`,
      { method: "POST", body: JSON.stringify(body) }
    );
  },
};

export type CoachApi = typeof liveCoachApi;

const impl: CoachApi = COACH_API_MODE === "fixture" ? fixtureCoachApi : liveCoachApi;

export const coachApi = {
  ...impl,
  /**
   * The invite URL is built here, not by the api: only this surface knows the host a
   * phone can reach it on (ADR-0012 D5 — LAN IP for the demo, `pro.evoli.fit` when
   * ⛔ D8 lands). Shown and QR-encoded from this one string so the two are
   * byte-identical, which is AC2.
   *
   * The coach's display name is appended as `?coach=<name>` (EV-183 AC3): the mobile
   * consent screen has to name the coach *before* the trainee accepts, and the api has
   * no pre-accept lookup for an invite token, so the name has to travel on the link.
   * It is a hint, not a credential — the app falls back to "Your coach" without it, so
   * a failed /coach-portal/me must never cost the coach their invite.
   */
  async createInviteWithUrl(): Promise<Invite> {
    const [inviteResult, meResult] = await Promise.allSettled([impl.createInvite(), impl.getMe()]);
    if (inviteResult.status === "rejected") throw inviteResult.reason;
    const invite = inviteResult.value;

    const coachName =
      meResult.status === "fulfilled" ? sanitiseCoachName(meResult.value.displayName) : null;
    const query = coachName ? `?coach=${encodeURIComponent(coachName)}` : "";

    return { ...invite, url: `${INVITE_BASE_URL}/i/${invite.token}${query}` };
  },
};

/*
 * ⛔ `sortNeedsAttentionFirst` WAS HERE, and it is gone on purpose (EV-187b).
 *
 * It sorted the roster in the browser's server render by `lastCompletedWorkoutDate`,
 * because `GET /coach-portal/clients` carried no flag count and fetching one per row
 * would have been an N+1 on every roster render. EV-187a put `redFlagCount` on the row
 * and `sort` on the endpoint, so **the api sorts now** — and the portal must not
 * re-sort on top of it for a reason that is structural rather than tidy: the sort key
 * spans the whole roster and this surface holds ONE PAGE of it, so a client-side sort
 * orders page 1 among itself and calls it triage. AC2's "load the flags lazily per row"
 * is refused by the story for the same reason.
 *
 * The old function's ruling survives inside the api's comparator, which the fixture
 * mirrors in `sortRoster`: a null `lastCompletedWorkoutDate` means "never trained" when
 * PROGRESS is held and sorts FIRST, and "unknown" when it is not and sorts LAST.
 */

