import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import {
  START_REFUSALS,
  nextKnownId,
  nextMark,
  preflightStart,
  reconcileStart,
  startFailureRoute,
  type KnownIdEvent,
  type MarkEvent,
  type StartRead,
} from "../src/lib/routineAiStartReconcile";
import { en } from "../src/lib/copy";
import { fr } from "../src/lib/copy.fr";

/**
 * BUG-871 — ADR-0036 § Amendment BUG-871's decision table as pure functions, one case per row, with
 * no browser and no server. F13(c)'s three cases (senior-po's EXPIRED ruling, EV-186 (n)) are tagged
 * "F13(c) case N". The baseline everywhere is `knownId`, the last proposal id the api returned.
 */

const P = "0b8e6f3a-6c1d-4f7e-9a2b-1c3d5e7f9a0b";
const Q = "7d2c4b6a-8e0f-4a1b-9c3d-5e7f9a1b3c5d";
const F = "3e5a7c9b-1d2f-4a6b-8c0d-2e4f6a8b0c1d";
const X = "9f1e3d5c-7b9a-4c2e-8d0f-1a3b5c7d9e2f";

const read = (proposalId: string | null, status: string, errorCode: string | null = null): StartRead => ({
  ok: true,
  proposal: { proposalId, status, errorCode } as { proposalId: string | null; status: string },
});
const readFailed = (code: string): StartRead => ({ ok: false, code });

test.describe("classify the start's result BEFORE refused(): the allowlist", () => {
  test("the allowlist is exactly the eleven codes the start contract names", () => {
    expect([...START_REFUSALS].sort()).toEqual([
      "ACCESS_DENIED",
      "CATALOG_UNAVAILABLE",
      "COACH_AI_BUSY",
      "COACH_AI_INSTRUCTION_INVALID",
      "COACH_AI_PROPOSAL_RUNNING",
      "COACH_AI_RATE_LIMIT",
      "COACH_AI_UNAVAILABLE",
      "COACH_DRAFT_INPUT_FORBIDDEN",
      "COACH_PLAN_EMPTY",
      "NOT_FOUND",
      "VALIDATION_ERROR",
    ]);
  });

  for (const code of [
    "ACCESS_DENIED", // 403
    "NOT_FOUND", // 404
    "COACH_DRAFT_INPUT_FORBIDDEN", // 400
    "VALIDATION_ERROR", // 400
    "COACH_AI_INSTRUCTION_INVALID", // 400
    "COACH_PLAN_EMPTY", // 400
    "COACH_AI_PROPOSAL_RUNNING", // 409, keeps its existing read
    "COACH_AI_RATE_LIMIT", // 429
    "COACH_AI_UNAVAILABLE", // 503
    "CATALOG_UNAVAILABLE", // 503
    "COACH_AI_BUSY", // 503
  ]) {
    test(`allowlisted ${code} → refused, unchanged, no reconcile`, () => {
      expect(startFailureRoute(code)).toEqual({ kind: "refused" });
    });
  }

  for (const [code, why] of [
    ["FAILED", "no answer: transport error, code-less gateway 5xx, the settled fallback"],
    ["INTERNAL_ERROR", "an api 500 (not isLostAnswer's 'received failure')"],
    ["AUTH_UNAUTHORIZED", "401"],
    ["INVALID_REQUEST", "an undocumented global code"],
    ["PAYLOAD_TOO_LARGE", "an undocumented global code"],
    ["UNSUPPORTED_MEDIA_TYPE", "an undocumented global code"],
    ["METHOD_NOT_ALLOWED", "an undocumented global code"],
    ["SOMETHING_NEW", "an unknown code"],
  ] as const) {
    test(`${code} (${why}) → reconcile`, () => {
      expect(startFailureRoute(code)).toEqual({ kind: "reconcile" });
    });
  }
});

