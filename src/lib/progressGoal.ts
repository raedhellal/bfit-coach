import type { CoachProgressGoalRequest, TraineeProgressGoal, TraineeProgressReading } from "./coachApi";
import type { Copy } from "./copy";
import type { Locale } from "./i18n/locale";
import { formatDate, formatKg, formatKgDelta, formatNumberInput, formatPct, formatPtsDelta } from "./format";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EV-202b — every decision the progress block makes, as pure functions.
 *
 * Nothing here touches the api, a cookie or React. That is on purpose: the four
 * things this story can get wrong are all DECISIONS rather than markup, and a decision
 * that lives in JSX can only be tested by driving a browser to the one state that
 * reaches it. `import type` from `coachApi` (which is `server-only`) is erased, so
 * this module is importable from a client component and from a spec alike.
 *
 * The four:
 *   1. the request is a WHOLE REPRESENTATION — `buildProgressGoalRequest`;
 *   2. `weightToGoKg` is SIGNED and must not print as "−6.0 kg to go" — `toGoValue`;
 *   3. an EMPTY delta and a ZERO delta are different facts — `metricRow` emits no
 *      delta CELL for the first and a "0.0 kg" cell for the second;
 *   4. "not recorded" (no body fat exists) and "no reading on or after {date}" (the
 *      start date is later than every reading) are different facts too.
 *
 * EV-274b adds a fifth, and it runs the OTHER way from the first:
 *   5. `milestoneBodyFatPct` is sent only when the coach has TOUCHED the field, because
 *      on that one key "absent" means "unchanged" (EV-274 B4) — `buildProgressGoalRequest`
 *      and `ProgressGoalFormState.bodyFatTouched`.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ── 1. the request ─────────────────────────────────────────────────────────── */

export type ProgressGoalInputError = "DATE" | "MILESTONE" | "BODY_FAT";

/**
 * The body-fat field as the builder needs it: its text, and whether that text is the
 * COACH'S (typed since the field was last seeded from the server) or the server's.
 */
export interface BodyFatInput {
  text: string;
  touched: boolean;
}

/** EV-274 B2 — the api's own bounds, in percentage points. Inclusive at both ends. */
export const BODY_FAT_MILESTONE_MIN = 3;
export const BODY_FAT_MILESTONE_MAX = 60;

/**
 * Digits, then at most ONE SIGNIFICANT decimal: `20.1`, `20.10` and `60.00` pass,
 * `20.05` does not. The api judges the VALUE (`stripTrailingZeros().scale() > 1`), not
 * the text, so trailing zeros are the same number and must be accepted — the first cut
 * of this regex (`\.\d`) refused `20.10`, `60.00` and `3.00`, which the api takes.
 *
 * Refused ON PURPOSE although the api would take the value they denote: exponent
 * notation (`1e1`, `2e1` — a number to `Number`, a typo to a coach), a leading `+`, and
 * a trailing or bare point. A minus sign is refused by both (every negative is below 3).
 */
const AT_MOST_ONE_DECIMAL = /^\d+(?:\.\d0*)?$/;

/**
 * EV-274b AC1 — the body-fat milestone, checked in the browser against the api's rule:
 * 3.0..60.0 inclusive, at most one significant decimal. It matches the api on every
 * plain decimal, except exponent notation, a leading `+` and a trailing point, which are
 * refused on purpose (see `AT_MOST_ONE_DECIMAL`). Anything refused gets "Enter a
 * percentage between 3 and 60." and NO request is sent.
 *
 * ⚠ Unlike the weight, this one IS range-checked here, because the AC says so. The api
 * still refuses those values with `COACH_MILESTONE_OUT_OF_RANGE` — the browser check
 * is the coach's earlier answer, not the enforcement.
 *
 * **A decimal comma is accepted** (`20,5` → 20.5), and that is EV-274 edge case 6's own
 * conditional, not a liberty: *"refused … unless the weight field accepts a comma, in
 * which case both must behave the same."* The weight field has accepted one since
 * EV-202b (`replace(",", ".")` below), so the two fields share the rule. The comma is
 * turned into a point BEFORE the one-decimal check, so `20,55` is still refused.
 *
 * An empty field is a CLEAR (`null`), which the builder sends only if touched.
 */
