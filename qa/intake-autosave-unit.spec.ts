import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import { AutosaveEngine, type AutosaveTimers, type SaveOutcome } from "../src/lib/autosave";
import { classifySave, intakeSectionPath } from "../src/lib/autosaveTransport";
import {
  firstUnanswered,
  formFromApi,
  sectionAnswered,
  sectionToApi,
  type IntakeFormValues,
} from "../src/lib/intakeForm";

/**
 * EV-341b B18 (EV-342o O.1, moved) — the autosave engine's own tests, in node, on a virtual
 * clock: a change saves once after 1.5 s idle; a blur saves at once; two changes during a save
 * make one more save, not two in parallel; a 409 stops the section and reports a conflict, and
 * nothing typed before it is ever re-sent (B5 / B5a, both branches); the failure path reports
 * B4's states, 4 attempts in all, and keeps the values. Plus the transport's answer table (B13a,
 * B14, B15) and the form helpers (B2, B6, B16).
 *
 * The browser half is `qa/intake-interview.spec.ts`.
 */

/** A virtual clock: timers fire only when `advance` passes their due time. */
class Clock implements AutosaveTimers {
  now = 0;
  private next = 1;
  private readonly due = new Map<number, { at: number; fn: () => void }>();
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.next++;
    this.due.set(id, { at: this.now + ms, fn });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.due.delete(handle as number);
  }
  /** Moves time forward, firing every timer that falls due, in order, letting promises settle between. */
  async advance(ms: number): Promise<void> {
    const end = this.now + ms;
    for (;;) {
      await settle();
      const ready = [...this.due.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!ready) break;
      this.due.delete(ready[0]);
      this.now = ready[1].at;
      ready[1].fn();
    }
    this.now = end;
    await settle();
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

type Key = "GOALS" | "HISTORY";
interface Sent {
  key: Key;
  version: number;
  payload: string;
  answer(outcome: SaveOutcome): void;
}

/** An engine whose every send waits for the test to answer it. */
function rig(versions: Record<Key, number> = { GOALS: 0, HISTORY: 0 }) {
  const clock = new Clock();
  const sent: Sent[] = [];
  const saved: { key: Key; payload: string; version: number }[] = [];
  let ended = 0;
  const engine = new AutosaveEngine<Key, string>(
    {
      timers: clock,
      send: (key, version, payload) =>
        new Promise<SaveOutcome>((resolve) => sent.push({ key, version, payload, answer: resolve })),
      onSaved: (key, payload, version) => saved.push({ key, payload, version }),
      onAccessEnded: () => {
        ended += 1;
      },
    },
    versions
  );
  return { clock, sent, saved, engine, ended: () => ended };
}

const ok = (version: number): SaveOutcome => ({ kind: "saved", version, updatedAt: "2026-10-15T10:00:00Z" });

test.describe("B18 — the autosave engine", () => {
  test("a change saves once, 1.5 s after the LAST change (not before)", async () => {
    const { clock, sent, engine } = rig();
    engine.change("GOALS", "a");
    await clock.advance(1_000);
    engine.change("GOALS", "ab");
    await clock.advance(1_499);
    expect(sent, "nothing before 1.5 s of idle").toHaveLength(0);
    expect(engine.snapshot().statuses.GOALS).toBe("pending");
    expect(engine.snapshot().dirty, "a waiting change is unsaved work (B7)").toBe(true);
    await clock.advance(1);
    expect(sent.map((s) => s.payload)).toEqual(["ab"]);
    expect(engine.snapshot().statuses.GOALS).toBe("saving");
    sent[0].answer(ok(1));
    await clock.advance(0);
    expect(engine.snapshot().statuses.GOALS).toBe("saved");
    expect(engine.snapshot().dirty).toBe(false);
    await clock.advance(10_000);
    expect(sent, "once").toHaveLength(1);
  });

  test("a blur saves at once", async () => {
    const { clock, sent, engine } = rig();
    engine.change("GOALS", "a");
    engine.flush("GOALS");
    expect(sent.map((s) => s.payload)).toEqual(["a"]);
    sent[0].answer(ok(1));
    await clock.advance(5_000);
    expect(sent).toHaveLength(1);
  });

  test("a blur with nothing waiting sends nothing", async () => {
    const { sent, engine } = rig();
    engine.flush("GOALS");
    expect(sent).toHaveLength(0);
  });

  test("two changes during a save make ONE more save, never two in parallel, with the newest values and version", async () => {
    const { clock, sent, engine } = rig();
    engine.change("GOALS", "a");
    engine.flush("GOALS");
    expect(sent).toHaveLength(1);
    engine.change("GOALS", "ab");
    engine.change("GOALS", "abc");
    await clock.advance(5_000);
    expect(sent, "the second save waits for the first").toHaveLength(1);
    expect(engine.snapshot().statuses.GOALS).toBe("saving");
    sent[0].answer(ok(1));
    await clock.advance(0);
    expect(sent.map((s) => [s.payload, s.version])).toEqual([
      ["a", 0],
      ["abc", 1],
    ]);
    sent[1].answer(ok(2));
    await clock.advance(5_000);
    expect(sent).toHaveLength(2);
    expect(engine.version("GOALS")).toBe(2);
  });

  test("a change whose idle time has not run out when the save lands waits for it", async () => {
    const { clock, sent, engine } = rig();
    engine.change("GOALS", "a");
    engine.flush("GOALS");
    engine.change("GOALS", "ab");
    sent[0].answer(ok(1));
    await clock.advance(1_000);
    expect(sent).toHaveLength(1);
    await clock.advance(500);
    expect(sent.map((s) => s.payload)).toEqual(["a", "ab"]);
  });

  test("two sections save at the same time (B3)", async () => {
    const { clock, sent, engine } = rig();
    engine.change("GOALS", "g");
    engine.change("HISTORY", "h");
    await clock.advance(1_500);
    expect(sent.map((s) => s.key).sort()).toEqual(["GOALS", "HISTORY"]);
  });

  test("B5 / B5a: a 409 stops the section, reports the conflict, and nothing typed before it is ever re-sent (the coach keeps the stored version)", async () => {
    const { clock, sent, engine } = rig({ GOALS: 3, HISTORY: 0 });
    engine.change("GOALS", "typed before");
    engine.flush("GOALS");
    engine.change("GOALS", "typed during the doomed save");
    sent[0].answer({ kind: "conflict", version: 4 });
    await clock.advance(0);
    expect(engine.snapshot().statuses.GOALS).toBe("conflict");
    expect(engine.snapshot().dirty, "the section's values are not stored").toBe(true);
    // Typing after the conflict queues nothing either.
    engine.change("GOALS", "typed after the conflict");
    engine.flush("GOALS");
    await clock.advance(60_000);
    expect(sent, "no PUT for the section until « Recharger »").toHaveLength(1);
    // The other section is not stopped.
    engine.change("HISTORY", "h");
    await clock.advance(1_500);
    expect(sent.map((s) => s.key)).toEqual(["GOALS", "HISTORY"]);
    sent[1].answer(ok(1));
    // « Recharger »: the stored version; still nothing sent until a change.
    engine.reload("GOALS", 4);
    await clock.advance(60_000);
    expect(sent).toHaveLength(2);
    expect(engine.snapshot().statuses.GOALS).toBe("idle");
    // The first save after it is built from what the form holds now: the stored values plus that change.
    engine.change("GOALS", "stored + one change");
    await clock.advance(1_500);
    expect(sent.map((s) => [s.key, s.payload, s.version])[2]).toEqual(["GOALS", "stored + one change", 4]);
  });

  test("B5a: after « Recharger » with no change at all, nothing is ever sent (no payload pending)", async () => {
    const { clock, sent, engine } = rig();
    engine.change("GOALS", "x");
    await clock.advance(1_500);
    sent[0].answer({ kind: "conflict", version: 7 });
    await clock.advance(0);
    engine.reload("GOALS", 7);
    engine.flush("GOALS");
    engine.retry();
    await clock.advance(120_000);
    expect(sent).toHaveLength(1);
    expect(engine.snapshot().dirty).toBe(false);
  });

  test("B4: a failure is retried 3 times (4 attempts) after 1, 2 and 4 s, « retrying » from the first failure, then « failed »; « Réessayer » starts again", async () => {
    const { clock, sent, engine } = rig();
    engine.change("GOALS", "values");
    await clock.advance(1_500);
    expect(sent).toHaveLength(1);
    sent[0].answer({ kind: "failed" });
    await clock.advance(0);
    expect(engine.snapshot().statuses.GOALS).toBe("retrying");
    await clock.advance(999);
    expect(sent).toHaveLength(1);
    await clock.advance(1);
    expect(sent).toHaveLength(2);
    sent[1].answer({ kind: "failed" });
    await clock.advance(2_000);
    expect(sent).toHaveLength(3);
    sent[2].answer({ kind: "failed" });
    await clock.advance(4_000);
    expect(sent).toHaveLength(4);
    expect(engine.snapshot().statuses.GOALS).toBe("retrying");
    sent[3].answer({ kind: "failed" });
    await clock.advance(60_000);
    expect(sent, "4 attempts in all").toHaveLength(4);
    expect(engine.snapshot().statuses.GOALS).toBe("failed");
    expect(engine.snapshot().dirty, "a failed save is unsaved work (B7)").toBe(true);
    expect(sent.every((s) => s.payload === "values"), "the values are the coach's, every time").toBe(true);
    engine.retry();
    expect(sent).toHaveLength(5);
    sent[4].answer(ok(1));
    await clock.advance(0);
    expect(engine.snapshot().statuses.GOALS).toBe("saved");
    expect(engine.snapshot().dirty).toBe(false);
  });

  test("B4: a 4xx is not retried (one request only)", async () => {
    const { clock, sent, engine } = rig();
    engine.change("GOALS", "v");
    await clock.advance(1_500);
    sent[0].answer({ kind: "invalid", field: "notes" });
    await clock.advance(60_000);
    expect(sent).toHaveLength(1);
    expect(engine.snapshot().statuses.GOALS).toBe("invalid");
    expect(engine.snapshot().dirty).toBe(true);
  });

  test("B14: a 403 ends access for every section, once; nothing is dirty and nothing more is sent", async () => {
    const { clock, sent, engine, ended } = rig();
    engine.change("GOALS", "g");
    engine.change("HISTORY", "h");
    engine.flush("GOALS");
    sent[0].answer({ kind: "denied" });
    await clock.advance(0);
    expect(ended()).toBe(1);
    expect(engine.snapshot().accessEnded).toBe(true);
    expect(engine.snapshot().dirty, "leaving the denied page asks nothing").toBe(false);
    engine.change("GOALS", "after");
    engine.retry();
    await clock.advance(60_000);
    expect(sent).toHaveLength(1);
    expect(ended()).toBe(1);
  });

  test("B15: a session end stops every section and keeps the work dirty; « Réessayer » sends each waiting section", async () => {
    const { clock, sent, engine } = rig();
    engine.change("GOALS", "g1");
    engine.flush("GOALS");
    engine.change("HISTORY", "h1");
    sent[0].answer({ kind: "signedOut" });
    await clock.advance(60_000);
    expect(sent, "HISTORY's waiting change is not sent into an ended session").toHaveLength(1);
    expect(engine.snapshot().signedOut).toBe(true);
    expect(engine.snapshot().dirty).toBe(true);
    expect(engine.snapshot().statuses).toEqual({ GOALS: "signedOut", HISTORY: "signedOut" });
    engine.change("GOALS", "g2");
    await clock.advance(60_000);
    expect(sent).toHaveLength(1);
    engine.retry();
    expect(sent.slice(1).map((s) => [s.key, s.payload]).sort()).toEqual([
      ["GOALS", "g2"],
      ["HISTORY", "h1"],
    ]);
    sent[1].answer(ok(1));
    sent[2].answer(ok(1));
    await clock.advance(0);
    expect(engine.snapshot().dirty).toBe(false);
  });

  test("B16: a blocked section sends nothing, drops what was waiting, and resumes on its next valid change", async () => {
    const { clock, sent, engine } = rig();
    engine.change("GOALS", "short");
    engine.block("GOALS");
    await clock.advance(60_000);
    expect(sent).toHaveLength(0);
    expect(engine.snapshot().statuses.GOALS).toBe("blocked");
    expect(engine.snapshot().dirty).toBe(true);
    engine.flush("GOALS");
    expect(sent).toHaveLength(0);
    engine.change("GOALS", "short again");
    await clock.advance(1_500);
    expect(sent.map((s) => s.payload)).toEqual(["short again"]);
  });

  test("onSaved names the payload the server now holds, at its version", async () => {
    const { clock, sent, saved, engine } = rig();
    engine.change("HISTORY", "h");
    await clock.advance(1_500);
    sent[0].answer(ok(5));
    await clock.advance(0);
    expect(saved).toEqual([{ key: "HISTORY", payload: "h", version: 5 }]);
  });
});

test.describe("the transport's answer table (B13a, B14, B15)", () => {
  test("only a 2xx carrying { version, updatedAt } is a save", () => {
    expect(classifySave(200, "basic", { version: 2, updatedAt: "t" })).toEqual({ kind: "saved", version: 2, updatedAt: "t" });
    for (const body of [null, {}, { version: 2 }, { updatedAt: "t" }, { version: "2", updatedAt: "t" }, { version: 0, updatedAt: "t" }, "<html>"]) {
      expect(classifySave(200, "basic", body), JSON.stringify(body)).toEqual({ kind: "signedOut" });
    }
    expect(classifySave(204, "basic", null), "a 204 is not a save (staff H3)").toEqual({ kind: "signedOut" });
  });

  test("a redirect or a 401 is the session ending; a 403 is access ending, unless it is the handler's CROSS_ORIGIN", () => {
    expect(classifySave(0, "opaqueredirect", null)).toEqual({ kind: "signedOut" });
    expect(classifySave(307, "basic", null)).toEqual({ kind: "signedOut" });
    expect(classifySave(401, "basic", { code: "SESSION_EXPIRED" })).toEqual({ kind: "signedOut" });
    expect(classifySave(403, "basic", { code: "COACH_ACCESS_DENIED" })).toEqual({ kind: "denied" });
    expect(classifySave(403, "basic", null)).toEqual({ kind: "denied" });
    expect(classifySave(403, "basic", { code: "CROSS_ORIGIN" })).toEqual({ kind: "invalid", field: null });
  });

  test("a 409 conflict, a 4xx refusal (not retried), and a 5xx or no answer (retried)", () => {
    expect(classifySave(409, "basic", { code: "INTAKE_VERSION_CONFLICT", version: 4 })).toEqual({ kind: "conflict", version: 4 });
    expect(classifySave(409, "basic", { code: "OTHER" })).toEqual({ kind: "invalid", field: null });
    expect(classifySave(400, "basic", { code: "INTAKE_FIELD_INVALID", field: "notes" })).toEqual({ kind: "invalid", field: "notes" });
    expect(classifySave(415, "basic", null)).toEqual({ kind: "invalid", field: null });
    for (const status of [500, 502, 503, 504]) expect(classifySave(status, "basic", null)).toEqual({ kind: "failed" });
    expect(classifySave(0, "error", null)).toEqual({ kind: "failed" });
  });

  test("the path is the portal's own route handler, never the api", () => {
    expect(intakeSectionPath("6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001", "GOALS")).toBe(
      "/api/clients/6f1b0f7e-1f2a-4c3d-9a11-0d5b7c9e0001/intake/GOALS"
    );
  });
});

test.describe("the form helpers (B2, B6, B16)", () => {
  const empty = formFromApi(null);

  test("a section PUT is the WHOLE section: every field, null or [] when unanswered, multi-choices in catalogue order", () => {
    const form: IntakeFormValues = { ...empty, "GOALS.motivations": ["ENERGY", "HEALTH"], "GOALS.motivationScore": "4" };
    expect(sectionToApi("GOALS", form)).toEqual({
      values: {
        primaryGoal: null,
        motivations: ["HEALTH", "ENERGY"],
        motivationScore: 4,
        eventLabel: null,
        eventDate: null,
        notes: null,
      },
      problems: [],
    });
  });

  test("B16: notes are counted in code points — 1,000 emoji is allowed, 1,001 is a problem", () => {
    const thousand = "\u{1F600}".repeat(1000);
    expect(thousand.length, "2,000 UTF-16 units").toBe(2000);
    expect(sectionToApi("LIFESTYLE", { ...empty, "LIFESTYLE.notes": thousand }).problems).toEqual([]);
    expect(sectionToApi("LIFESTYLE", { ...empty, "LIFESTYLE.notes": `${thousand}a` }).problems).toEqual([
      { field: "notes", kind: "tooLong", max: 1000 },
    ]);
  });

  test("a typed number outside its bounds, or unreadable, is a problem and is never sent clamped", () => {
    for (const typed of ["15", "-1", "1.5", "deux"]) {
      const out = sectionToApi("HISTORY", { ...empty, "HISTORY.currentSessionsPerWeek": typed });
      expect(out.problems, typed).toEqual([{ field: "currentSessionsPerWeek", kind: "range", min: 0, max: 14 }]);
      expect(out.values.currentSessionsPerWeek).toBeNull();
    }
    expect(sectionToApi("HISTORY", { ...empty, "HISTORY.currentSessionsPerWeek": "0" }).values.currentSessionsPerWeek).toBe(0);
  });

  test("B2 / B6: answered sections, and the first one with no answer", () => {
    const form = formFromApi({
      GOALS: { values: { primaryGoal: "LOSE_WEIGHT" } },
      HISTORY: { values: { activities: ["RUNNING"] } },
    });
    expect(sectionAnswered("GOALS", form)).toBe(true);
    expect(sectionAnswered("AVAILABILITY", form)).toBe(false);
    expect(firstUnanswered(form)).toBe("AVAILABILITY");
    expect(firstUnanswered(empty)).toBe("GOALS");
  });

  test("a stored value outside the vocabulary reads as unanswered, never as a crash", () => {
    const form = formFromApi({ GOALS: { values: { primaryGoal: "GET_FIT", motivations: ["HEALTH", "NOPE"], motivationScore: "4" } } });
    expect(form["GOALS.primaryGoal"]).toBe("");
    expect(form["GOALS.motivations"]).toEqual(["HEALTH"]);
    expect(form["GOALS.motivationScore"]).toBe("");
  });
});
