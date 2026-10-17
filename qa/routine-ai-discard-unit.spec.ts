import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { routineAiDiscardOutcome, routineAiProposalPath } from "../src/lib/routineAiDiscard";

/**
 * EV-186f U9 (b) and (c) — EV-377 AC3 and AC6, with no browser and no server.
 *
 * (b) `coachApi.discardRoutineAiProposal` requests exactly `routineAiProposalPath(clientId, proposalId)`
 *     (the module is `server-only`, so its one URL source is tested here).
 * (c) the fixture's DELETE applies `routineAiDiscardOutcome` (the fixture is `server-only` too).
 */

const LINA = "6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001";
const P = "0b8e6f3a-6c1d-4f7e-9a2b-1c3d5e7f9a0b";
const Q = "7d2c4b6a-8e0f-4a1b-9c3d-5e7f9a1b3c5d";

test.describe("U9b — the DELETE path (EV-377 AC3)", () => {
  test("no id: …/routine/ai-proposal with no « ? »", () => {
    for (const none of [undefined, null, ""]) {
      const path = routineAiProposalPath(LINA, none);
      expect(path).toBe(`/coach-portal/clients/${LINA}/routine/ai-proposal`);
      expect(path).not.toContain("?");
    }
  });

  test("an id: exactly one proposalId parameter, that id", () => {
    const path = routineAiProposalPath(LINA, P);
    expect(path).toBe(`/coach-portal/clients/${LINA}/routine/ai-proposal?proposalId=${P}`);
    expect(new URL(path, "http://x").searchParams.getAll("proposalId")).toEqual([P]);
  });
});

test.describe("U9c — the fixture's discard decision (EV-377 AC6)", () => {
  test("the matching id removes P (settled: deleted; running: cancelled), any case", () => {
    expect(routineAiDiscardOutcome({ proposalId: P, status: "READY" }, P)).toEqual({ touched: true, effect: "deleted" });
    expect(routineAiDiscardOutcome({ proposalId: P, status: "FAILED" }, P.toUpperCase())).toEqual({
      touched: true,
      effect: "deleted",
    });
    expect(routineAiDiscardOutcome({ proposalId: P, status: "RUNNING" }, P)).toEqual({ touched: true, effect: "cancelled" });
  });

  test("another id leaves P exactly as it is, touched: false", () => {
    expect(routineAiDiscardOutcome({ proposalId: P, status: "RUNNING" }, Q)).toEqual({ touched: false, effect: "kept" });
    expect(routineAiDiscardOutcome({ proposalId: P, status: "READY" }, Q)).toEqual({ touched: false, effect: "kept" });
  });

  test("no id removes whatever is current; no proposal touches nothing", () => {
    expect(routineAiDiscardOutcome({ proposalId: Q, status: "READY" }, undefined)).toEqual({ touched: true, effect: "deleted" });
    expect(routineAiDiscardOutcome({ proposalId: Q, status: "RUNNING" }, null)).toEqual({ touched: true, effect: "cancelled" });
    expect(routineAiDiscardOutcome(null, P)).toEqual({ touched: false, effect: "none" });
    expect(routineAiDiscardOutcome(null, undefined)).toEqual({ touched: false, effect: "none" });
  });
});