export function parseBodyFatMilestone(
  input: string
): { ok: true; value: number | null } | { ok: false } {
  const text = input.trim().replace(",", ".");
  if (text === "") return { ok: true, value: null };
  if (!AT_MOST_ONE_DECIMAL.test(text)) return { ok: false };
  const value = Number(text);
  if (value < BODY_FAT_MILESTONE_MIN || value > BODY_FAT_MILESTONE_MAX) return { ok: false };
  return { ok: true, value };
}

export type BuiltProgressGoalRequest =
  | { ok: true; body: CoachProgressGoalRequest }
  | { ok: false; reason: ProgressGoalInputError };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 🔴 **THE EDIT FORM ALWAYS SENDS BOTH FIELDS. THIS IS THE ONLY PLACE A REQUEST IS
 * BUILT, AND IT IS WHY.**
 *
 * `PUT …/progress-goal` is a whole representation: `{}` clears BOTH values and answers
 * `200`. There is no audit trail and no previous value, so a request carrying only the
 * field the coach just edited destroys the other one silently — and the START DATE is
 * the worse of the two, because a cleared `startedOn` falls back to the link date with
 * `startedOnSource: LINK_DEFAULT`, which renders as a **plausible wrong date** rather
 * than as a blank. A coach would have no way to notice.
 *
 * Three things hold the property, and none of them is a comment:
 *   · the return type is `CoachProgressGoalRequest`, whose two fields are REQUIRED and
 *     nullable — a partial object is a compile error, not a runtime surprise;
 *   · both arguments are the CURRENT CONTENTS OF THE TWO FIELDS, always, so there is
 *     no "changed field" to pass and no shape in which a call site could send one;
 *   · `qa/coach-progress-goal.spec.ts` pins the key set in all four branches and then
 *     drives the property through the browser: it edits ONE field, saves, reloads and
 *     asserts the other survived. Against a fixture that clears what it is not sent,
 *     that test goes red the moment this function starts economising.
 *
 * An empty string is a CLEAR (`null`), not "leave it alone" — edge case 7: "an
 * explicit null is a write, not a no-op". It is the same statement the form makes on
 * screen, where an empty field is an empty field.
 *
 * The milestone is NOT range-checked here. 25..300 kg is the api's refusal to make
 * (`COACH_MILESTONE_OUT_OF_RANGE`, edge case 6) and a client-side clamp — or even a
 * client-side rejection — would hide the mistake instead of reporting it. What is
 * rejected here is a value that is not a number at all, which no api can interpret.
 */
export function buildProgressGoalRequest(
  startedOnInput: string,
  milestoneInput: string,
  bodyFat: BodyFatInput
): BuiltProgressGoalRequest {
  const date = startedOnInput.trim();
  if (date !== "" && !ISO_DATE.test(date)) return { ok: false, reason: "DATE" };

  const milestone = milestoneInput.trim();
  let milestoneWeightKg: number | null = null;
  if (milestone !== "") {
    const parsed = Number(milestone.replace(",", "."));
    if (!Number.isFinite(parsed)) return { ok: false, reason: "MILESTONE" };
    milestoneWeightKg = parsed;
  }

  const body: CoachProgressGoalRequest = {
    // Both keys, every time. See the block above before touching this object.
    startedOn: date === "" ? null : date,
    milestoneWeightKg,
  };

  /**
   * 🔴 EV-274 B4 — **the body-fat key travels exactly when the coach has touched the
   * field, and then ALWAYS, including as `null` to clear.**
   *
   * On this one key the api reads ABSENT as UNCHANGED. So sending it untouched would let
   * a tab opened before another tab set a body-fat milestone overwrite that value with
   * the one it happened to load (EV-274b AC4: the other tab's value survives "only if
   * [this] form still showed the old value"). And omitting it once touched would drop the
   * coach's edit — or their clear — without a word.
   *
   * "Touched" is reset only when the field is re-seeded from the server, never by
   * sending: a save the api refuses (a weight out of range) leaves the body fat the
   * coach typed in the field AND still owed to the next save.
   */
  if (bodyFat.touched) {
    const parsed = parseBodyFatMilestone(bodyFat.text);
    if (!parsed.ok) return { ok: false, reason: "BODY_FAT" };
    body.milestoneBodyFatPct = parsed.value;
  }

  return { ok: true, body };
}

/**
 * EV-202's analytics table wants `changed` as one of `start | milestone | both |
 * cleared` on a successful PUT.
 *
 * ⚠ It carries a FIFTH value, `unchanged`, and the addition is deliberate. A coach can
 * open this form and press Save without editing anything — the fields are seeded from
 * the stored values — and that is a successful PUT which altered neither number.
 * Reporting it as `both` would make the property false in the one direction the event
 * exists to measure. The story's four values are unchanged and still exhaustive over
 * the saves that changed something.
 */
