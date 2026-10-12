import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import {
  MAX_TRIAL_EXERCISES,
  asTrialRead,
  programmePill,
  trialCardView,
  trialFailure,
  trialHistoryHref,
  trialSessionBody,
  type TrialRead,
} from "../src/lib/trialSession";
import type { RoutineExercise } from "../src/lib/coachApi";

/**
 * EV-341j — the trial session's pure parts, in node: the request body, the read's guard, the
 * card's state for every (programmeStatus × trialSession) pair, the roster pill and the
 * refusals. The browser half is `trial-session.spec.ts` (and the pill's, `trial-session-roster`).
 */

const row = (over: Partial<RoutineExercise> = {}): RoutineExercise => ({
  name: "Goblet Squat",
  sets: 3,
  reps: "8-10",
  rest: "90s",
  tempo: null,
  notes: null,
  trackingType: "WEIGHT_REPS",
  durationSeconds: null,
  weight: null,
  ...over,
});

test.describe("the request body (COACH_FIELD_NOT_ACCEPTED: only declared keys)", () => {
  test("is the rows and, when given, the minutes: never a title, a date or a note", () => {
    const rows = [row()];
    expect(trialSessionBody(rows, null)).toEqual({ exercises: rows });
    expect(Object.keys(trialSessionBody(rows, null))).toEqual(["exercises"]);
    expect(trialSessionBody(rows, 40)).toEqual({ estimatedMinutes: 40, exercises: rows });
    expect(Object.keys(trialSessionBody(rows, 40)).sort()).toEqual(["estimatedMinutes", "exercises"]);
  });

  test("clears reps on a timed row (COACH_DRAFT_REPS_ON_DURATION), and touches nothing else", () => {
    const timed = row({ name: "Plank", trackingType: "DURATION", durationSeconds: 45, reps: "8-12" });
    const body = trialSessionBody([row(), timed], null);
    expect(body.exercises[0]).toEqual(row());
    expect(body.exercises[1]).toEqual({ ...timed, reps: null });
  });

  test("the bound is the api's: 30 rows", () => {
    expect(MAX_TRIAL_EXERCISES).toBe(30);
  });
});

test.describe("the read's guard", () => {
  test("accepts the api's vocabulary, with or without a session", () => {
    expect(asTrialRead({ programmeStatus: "AWAITING_PROGRAMME", trialSession: null })).toEqual({
      programmeStatus: "AWAITING_PROGRAMME",
      trialSession: null,
    });
    expect(
      asTrialRead({
        programmeStatus: "TRIAL_DONE",
        trialSession: { status: "DONE", assignedAt: "2026-10-01T09:00:00Z", completedOn: "2026-10-02", title: "x" },
      })
    ).toEqual({
      programmeStatus: "TRIAL_DONE",
      trialSession: { status: "DONE", assignedAt: "2026-10-01T09:00:00Z", completedOn: "2026-10-02" },
    });
  });

  test("refuses an unknown status, a missing field, or not an object: a failed read, never a guess", () => {
    for (const body of [
      null,
      "x",
      [],
      {},
      { programmeStatus: "SOMETHING_NEW", trialSession: null },
      { programmeStatus: "TRIAL_ASSIGNED" },
      { programmeStatus: "TRIAL_ASSIGNED", trialSession: { status: "PAUSED", assignedAt: "2026-10-01T09:00:00Z" } },
      { programmeStatus: "TRIAL_ASSIGNED", trialSession: { status: "ASSIGNED" } },
      { programmeStatus: "TRIAL_DONE", trialSession: { status: "DONE", assignedAt: "2026-10-01T09:00:00Z", completedOn: 5 } },
    ]) {
      expect(asTrialRead(body), JSON.stringify(body)).toBeNull();
    }
  });
});

test.describe("the card's state", () => {
  const at = "2026-10-01T09:00:00Z";
  const read = (programmeStatus: TrialRead["programmeStatus"], status: "ASSIGNED" | "DONE" | "WITHDRAWN" | null): TrialRead => ({
    programmeStatus,
    trialSession: status ? { status, assignedAt: at, completedOn: status === "DONE" ? "2026-10-02" : null } : null,
  });

  test("J1: nothing yet, or withdrawn before it was done → prepare", () => {
    expect(trialCardView(read("AWAITING_PROGRAMME", null))).toEqual({ kind: "prepare" });
    expect(trialCardView(read("AWAITING_PROGRAMME", "WITHDRAWN"))).toEqual({ kind: "prepare" });
  });

  test("J3: assigned → the date and Withdraw, whatever the programme status (I5)", () => {
    expect(trialCardView(read("TRIAL_ASSIGNED", "ASSIGNED"))).toEqual({ kind: "assigned", assignedAt: at });
    expect(trialCardView(read("PUBLISHED", "ASSIGNED"))).toEqual({ kind: "assigned", assignedAt: at });
  });

  test("J3: done → the date and nothing else (J3c withdrawn: TRIAL_DONE has no prepare path)", () => {
    expect(trialCardView(read("TRIAL_DONE", "DONE"))).toEqual({ kind: "done", completedOn: "2026-10-02" });
    expect(trialCardView(read("PUBLISHED", "DONE"))).toEqual({ kind: "none" });
  });

  test("published with nothing assigned → no card", () => {
    expect(trialCardView(read("PUBLISHED", null))).toEqual({ kind: "none" });
  });
});

test.describe("J4 the roster pill", () => {
  test("one for each pre-programme state, none for PUBLISHED, null, absent or unknown", () => {
    expect(programmePill("AWAITING_PROGRAMME")).toBe("AWAITING_PROGRAMME");
    expect(programmePill("TRIAL_ASSIGNED")).toBe("TRIAL_ASSIGNED");
    expect(programmePill("TRIAL_DONE")).toBe("TRIAL_DONE");
    for (const value of ["PUBLISHED", null, undefined, "", "TRIAL_WITHDRAWN", 1, "awaiting_programme"]) {
      expect(programmePill(value), String(value)).toBeNull();
    }
  });
});

test.describe("the refusals", () => {
  test("read by status and code only", () => {
    expect(trialFailure({ status: 403, code: "COACH_ACCESS_DENIED" })).toBe("ACCESS_DENIED");
    expect(trialFailure({ status: 409, code: "COACH_PUBLISH_REPAIRS_UNACKNOWLEDGED" })).toBe("REPAIRS_UNACKNOWLEDGED");
    expect(trialFailure({ status: 409, code: "TRIAL_SESSION_ALREADY_OPEN" })).toBe("ALREADY_OPEN");
    expect(trialFailure({ status: 503, code: "CATALOG_UNAVAILABLE" })).toBe("CATALOG_UNAVAILABLE");
    for (const thrown of [
      { status: 400, code: "VALIDATION_ERROR" },
      { status: 400, code: "COACH_FIELD_NOT_ACCEPTED" },
      { status: 500, code: "INTERNAL_ERROR" },
      new TypeError("fetch failed"),
      undefined,
      null,
    ]) {
      expect(trialFailure(thrown), JSON.stringify(thrown)).toBe("FAILED");
    }
  });

  test("« Faite le » links to the overview's session list", () => {
    expect(trialHistoryHref("6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002")).toBe(
      "/clients/6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0002#ov-activity"
    );
  });
});
