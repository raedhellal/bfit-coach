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
 * `PAIN_REPORTED` is published by the api and **never emitted**: there is no
 * structured pain signal in the product (`Feedback` is {EASY, OK, HARD} and no mobile
 * call site writes `workout_completion.notes`), so the server deliberately does not
 * compute that rule. We keep it in the vocabulary — and keep its sentence in copy.ts —
 * so the gap is visible rather than silently absent (ADR-0012 D6).
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

/** One row of `GET /coach-portal/clients` → `CoachClientSummaryResponse`. */
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
  status: ClientStatus;
  /** ISO-8601 instant — when the trainee accepted. */
  since: string;
}

/**
 * `GET /coach-portal/clients` → `CoachClientPageResponse`.
 *
 * A paged envelope, not a bare array: every collection endpoint on b-fit-api
 * paginates. The roster is one page in practice (see `ROSTER_PAGE_SIZE`).
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

/** `POST /coach-portal/invites` → 201 `CoachInviteResponse`. Raw token, once, ever. */
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

/** `TraineeWeightPoint`. */
export interface WeightPoint {
  /** `YYYY-MM-DD`. */
  date: string;
  weightKg: number;
}

/** `TraineeLastSession` — block 3. */
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

// ── EV-184b: the routine contract (PROVISIONAL — see the block at the top) ───

/**
 * One prescribed exercise. Field for field `RoutineExercise` in
 * `com.bfit.application.dto.routine`, minus the fields no coach control touches
 * (`tempo`, `notes`, `weight`, `durationSeconds`): `sets` is an int, `reps` and
 * `rest` are strings because the persisted record's are.
 *
 * `catalogSlug` is `ExerciseCatalogEntry.slug` — the identity the coach PICKED.
 * It travels with the draft so the api never has to re-resolve a free-typed name,
 * which is what AC2's "the coach picks, never types" means on the wire.
 */
export interface RoutineExerciseEntry {
  catalogSlug: string;
  name: string;
  /** `ExerciseCatalogEntry.primaryMuscles`; null on a catalog row that has none. */
  primaryMuscles: string | null;
  /** `ExerciseCatalogEntry.equipment`; null means bodyweight/unspecified. */
  equipment: string | null;
  sets: number;
  /** "8-12", "AMRAP" — a string in the persisted record, not a number. */
  reps: string;
  /** "90s" — likewise. */
  rest: string;
}

/** One training day. `dayOfWeek` is ISO 1=Monday…7=Sunday, as `TrainingDay` has it. */
export interface RoutineDayEntry {
  dayOfWeek: number;
  /** `TrainingDay.focus` — the split label the coach reads ("Upper body"). */
  focus: string;
  exercises: RoutineExerciseEntry[];
}

/** A plan as the coach sees it: name + days. */
export interface RoutinePlanView {
  /** Null for a draft that has never been published. */
  planId: string | null;
  name: string;
  /** Schedule order is the api's order; this surface does not re-sort it. */
  trainingDays: RoutineDayEntry[];
}

/**
 * The trainee's stored profile facts, READ-ONLY (CS-22 / ADR-0001).
 *
 * `UserProfile.injuries` / `.equipment` are `List<String>`. They are displayed and
 * never submitted: there is no field in `CoachRoutineDraftRequest` that could carry
 * them, which is the structural version of the story's "may not submit them".
 */
export interface TraineeTrainingProfile {
  injuries: string[];
  equipment: string[];
}

/** A saved draft. `updatedAt` is an ISO instant — last write wins (edge case 2). */
export interface CoachRoutineDraft extends RoutinePlanView {
  updatedAt: string;
}

/** `GET /coach-portal/clients/{id}/routine`. */
export interface CoachRoutineResponse {
  clientId: string;
  traineeDisplayName: string;
  /** Null renders AC1's "No active plan" empty state. */
  activePlan: RoutinePlanView | null;
  /** Null means there is nothing unpublished; the header then claims no draft. */
  draft: CoachRoutineDraft | null;
  trainingProfile: TraineeTrainingProfile;
}