export type ProgressGoalChange =
  | "start"
  | "milestone"
  | "bodyfat"
  | "both"
  | "cleared"
  | "unchanged";

/**
 * EV-274 adds `bodyfat` (only the body-fat milestone moved) and widens `both` to "more
 * than one of the three moved" — the api's own reading of the same word in its
 * `coach_progress_goal_set` log line at `18fbcab`, kept rather than renamed so an existing
 * query still counts the multi-field saves. An ABSENT body-fat key is "unchanged" (B4),
 * so it is compared as the stored value.
 */
export function describeChange(
  before: {
    startedOn: string | null;
    milestoneWeightKg: number | null;
    milestoneBodyFatPct?: number | null;
  },
  after: CoachProgressGoalRequest
): ProgressGoalChange {
  const bodyFatBefore = before.milestoneBodyFatPct ?? null;
  const bodyFatAfter =
    after.milestoneBodyFatPct === undefined ? bodyFatBefore : after.milestoneBodyFatPct;
  const startChanged = before.startedOn !== after.startedOn;
  const milestoneChanged = before.milestoneWeightKg !== after.milestoneWeightKg;
  const bodyFatChanged = bodyFatBefore !== bodyFatAfter;
  const moved = [startChanged, milestoneChanged, bodyFatChanged].filter(Boolean).length;
  /**
   * ⚠ "Nothing changed" is asked FIRST, before "both are now empty".
   *
   * The other order reported `cleared` for a Save on a trainee who never had either
   * value — the stored pair is `{null, null}`, the built body is `{null, null}`, and
   * nothing was cleared because there was nothing there. That is the same falsity
   * `unchanged` was added to avoid, surviving one branch higher up.
   */
  if (moved === 0) return "unchanged";
  if (after.startedOn === null && after.milestoneWeightKg === null && bodyFatAfter === null) {
    return "cleared";
  }
  if (moved > 1) return "both";
  if (startChanged) return "start";
  return milestoneChanged ? "milestone" : "bodyfat";
}

/** EV-202 edge case 6 — the api's weight bounds, used ONLY to name a 400's cause. */
const WEIGHT_MILESTONE_MIN = 25;
const WEIGHT_MILESTONE_MAX = 300;

/**
 * Which value a 400 `COACH_MILESTONE_OUT_OF_RANGE` refused. The code is the same for
 * both milestones and `message` is never copy (BUG-173), so the cause is worked out from
 * what was SENT: the api checks the weight first, so a weight outside 25..300 is the
 * answer whenever there is one. Otherwise a body fat on the request is the only other
 * candidate. The browser refuses a bad body fat before sending, so that branch is
 * reached only if the two rules drift — and then the sentence names the right number.
 */
export function refusedMilestone(body: CoachProgressGoalRequest): "WEIGHT" | "BODY_FAT" {
  const w = body.milestoneWeightKg;
  if (w !== null && (w < WEIGHT_MILESTONE_MIN || w > WEIGHT_MILESTONE_MAX)) return "WEIGHT";
  if (body.milestoneBodyFatPct !== undefined && body.milestoneBodyFatPct !== null) return "BODY_FAT";
  return "WEIGHT";
}

/* ── 2. the signed "to go" figure ───────────────────────────────────────────── */

/**
 * 🔴 `weightToGoKg` is `milestone − current`, so a coach working DOWN to a milestone
 * gets a NEGATIVE number — and the api is right to send it signed, because the sign is
 * the only thing that says which way the work goes.
 *
 * Printed raw under the words "to go" it reads **"−6.0 kg to go"**, where EV-202 AC2
 * reads "6.0 kg to go". So:
 *
 *   · **a cut (negative) prints its MAGNITUDE, unsigned** — "6.0 kg to go". "To go" is
 *     a distance, and a distance is not signed; AC2 is the story's own rendering of it.
 *   · **a bulk (positive) keeps its `+`** — "+4.0 kg to go", which is edge case 4's own
 *     wording. The plus is not decoration: it is the one case where the coach must go
 *     UP, and dropping it would make a bulk and a cut print identically. No warning
 *     fires and no direction is assumed (edge case 4) — the sign IS the direction.
 *   · **an exact hit prints "0.0 kg to go"** (edge case 5). No celebration, no event.
 *
 * The delta cell in the same row stays fully signed (`formatKgDelta`), because a delta
 * is a change and a change has a direction. The two cells mean different things and
 * are formatted by different functions for that reason.
 */