test.describe("the reconcile read (after a start that reconciles)", () => {
  test("knownId = null, read {Q, RUNNING} → adopt", () => {
    expect(reconcileStart(null, read(Q, "RUNNING"))).toEqual({ kind: "adopt" });
  });

  for (const status of ["RUNNING", "READY", "FAILED", "EXPIRED"]) {
    test(`adoptable ${status} with an id ≠ prevId → adopt`, () => {
      expect(reconcileStart(P, read(Q, status))).toEqual({ kind: "adopt" });
    });
    test(`${status} with id = prevId → startUnconfirmed (never adopted, whatever its status)`, () => {
      expect(reconcileStart(P, read(P, status))).toEqual({ kind: "unconfirmed" });
    });
  }

  test("ids compare case-insensitively (a UUID is the same id in either case)", () => {
    expect(reconcileStart(P, read(P.toUpperCase(), "RUNNING"))).toEqual({ kind: "unconfirmed" });
  });

  test("F13(c) case 1: knownId = P, read {Q, EXPIRED, COACH_PROPOSAL_STALE}, Q ≠ knownId → adopt (the stale view)", () => {
    expect(reconcileStart(P, read(Q, "EXPIRED", "COACH_PROPOSAL_STALE"))).toEqual({ kind: "adopt" });
  });

  test("F13(c) case 2: a press from the stale view, knownId = F, read {F, EXPIRED, …} → startUnconfirmed", () => {
    expect(reconcileStart(F, read(F, "EXPIRED", "COACH_PROPOSAL_STALE"))).toEqual({ kind: "unconfirmed" });
    expect(reconcileStart(F, read(F, "EXPIRED", null))).toEqual({ kind: "unconfirmed" });
  });

  test("F13(c) case 3: reload on stale, Try again opens the brief (nothing shown), knownId = F, read {F, EXPIRED} → startUnconfirmed", () => {
    // After the reload, knownId comes from the page's `initial` read of {F, EXPIRED}; the view is the brief.
    let knownId = nextKnownId(null, { kind: "initial", proposal: { proposalId: F } });
    knownId = nextKnownId(knownId, { kind: "view" }); // stale → brief through retry()
    expect(knownId).toBe(F);
    expect(reconcileStart(knownId, read(F, "EXPIRED"))).toEqual({ kind: "unconfirmed" });
  });

  test("brief reached from failed F through retry(), knownId = F, read {F, FAILED} → startUnconfirmed", () => {
    let knownId = nextKnownId(null, { kind: "initial", proposal: { proposalId: F } });
    knownId = nextKnownId(knownId, { kind: "view" });
    expect(reconcileStart(knownId, read(F, "FAILED", "COACH_AI_TIMEOUT"))).toEqual({ kind: "unconfirmed" });
  });

  test("the same from stale: knownId = F, read {F, EXPIRED} → startUnconfirmed", () => {
    expect(reconcileStart(F, read(F, "EXPIRED"))).toEqual({ kind: "unconfirmed" });
  });

  test("{X, CANCELLED} (another tab discarded a run) → startUnconfirmed", () => {
    expect(reconcileStart(P, read(X, "CANCELLED"))).toEqual({ kind: "unconfirmed" });
  });

  test("NONE → startUnconfirmed", () => {
    expect(reconcileStart(P, read(null, "NONE"))).toEqual({ kind: "unconfirmed" });
    expect(reconcileStart(null, read(null, "NONE"))).toEqual({ kind: "unconfirmed" });
  });

  test("any other status: a new id with an unknown status → startUnconfirmed", () => {
    expect(reconcileStart(P, read(Q, "PAUSED"))).toEqual({ kind: "unconfirmed" });
    expect(reconcileStart(null, read(Q, ""))).toEqual({ kind: "unconfirmed" });
  });

  test("read 403 → accessEnded; read 404 → hidden; read FAILED (or any other failure) → startUnconfirmed", () => {
    expect(reconcileStart(P, readFailed("ACCESS_DENIED"))).toEqual({ kind: "accessEnded" });
    expect(reconcileStart(P, readFailed("NOT_FOUND"))).toEqual({ kind: "hidden" });
    expect(reconcileStart(P, readFailed("FAILED"))).toEqual({ kind: "unconfirmed" });
    expect(reconcileStart(P, readFailed("INTERNAL_ERROR"))).toEqual({ kind: "unconfirmed" });
  });
});

