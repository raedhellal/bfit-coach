import type { CoachProgressGoalRequest, TraineeProgressGoal, TraineeProgressReading } from "./coachApi";
import { copy } from "./copy";
import { formatDate, formatKg, formatKgDelta, formatPct, formatPtsDelta } from "./format";

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
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ── 1. the request ─────────────────────────────────────────────────────────── */

export type ProgressGoalInputError = "DATE" | "MILESTONE";

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
  milestoneInput: string
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

  return {
    ok: true,
    // Both keys, every time. See the block above before touching this object.
    body: { startedOn: date === "" ? null : date, milestoneWeightKg },
  };
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
export type ProgressGoalChange = "start" | "milestone" | "both" | "cleared" | "unchanged";

export function describeChange(
  before: { startedOn: string | null; milestoneWeightKg: number | null },
  after: CoachProgressGoalRequest
): ProgressGoalChange {
  const startChanged = before.startedOn !== after.startedOn;
  const milestoneChanged = before.milestoneWeightKg !== after.milestoneWeightKg;
  /**
   * ⚠ "Nothing changed" is asked FIRST, before "both are now empty".
   *
   * The other order reported `cleared` for a Save on a trainee who never had either
   * value — the stored pair is `{null, null}`, the built body is `{null, null}`, and
   * nothing was cleared because there was nothing there. That is the same falsity
   * `unchanged` was added to avoid, surviving one branch higher up.
   */
  if (!startChanged && !milestoneChanged) return "unchanged";
  if (after.startedOn === null && after.milestoneWeightKg === null) return "cleared";
  if (startChanged && milestoneChanged) return "both";
  return startChanged ? "start" : "milestone";
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
export function toGoValue(weightToGoKg: number): string {
  const rounded = Number(weightToGoKg.toFixed(1));
  if (rounded < 0) return formatKg(Math.abs(rounded));
  return formatKgDelta(rounded);
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
  weightReading: TraineeProgressReading | null
): string {
  const value = formatPct(reading.value);
  if (weightReading !== null && weightReading.date === reading.date) return value;
  return copy.progressGoal.withDate(value, formatDate(reading.date));
}

function weightText(reading: TraineeProgressReading): string {
  // A weight reading ALWAYS prints its date (AC2), because the start baseline moves
  // with the start date and a coach has to see which reading was selected.
  return copy.progressGoal.withDate(formatKg(reading.value), formatDate(reading.date));
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
function metricRow(goal: TraineeProgressGoal, metric: "weight" | "bodyFat"): GoalRow {
  const isWeight = metric === "weight";
  const label = isWeight ? copy.progressGoal.weight : copy.progressGoal.bodyFat;
  const start = isWeight ? goal.startWeight : goal.startBodyFat;
  const current = isWeight ? goal.currentWeight : goal.currentBodyFat;
  const delta = isWeight ? goal.weightDeltaKg : goal.bodyFatDeltaPts;

  // AC4: "Body fat — Not recorded". Never `0 %`, never a dash, never an empty row.
  if (start === null && current === null) {
    return { metric, label, cells: [{ key: "absent", text: copy.progressGoal.notRecorded }] };
  }

  const text = (reading: TraineeProgressReading, column: "start" | "current"): string =>
    isWeight
      ? weightText(reading)
      : bodyFatText(reading, column === "start" ? goal.startWeight : goal.currentWeight);

  const cells: GoalCell[] = [];

  cells.push({
    key: "start",
    text:
      start !== null
        ? copy.progressGoal.start(text(start, "start"))
        : // AC3, verbatim: the start baseline never reaches backwards past the start
          // date, and when nothing is on or after it the column says so with the date
          // it was asked about — not with the earliest reading of all time.
          copy.progressGoal.noReadingOnOrAfter(formatDate(goal.startedOn)),
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
    cells.push({ key: "delta", text: isWeight ? formatKgDelta(delta) : formatPtsDelta(delta) });
  }

  /**
   * 🔴 The milestone is on the WEIGHT row and nowhere else. AC2: body fat has "no
   * milestone cell", and EV-202 rules a milestone for body fat, waist or anything but
   * weight out of scope by name — one number was asked for, and four more would be
   * four more "who owns this" questions and a units problem.
   */
  if (isWeight && goal.milestoneWeightKg !== null) {
    cells.push({ key: "milestone", text: copy.progressGoal.milestone(formatKg(goal.milestoneWeightKg)) });
    if (goal.weightToGoKg !== null) {
      cells.push({ key: "toGo", text: copy.progressGoal.toGo(toGoValue(goal.weightToGoKg)) });
    }
  }

  return { metric, label, cells };
}

/** The two rows, weight first, exactly as AC2 prints them. */
export function progressRows(goal: TraineeProgressGoal): GoalRow[] {
  return [metricRow(goal, "weight"), metricRow(goal, "bodyFat")];
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
export function startedOnLine(goal: TraineeProgressGoal): string {
  const date = copy.progressGoal.startedOn(formatDate(goal.startedOn));
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
 */
export function milestoneAttribution(goal: TraineeProgressGoal): string | null {
  if (goal.milestoneWeightKg === null) return null;
  if (goal.milestoneSource === "SELF") return null;
  if (goal.milestoneSetByName === null) return copy.progressGoal.milestoneSetByGone;
  return copy.progressGoal.milestoneSetBy(
    goal.milestoneSetByName,
    formatDate(goal.milestoneUpdatedAt ?? goal.startedOn)
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
 */
export function seedFields(goal: TraineeProgressGoal): {
  startedOn: string;
  milestone: string;
} {
  return {
    startedOn: goal.startedOnSource === "LINK_DEFAULT" ? "" : goal.startedOn.slice(0, 10),
    milestone: goal.milestoneWeightKg === null ? "" : String(goal.milestoneWeightKg),
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
export interface ProgressGoalFormState {
  startedOn: string;
  milestone: string;
  /** Touched since the last settled save. Not rendered — it decides re-seeding only. */
  dirty: { startedOn: boolean; milestone: boolean };
}

/** A clean form, seeded from the server. Both fields track the server again. */
export function seedFormState(goal: TraineeProgressGoal): ProgressGoalFormState {
  return { ...seedFields(goal), dirty: { startedOn: false, milestone: false } };
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
  goal: TraineeProgressGoal
): ProgressGoalFormState {
  const seeded = seedFields(goal);
  return {
    startedOn: current.dirty.startedOn ? current.startedOn : seeded.startedOn,
    milestone: current.dirty.milestone ? current.milestone : seeded.milestone,
    dirty: current.dirty,
  };
}

/** One field edited by the coach — which marks it dirty and nothing else. */
export function editField(
  current: ProgressGoalFormState,
  field: "startedOn" | "milestone",
  value: string
): ProgressGoalFormState {
  return { ...current, [field]: value, dirty: { ...current.dirty, [field]: true } };
}

/** A save has been sent: both fields are the coach's settled intent until re-touched. */
export function markSent(current: ProgressGoalFormState): ProgressGoalFormState {
  return { ...current, dirty: { startedOn: false, milestone: false } };
}

/** What `describeChange` compares against — the stored values, not the field text. */
export function storedValues(goal: TraineeProgressGoal): {
  startedOn: string | null;
  milestoneWeightKg: number | null;
} {
  return {
    startedOn: goal.startedOnSource === "LINK_DEFAULT" ? null : goal.startedOn.slice(0, 10),
    milestoneWeightKg: goal.milestoneWeightKg,
  };
}