export function toGoValue(weightToGoKg: number, locale: Locale): string {
  const rounded = Number(weightToGoKg.toFixed(1));
  if (rounded < 0) return formatKg(Math.abs(rounded), locale);
  return formatKgDelta(rounded, locale);
}

/**
 * EV-274b AC2 — the same rule in percentage POINTS, for `bodyFatToGoPts`, which the api
 * signs exactly as it signs `weightToGoKg` (milestone − current): a milestone below the
 * current reading prints its magnitude ("4.0 pts to go"), one above keeps its plus
 * ("+2.0 pts to go"), and an exact hit is "0.0 pts to go" (edge case 2 of EV-274).
 */
export function bodyFatToGoValue(bodyFatToGoPts: number, locale: Locale): string {
  const rounded = Number(bodyFatToGoPts.toFixed(1));
  // U+00A0 between number and unit, as `formatPtsDelta` does: they never wrap apart.
  if (rounded < 0) {
    const magnitude = Math.abs(rounded).toFixed(1);
    return `${locale === "fr" ? magnitude.replace(".", ",") : magnitude}\u00a0pts`;
  }
  return formatPtsDelta(rounded, locale);
}

/* ── 3 + 4. the two metric rows ─────────────────────────────────────────────── */

export type GoalCellKey = "absent" | "start" | "current" | "delta" | "milestone" | "toGo";

export interface GoalCell {
  key: GoalCellKey;
  text: string;
}

export interface GoalRow {
  metric: "weight" | "bodyFat";
  label: string;
  cells: GoalCell[];
}

/**
 * Does this trainee have ANY reading at all? AC5's condition, and it is asked over all
 * four readings rather than over the weight alone.
 *
 * `currentWeight === null` would nearly do — "current" is the latest reading with no
 * date filter, so no current weight means no weight ever — but edge case 2 allows a
 * `body_measurements` row with a null `weightKg` and a real `bodyFatPct`. That trainee
 * HAS recorded something, and telling their coach they "hasn't recorded a weight yet"
 * while the api is holding their body fat would be a sentence contradicted by the row
 * beneath it.
 */
export function hasAnyReading(goal: TraineeProgressGoal): boolean {
  return (
    goal.startWeight !== null ||
    goal.currentWeight !== null ||
    goal.startBodyFat !== null ||
    goal.currentBodyFat !== null
  );
}

/** AC4's state: the trainee logs through the weigh-in screen, which has no body fat. */
export function bodyFatAbsent(goal: TraineeProgressGoal): boolean {
  return goal.startBodyFat === null && goal.currentBodyFat === null;
}

/**
 * Body fat prints its own date only when that date DIFFERS from the weight date in the
 * same column.
 *
 * Both halves of this rule come from the story and they pull in opposite directions:
 * AC2 prints "Body fat — Start 28.0 % · Current 24.0 % · −4.0 pts" with no dates at
 * all, while edge case 2 requires that when the two columns resolve to different days
 * "the screen prints each date rather than one heading date". The seed behind AC2 has
 * weight and body fat on the SAME `body_measurements` rows, so a date on the body-fat
 * cell there would be the same date twice on one line — noise that AC2 does not print.
 * When they genuinely differ, the date is the whole point and it appears.
 */
function bodyFatText(
  reading: TraineeProgressReading,
  weightReading: TraineeProgressReading | null,
  copy: Copy
): string {
  const value = formatPct(reading.value, copy.locale);
  if (weightReading !== null && weightReading.date === reading.date) return value;
  return copy.progressGoal.withDate(value, formatDate(reading.date, copy.locale));
}

function weightText(reading: TraineeProgressReading, copy: Copy): string {
  // A weight reading ALWAYS prints its date (AC2), because the start baseline moves
  // with the start date and a coach has to see which reading was selected.
  return copy.progressGoal.withDate(formatKg(reading.value, copy.locale), formatDate(reading.date, copy.locale));
}