test.describe("the pre-flight read (a start pressed while the mark is set)", () => {
  test("knownId = F, pre-flight read {Q, READY} → adopt, no POST", () => {
    expect(preflightStart(F, read(Q, "READY"))).toEqual({ kind: "adopt" });
  });

  for (const status of ["RUNNING", "READY", "FAILED", "EXPIRED"]) {
    test(`pre-flight: adoptable ${status} with an id ≠ prevId → adopt, no POST`, () => {
      expect(preflightStart(P, read(Q, status))).toEqual({ kind: "adopt" });
    });
  }

  test("pre-flight read 403 → accessEnded, no POST; 404 → hidden, no POST", () => {
    expect(preflightStart(P, readFailed("ACCESS_DENIED"))).toEqual({ kind: "accessEnded" });
    expect(preflightStart(P, readFailed("NOT_FOUND"))).toEqual({ kind: "hidden" });
  });

  test("pre-flight: id = prevId, NONE, CANCELLED, an unknown status, or the read failed → start as usual", () => {
    expect(preflightStart(F, read(F, "FAILED"))).toEqual({ kind: "start" }); // S8(e): {F, FAILED} is not adoptable
    expect(preflightStart(F, read(F, "EXPIRED"))).toEqual({ kind: "start" });
    expect(preflightStart(P, read(null, "NONE"))).toEqual({ kind: "start" });
    expect(preflightStart(P, read(X, "CANCELLED"))).toEqual({ kind: "start" });
    expect(preflightStart(P, read(Q, "PAUSED"))).toEqual({ kind: "start" });
    expect(preflightStart(P, readFailed("FAILED"))).toEqual({ kind: "start" });
  });
});

test.describe("knownId: set by initial / adopt / poll / 202; unchanged by view switches", () => {
  const cases: [string, string | null, KnownIdEvent, string | null][] = [
    ["initial RUNNING", null, { kind: "initial", proposal: { proposalId: P } }, P],
    ["initial CANCELLED (every status)", null, { kind: "initial", proposal: { proposalId: X } }, X],
    ["initial NONE", null, { kind: "initial", proposal: { proposalId: null } }, null],
    ["initial read failed", null, { kind: "initial", proposal: null }, null],
    ["adopt", P, { kind: "adopt", proposal: { proposalId: Q } }, Q],
    ["adopt NONE (Show what's saved after a Keep)", P, { kind: "adopt", proposal: { proposalId: null } }, null],
    ["poll tick", P, { kind: "poll", proposal: { proposalId: Q } }, Q],
    ["poll NONE sets it to null", P, { kind: "poll", proposal: { proposalId: null } }, null],
    ["a 202's proposalId", F, { kind: "started", proposalId: Q }, Q],
    ["a view switch", F, { kind: "view" }, F],
  ];
  for (const [name, from, event, to] of cases) {
    test(name, () => {
      expect(nextKnownId(from, event)).toBe(to);
    });
  }

  test("brief → idle → brief → update → brief never resets it", () => {
    let k: string | null = F;
    for (let i = 0; i < 4; i++) k = nextKnownId(k, { kind: "view" });
    expect(k).toBe(F);
  });
});

test.describe("the pre-flight mark", () => {
  const run = (events: MarkEvent[], from = false) => events.reduce(nextMark, from);

  test("set when startUnconfirmed shows", () => {
    expect(run(["unconfirmed"])).toBe(true);
  });
  test("survives brief → idle → brief", () => {
    expect(run(["unconfirmed", "view", "view"])).toBe(true);
  });
  test("survives a discard", () => {
    expect(run(["unconfirmed", "discard"])).toBe(true);
  });
  test("cleared by an adopt (any source, the poll included)", () => {
    expect(run(["unconfirmed", "adopt"])).toBe(false);
  });
  test("cleared by a pre-flight that ran", () => {
    expect(run(["unconfirmed", "preflightRan"])).toBe(false);
  });
  test("cleared on unmount", () => {
    expect(run(["unconfirmed", "unmount"])).toBe(false);
  });
  test("a pre-flight that ran and then reconciled to unconfirmed again sets it again", () => {
    expect(run(["unconfirmed", "preflightRan", "unconfirmed"])).toBe(true);
  });
});

test.describe("the copy row (EV-186 copy table, routineAi.startUnconfirmed)", () => {
  test("EN and FR byte for byte; U+00A0 before « : »; never « Rien n'a été modifié » / Nothing was changed", () => {
    expect(en.routineAi.startUnconfirmed).toBe(
      "We couldn't confirm whether this suggestion was started. Try again: if it's already being prepared, it will show here."
    );
    expect(fr.routineAi.startUnconfirmed).toBe(
      "Impossible de confirmer si cette suggestion a été lancée. Réessayez : si elle est déjà en préparation, elle s'affichera."
    );
    expect(en.routineAi.startUnconfirmed).not.toContain("Nothing was changed");
    expect(fr.routineAi.startUnconfirmed).not.toContain("Rien n'a été modifié");
  });
});
