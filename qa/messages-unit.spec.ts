import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import {
  ACTIVE_WINDOW_MS,
  POLL_ACTIVE_MS,
  POLL_IDLE_MS,
  asThread,
  codePointCount,
  draftProblem,
  mergeMessages,
  messagesPath,
  normaliseNewlines,
  pollPeriod,
  sendOutcome,
  threadOutcome,
} from "../src/lib/messages";

/**
 * EV-095b — `src/lib/messages.ts`, in node: no server, no browser (like intake-consent-unit).
 * The cadence numbers are the story's (AC-B3), written here as literals.
 */

const msg = (seq: number, author: "COACH" | "TRAINEE" = "TRAINEE") => ({
  id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
  seq,
  author,
  body: `m${seq}`,
  sentAt: "2026-10-20T08:00:00Z",
});

test.describe("AC-B3 the cadence", () => {
  test("15 s idle, 5 s for the 60 s after a send, then 15 s again", () => {
    expect([POLL_IDLE_MS, POLL_ACTIVE_MS, ACTIVE_WINDOW_MS]).toEqual([15_000, 5_000, 60_000]);
    const sent = 1_000_000;
    expect(pollPeriod(sent - 1, null)).toBe(15_000);
    expect(pollPeriod(sent, sent)).toBe(5_000);
    expect(pollPeriod(sent + 59_999, sent)).toBe(5_000);
    expect(pollPeriod(sent + 60_000, sent)).toBe(15_000);
  });
});

test.describe("the body the api takes", () => {
  test("\\r\\n and a lone \\r become \\n before sending (the api refuses \\r)", () => {
    expect(normaliseNewlines("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
    expect(normaliseNewlines("a\r\n")).toBe("a\n");
    expect(draftProblem(normaliseNewlines("one\r\ntwo"))).toBeNull();
    // A \r the composer did NOT normalise is a control character the api refuses.
    expect(draftProblem("one\rtwo")).toBe("invisible");
  });

  test("1..4000 code points after trim: an emoji is one; blank-looking text is empty", () => {
    expect(codePointCount("💪")).toBe(1);
    expect(draftProblem("")).toBe("empty");
    expect(draftProblem(" \n\t ")).toBe("empty");
    expect(draftProblem("\u00a0\u200b\ufeff")).toBe("empty");
    expect(draftProblem("💪".repeat(4000))).toBeNull();
    expect(draftProblem("💪".repeat(4001))).toBe("tooLong");
    expect(draftProblem(`  ${"a".repeat(4000)}  `)).toBeNull();
  });

  test("bidi controls, other controls and a lone surrogate are refused; \\n and \\t are not", () => {
    for (const cp of [0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
      expect(draftProblem(`abc ${String.fromCodePoint(cp)} def`), cp.toString(16)).toBe("invisible");
    }
    expect(draftProblem("a\u0000b")).toBe("invisible");
    expect(draftProblem("a\u007fb")).toBe("invisible");
    expect(draftProblem("a\u0085b")).toBe("invisible");
    expect(draftProblem("a\ud800b")).toBe("invisible");
    expect(draftProblem("a\tb\nc")).toBeNull();
    // Right-to-left TEXT is fine: only the invisible controls are refused.
    expect(draftProblem("שלום, see you Thursday")).toBeNull();
    expect(draftProblem("مرحبا 123")).toBeNull();
  });
});

test.describe("reading answers", () => {
  const thread = { threadState: "ACTIVE", canSend: true, lastSeq: 2, unread: 1, hasOlder: false, hasMore: false, messages: [msg(1), msg(2)] };

  test("a thread is re-built field by field; a bad message is dropped, a bad view is a failure", () => {
    expect(asThread({ ...thread, extra: "x" })).toEqual(thread);
    expect(asThread({ ...thread, messages: [msg(1), { ...msg(2), author: "ADMIN" }] })?.messages).toEqual([msg(1)]);
    expect(asThread({ ...thread, unread: -1 })).toBeNull();
    expect(asThread({ ...thread, messages: null })).toBeNull();
    expect(threadOutcome(200, "basic", thread)).toEqual({ kind: "thread", thread });
    expect(threadOutcome(200, "basic", { nope: 1 })).toEqual({ kind: "failed" });
    expect(threadOutcome(0, "opaqueredirect", null)).toEqual({ kind: "signedOut" });
    expect(threadOutcome(401, "basic", null)).toEqual({ kind: "signedOut" });
    expect(threadOutcome(403, "basic", null)).toEqual({ kind: "denied" });
    expect(threadOutcome(502, "basic", null)).toEqual({ kind: "failed" });
  });

  test("a send: only a 2xx with a message is sent; 429 carries Retry-After", () => {
    expect(sendOutcome(201, "basic", { message: msg(3, "COACH"), lastSeq: 3 })).toEqual({ kind: "sent", message: msg(3, "COACH"), lastSeq: 3 });
    expect(sendOutcome(201, "basic", { lastSeq: 3 })).toEqual({ kind: "failed" });
    expect(sendOutcome(429, "basic", { code: "MESSAGE_RATE_LIMIT", retryAfterSeconds: 900 })).toEqual({ kind: "rateLimited", retryAfterSeconds: 900 });
    expect(sendOutcome(429, "basic", { code: "MESSAGE_RATE_LIMIT", retryAfterSeconds: null })).toEqual({ kind: "rateLimited", retryAfterSeconds: null });
    expect(sendOutcome(409, "basic", { code: "MESSAGE_ID_REUSED" })).toEqual({ kind: "idReused" });
    expect(sendOutcome(400, "basic", { code: "VALIDATION_ERROR" })).toEqual({ kind: "refused" });
    expect(sendOutcome(401, "basic", { code: "SESSION_CHANGED" })).toEqual({ kind: "sessionChanged" });
    expect(sendOutcome(401, "basic", { code: "SESSION_EXPIRED" })).toEqual({ kind: "signedOut" });
    expect(sendOutcome(403, "basic", { code: "COACH_ACCESS_DENIED" })).toEqual({ kind: "denied" });
    expect(sendOutcome(403, "basic", { code: "CROSS_ORIGIN" })).toEqual({ kind: "failed" });
    expect(sendOutcome(502, "basic", { code: "UPSTREAM" })).toEqual({ kind: "failed" });
  });

  test("merge by seq, ascending, a copy dropped", () => {
    expect(mergeMessages([msg(1), msg(3)], [msg(3), msg(2), msg(4)]).map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    const held = [msg(1)];
    expect(mergeMessages(held, [])).toBe(held);
  });

  test("the BFF paths carry the id as the only subject", () => {
    expect(messagesPath("a b")).toBe("/api/bff/clients/a%20b/messages");
    expect(messagesPath("x", { after: 7 })).toBe("/api/bff/clients/x/messages?after=7");
    expect(messagesPath("x", { before: 3 })).toBe("/api/bff/clients/x/messages?before=3");
  });
});