/**
 * One metric row, as the list of cells AC2 prints in order.
 *
 * 🔴 **The delta CELL IS ABSENT when the delta is null, and present reading "0.0 kg"
 * when it is zero.** AC3 says it in as many words: a start date after every reading
 * yields an empty delta, "never `0`". Those are two different statements about a
 * person — "we cannot say" and "no change" — and rendering the first as the second is
 * the defect the AC was written to catch.
 *
 * An absent cell rather than an empty one is also what makes the distinction
 * ASSERTABLE: a `<span>` containing nothing has no text for a spec to find, so a suite
 * checking "the delta is empty" would pass against a delta that had simply stopped
 * rendering for some other reason. Each cell carries `data-cell`, so QA asserts a
 * COUNT of zero.
 */
function metricRow(goal: TraineeProgressGoal, metric: "weight" | "bodyFat", copy: Copy): GoalRow {
  const locale = copy.locale;
  const isWeight = metric === "weight";
  const label = isWeight ? copy.progressGoal.weight : copy.progressGoal.bodyFat;
  const start = isWeight ? goal.startWeight : goal.startBodyFat;
  const current = isWeight ? goal.currentWeight : goal.currentBodyFat;
  const delta = isWeight ? goal.weightDeltaKg : goal.bodyFatDeltaPts;

  const bodyFatMilestone = isWeight ? null : (goal.milestoneBodyFatPct ?? null);

  // AC4: "Body fat — Not recorded". Never `0 %`, never a dash, never an empty row.
  if (start === null && current === null) {
    const cells: GoalCell[] = [{ key: "absent", text: copy.progressGoal.notRecorded }];
    /**
     * EV-274b AC3, verbatim: "Body fat — Not recorded · Milestone 22.0 %", and no "to
     * go" — there is no reading to measure a distance from, and the api sends no
     * `bodyFatToGoPts` for it. The milestone is still a number the coach wrote, so it is
     * still shown.
     */
    if (bodyFatMilestone !== null) {
      cells.push({ key: "milestone", text: copy.progressGoal.milestone(formatPct(bodyFatMilestone, locale)) });
    }
    return { metric, label, cells };
  }

  const text = (reading: TraineeProgressReading, column: "start" | "current"): string =>
    isWeight
      ? weightText(reading, copy)
      : bodyFatText(reading, column === "start" ? goal.startWeight : goal.currentWeight, copy);

  const cells: GoalCell[] = [];

  cells.push({
    key: "start",
    text:
      start !== null
        ? copy.progressGoal.start(text(start, "start"))
        : // AC3, verbatim: the start baseline never reaches backwards past the start
          // date, and when nothing is on or after it the column says so with the date
          // it was asked about — not with the earliest reading of all time.
          copy.progressGoal.noReadingOnOrAfter(formatDate(goal.startedOn, locale)),
  });

  cells.push({
    key: "current",
    text:
      current !== null
        ? copy.progressGoal.current(text(current, "current"))
        : // Unreachable against EV-202a — "current" is the latest reading with no date
          // filter, so a start reading without a current one cannot exist. Rendered
          // rather than crashed, with no new sentence invented for it.
          copy.progressGoal.notRecorded,
  });

  if (delta !== null) {
    cells.push({ key: "delta", text: isWeight ? formatKgDelta(delta, locale) : formatPtsDelta(delta, locale) });
  }

  /**
   * 🔴 Two milestones, and no third. EV-202 ruled a milestone for anything but weight
   * out of scope by name; EV-274 reverses that for BODY FAT ONLY, at Raed's explicit
   * ask. Waist, chest, hips, arm and thigh stay out on EV-202's original reasoning.
   */
  if (isWeight && goal.milestoneWeightKg !== null) {
    cells.push({ key: "milestone", text: copy.progressGoal.milestone(formatKg(goal.milestoneWeightKg, locale)) });
    if (goal.weightToGoKg !== null) {
      cells.push({ key: "toGo", text: copy.progressGoal.toGo(toGoValue(goal.weightToGoKg, locale)) });
    }
  }
  /**
   * EV-274b AC2: "… · Milestone 20.0 % · 4.0 pts to go". The "to go" is the API's
   * `bodyFatToGoPts`, never recomputed here, and it is ABSENT rather than null when it
   * cannot be computed — so it is read by `typeof`, which also treats a null from any
   * other deployment as the absence it is.
   */
  if (!isWeight && bodyFatMilestone !== null) {
    cells.push({ key: "milestone", text: copy.progressGoal.milestone(formatPct(bodyFatMilestone, locale)) });
    if (typeof goal.bodyFatToGoPts === "number") {
      cells.push({ key: "toGo", text: copy.progressGoal.toGo(bodyFatToGoValue(goal.bodyFatToGoPts, locale)) });
    }
  }

  return { metric, label, cells };
}