/** `PUT …/routine/draft`. Carries no ids and no injuries — deliberately (CS-22). */
export interface CoachRoutineDraftRequest {
  name: string;
  trainingDays: RoutineDayEntry[];
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

/** `POST …/routine/publish/preview`. An EMPTY `repairs` is "No changes were needed". */
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

/** `POST …/routine/publish` → the plan the trainee now has. */
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

/** One catalog row, pick-only. `slug` is the identity, `name` is the label. */
export interface CatalogExercise {
  slug: string;
  name: string;
  primaryMuscles: string | null;
  equipment: string | null;
}

/**
 * `GET /coach-portal/catalog/exercises`.
 *
 * `searchCatalog` always sends all three parameters, EMPTY STRING INCLUDED
 * (`?q=&muscle=&equipment=`): an empty value means "no filter", never "match nothing".
 * Omitting them instead would make the absent case a second code path on both sides.
 *
 * **The two facet fields are PROVISIONAL** — answer 3 at the top: ADR-0015 decides the
 * 503 gate and is silent on facets, so this is still the shape this surface is asking
 * for rather than one the api has agreed. It is served today by the fixture, whose
 * vocabulary is derived from its own catalog rows and is marked as such. A hard-coded
 * muscle list in the web tier would be product data invented outside the catalog.
 */
export interface CatalogPage {
  items: CatalogExercise[];
  /** Distinct `primaryMuscles` values, for the muscle filter. */
  muscles: string[];
  /** Distinct `equipment` values, for the equipment filter. */
  equipment: string[];
  /** True when more rows matched than were returned — the UI says "refine". */
  truncated: boolean;
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

/** `NutritionTarget`, with the api's `…G` gram suffixes kept verbatim. */
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

/** `WeeklyMealPlan.PlannedMeal`, reduced to what the coach's week renders. */
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

/** `WeeklyMealPlan.PlannedDay`. `index` is 0–6 from the week start. */
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
 */
export interface TraineeDietProfile {
  allergies: string[];
  rules: string[];
  dislikes: string[];
}

/** `GET /coach-portal/clients/{id}/nutrition`. */
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

/** `PUT …/nutrition/targets`. Calories are clamped SERVER-side by the engine's floor. */
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
 */
export interface CoachTargetsResult {
  targets: NutritionTargets;
  floorCalories: number | null;
}

/** `POST …/nutrition/week/apply` — current week only in slice 1. */
export interface CoachApplyWeekRequest {
  weekStart: string;
}

/** One swap candidate. `index` is `SwapOptionsResponse.Candidate.index`. */
export interface SwapCandidate {
  index: number;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** `GET …/week/meals/{mealId}/swap`. */
export interface SwapOptions {
  mealId: string;
  candidates: SwapCandidate[];
}

/** `POST …/week/meals/{mealId}/swap`. */
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
  listClients(page = 0, size = ROSTER_PAGE_SIZE): Promise<RosterPage> {
    return apiFetch<RosterPage>(`/coach-portal/clients?page=${page}&size=${size}`);
  },
  createInvite(): Promise<InviteResponse> {
    return apiFetch<InviteResponse>("/coach-portal/invites", { method: "POST" });
  },
  getClient(id: string): Promise<ClientOverview> {
    return apiFetch<ClientOverview>(
      `/coach-portal/clients/${encodeURIComponent(id)}`
    );
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

/**
 * Ordering rule for the roster: needs attention first (EV-183's roster read).
 *
 * **Least recently seen first**, which is the only needs-attention signal the list
 * endpoint carries: `CoachClientSummaryResponse` has no `redFlags` field, and the
 * flags are computed per trainee by `GET /coach-portal/clients/{id}`. Fetching them
 * for the roster would mean one extra request per row on every render of the landing
 * page — an N+1 against a tier ladder that already contemplates 100 profiles — so the
 * red-flag chip lives on the overview only, and the roster sorts by
 * `lastCompletedWorkoutDate` ascending instead.
 *
 * **A null date has two readings and they sort to opposite ends.** ADR-0015 D5/S1
 * made `lastCompletedWorkoutDate` scope-filtered, so:
 *
 *   · PROGRESS held, date null → the trainee has never completed a workout. That is
 *     the MOST attention-needing row there is, and it keeps the place it has always
 *     had: first.
 *   · PROGRESS not held (or not stated) → the date is UNKNOWN, and unknown sorts
 *     LAST. Sorting it first produced a needs-attention list led by precisely the
 *     trainees the coach has no attention data for, permanently.
 *
 * Telling the two apart is what `RosterClient.scopes` is for — before it existed both
 * nulls had to share one position, and the recorded cost of picking "last" was that a
 * genuinely untrained trainee sank. `hasScope` fails closed, so an api that sends no
 * `scopes` puts every null in the unknown tier, which is the old behaviour and the
 * safe one.
 *
 * Ties break on display name so the order is stable across renders.
 */
export function sortNeedsAttentionFirst(items: RosterClient[]): RosterClient[] {
  /** 0 = never trained, 1 = has a date, 2 = unknown. Lower sorts earlier. */
  const tier = (c: RosterClient): 0 | 1 | 2 => {
    if (c.lastCompletedWorkoutDate !== null) return 1;
    return hasScope(c.scopes, "PROGRESS") ? 0 : 2;
  };
  return [...items].sort((a, b) => {
    const at = tier(a);
    const bt = tier(b);
    if (at !== bt) return at - bt;
    const av = a.lastCompletedWorkoutDate;
    const bv = b.lastCompletedWorkoutDate;
    if (av !== null && bv !== null && av !== bv) return av < bv ? -1 : 1;
    return a.traineeDisplayName.localeCompare(b.traineeDisplayName);
  });
}