/** The two rows, weight first, exactly as AC2 prints them. */
export function progressRows(goal: TraineeProgressGoal, copy: Copy): GoalRow[] {
  return [metricRow(goal, "weight", copy), metricRow(goal, "bodyFat", copy)];
}

/* ── the two provenance lines ───────────────────────────────────────────────── */

/**
 * "Coaching started 1 Jun 2026 · set by a coach".
 *
 * `LINK_DEFAULT` gets its own clause because a defaulted date must never be passed off
 * as a typed one — that is the rendering that makes a silent wipe of `startedOn`
 * invisible. `SELF` gets the date and NO clause: EV-202 AC11 gives the trainee nothing
 * editable, so "set by the trainee" would be copy for a state the product cannot
 * reach. The value exists on the wire (the column has a `SELF` source for a future
 * story); the SENTENCE is the claim, and it is withheld until something can produce it.
 */
export function startedOnLine(goal: TraineeProgressGoal, copy: Copy): string {
  const date = copy.progressGoal.startedOn(formatDate(goal.startedOn, copy.locale));
  if (goal.startedOnSource === "COACH") return `${date} · ${copy.progressGoal.startedOnCoach}`;
  if (goal.startedOnSource === "LINK_DEFAULT") {
    return `${date} · ${copy.progressGoal.startedOnLinkDefault}`;
  }
  return date;
}

/**
 * "Milestone set by Alex R. on 20 Sep 2026", or the `ON DELETE SET NULL` case.
 *
 * Null when there is no milestone: no empty state, no "not set" placeholder and no
 * call to action (AC10's rule, applied on this side of the wire too). A `SELF`
 * milestone yields no line, for the same reason `startedOnLine` withholds one.
 *
 * EV-274: EITHER milestone earns the line. One PUT writes both, so they share one
 * `set_by` and one `updated_at`, and the api resolves `milestoneSetByName` for a row
 * carrying only a body-fat milestone too (b-fit-api `18fbcab`, `hasMilestone()`).
 */
export function milestoneAttribution(goal: TraineeProgressGoal, copy: Copy): string | null {
  if (goal.milestoneWeightKg === null && (goal.milestoneBodyFatPct ?? null) === null) return null;
  if (goal.milestoneSource === "SELF") return null;
  if (goal.milestoneSetByName === null) return copy.progressGoal.milestoneSetByGone;
  return copy.progressGoal.milestoneSetBy(
    goal.milestoneSetByName,
    formatDate(goal.milestoneUpdatedAt ?? goal.startedOn, copy.locale)
  );
}

/* ── seeding the form ───────────────────────────────────────────────────────── */

/**
 * What the two fields hold when the block is opened or re-seeded after a save.
 *
 * The start date field is EMPTY for a `LINK_DEFAULT` date, and that is the important
 * one: seeding it with the fallback would make the coach's first save write the link
 * date as if they had typed it, turning a defaulted value into a coach-attributed one
 * without anybody deciding to.
 *
 * BUG-464 — the two numbers are written the page's way: "70,4" on a French page, where
 * the row above already reads "70,4 kg". Ungrouped, because `buildProgressGoalRequest`
 * reads a decimal comma but not a grouping space; a "70,4" saved untouched sends 70.4.
 */
export function seedFields(goal: TraineeProgressGoal, locale: Locale): {
  startedOn: string;
  milestone: string;
  bodyFat: string;
} {
  const bodyFat = goal.milestoneBodyFatPct ?? null;
  return {
    startedOn: goal.startedOnSource === "LINK_DEFAULT" ? "" : goal.startedOn.slice(0, 10),
    milestone: goal.milestoneWeightKg === null ? "" : formatNumberInput(goal.milestoneWeightKg, locale, false),
    bodyFat: bodyFat === null ? "" : formatNumberInput(bodyFat, locale, false),
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 THE FORM'S STATE, AND THE ONE RULE THAT KEEPS A COACH'S KEYSTROKES.
 *
 * The block is handed fresh props whenever the route re-renders — and on THIS screen
 * that happens on the back of the coach's own save: `revalidatePath` in the server
 * action makes Next return a new RSC payload **with the action's response**, in the
 * same tick. So "props changed" arrives while the coach may still be typing, and a
 * form that re-seeds on every prop change deletes what they are writing.
 *
 * Dropping `router.refresh()` does NOT close that — the payload rides on the action's
 * own response, not on a second request. This was measured three ways on `5c8b7d3`
 * (as-is: reverted; without the success re-seed: still reverted; without
 * `revalidatePath` as well: survives), so the only fix that holds is per-field.
 *
 * The rule: **a field the coach has touched since the last settled save is never
 * re-seeded, whatever caused the props to change.** A field they have not touched
 * still tracks the server, so a value changed in another tab still lands.
 *
 * `revalidatePath` STAYS. It is what keeps every other path — a reload, a
 * back-navigation, a second tab — reading the stored values rather than a cached
 * render, and the same review that found the race confirmed nothing is stale on any
 * of them precisely because it fires.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export type ProgressGoalField = "startedOn" | "milestone" | "bodyFat";

export interface ProgressGoalFormState {
  startedOn: string;
  milestone: string;
  bodyFat: string;
  /** Touched since the last settled save. Not rendered — it decides re-seeding only. */
  dirty: { startedOn: boolean; milestone: boolean; bodyFat: boolean };
  /**
   * EV-274 B4 — is the body-fat TEXT the coach's rather than the server's? Decides
   * whether `milestoneBodyFatPct` goes on the request at all.
   *
   * ⚠ Not the same flag as `dirty.bodyFat`, and the difference is a lost edit. `dirty` is
   * cleared when a save is SENT (`markSent`) so the reply may re-seed the field; this is
   * cleared only when the field IS re-seeded from the server. Between the two sits a save
   * the api refused — a weight out of range — after which the field still holds the body
   * fat the coach typed, and the next save must still carry it. Driving the key off
   * `dirty` would send nothing, answer "Saved." and keep the old value.
   */
  bodyFatTouched: boolean;
}

/** A clean form, seeded from the server. Every field tracks the server again. */
export function seedFormState(goal: TraineeProgressGoal, locale: Locale): ProgressGoalFormState {
  return {
    ...seedFields(goal, locale),
    dirty: { startedOn: false, milestone: false, bodyFat: false },
    bodyFatTouched: false,
  };
}

/**
 * Re-seed from `goal`, keeping any field the coach is in the middle of editing.
 *
 * `dirty` is carried forward rather than cleared: a prop push is not a save, so it
 * must not decide that the coach has finished with a field. Only a settled save
 * clears it (`seedFormState`).
 */
export function reseedPreservingEdits(
  current: ProgressGoalFormState,
  goal: TraineeProgressGoal,
  locale: Locale
): ProgressGoalFormState {
  const seeded = seedFields(goal, locale);
  return {
    startedOn: current.dirty.startedOn ? current.startedOn : seeded.startedOn,
    milestone: current.dirty.milestone ? current.milestone : seeded.milestone,
    bodyFat: current.dirty.bodyFat ? current.bodyFat : seeded.bodyFat,
    dirty: current.dirty,
    // Re-seeded ⇒ the text is the server's again ⇒ the key stays off the next request.
    bodyFatTouched: current.dirty.bodyFat ? current.bodyFatTouched : false,
  };
}

/** One field edited by the coach — which marks it dirty and nothing else. */
export function editField(
  current: ProgressGoalFormState,
  field: ProgressGoalField,
  value: string
): ProgressGoalFormState {
  return {
    ...current,
    [field]: value,
    dirty: { ...current.dirty, [field]: true },
    bodyFatTouched: current.bodyFatTouched || field === "bodyFat",
  };
}

/**
 * A save has been sent: every field is the coach's settled intent until re-touched.
 * `bodyFatTouched` is deliberately left as it is — see its jsdoc.
 */
export function markSent(current: ProgressGoalFormState): ProgressGoalFormState {
  return { ...current, dirty: { startedOn: false, milestone: false, bodyFat: false } };
}

/** What `describeChange` compares against — the stored values, not the field text. */
export function storedValues(goal: TraineeProgressGoal): {
  startedOn: string | null;
  milestoneWeightKg: number | null;
  milestoneBodyFatPct: number | null;
} {
  return {
    startedOn: goal.startedOnSource === "LINK_DEFAULT" ? null : goal.startedOn.slice(0, 10),
    milestoneWeightKg: goal.milestoneWeightKg,
    milestoneBodyFatPct: goal.milestoneBodyFatPct ?? null,
  };
}
