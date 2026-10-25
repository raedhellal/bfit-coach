import { expect } from "@playwright/test";
import { test } from "./fixture-test";
import {
  ACTIVE_WINDOW_MS,
  POLL_ACTIVE_MS,
  POLL_IDLE_MS,
  asThread,
  codePointCount,
  draftProblem,
  heldAfterMark,
  heldAfterSend,
  javaStrip,
  sameMessage,
  mergeMessages,
  messagesPath,
  normaliseNewlines,
  pollPeriod,
  seedThread,
  sendFailure,
  sendOutcome,
  threadOutcome,
  type HeldThread,
} from "../src/lib/messages";
import {
  clearHeldThreads,
  forgetThread,
  heldThread,
  heldThreadSlot,
  isReplayedRead,
  keepThread,
  noteMountedRead,
} from "../src/lib/heldThreads";

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

test.describe("AC-B7 javaStrip = Java String.strip() (Character.isWhitespace)", () => {
  test("strips what Java strips: C0 whitespace, U+001C..U+001F, Zs other than the no-break spaces, Zl, Zp", () => {
    for (const cp of [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x1c, 0x1d, 0x1e, 0x1f, 0x20, 0x1680, 0x2000, 0x2006, 0x2008, 0x200a, 0x2028, 0x2029, 0x205f, 0x3000]) {
      const w = String.fromCodePoint(cp);
      expect(javaStrip(`${w}a b${w}`), cp.toString(16)).toBe("a b");
    }
  });

  test("keeps what Java keeps and JS trim() drops: U+00A0, U+2007, U+202F, U+FEFF; and U+0085, U+200B", () => {
    for (const cp of [0x00a0, 0x2007, 0x202f, 0xfeff, 0x0085, 0x200b]) {
      const w = String.fromCodePoint(cp);
      expect(javaStrip(`${w}a${w}`), cp.toString(16)).toBe(`${w}a${w}`);
    }
    // ...and it is not javaTrim (String.trim()): U+3000 goes, U+00A0 inside the ends stops it.
    expect(javaStrip("\u3000 x \u00a0 ")).toBe("x \u00a0");
    expect(javaStrip(" \n\t ")).toBe("");
    expect(javaStrip("💪 ")).toBe("💪");
  });

  test("sameMessage: equal after the strip, and only then", () => {
    expect(sameMessage("See you at 6.", "See you at 6. \n")).toBe(true);
    expect(sameMessage("  See you at 6.", "See you at 6.\t")).toBe(true);
    expect(sameMessage("See you at 6.", "See you at 6.\u00a0")).toBe(false);
    expect(sameMessage("See you at 6.", "\ufeffSee you at 6.")).toBe(false);
    expect(sameMessage("See you at 6.", "See you at 7.")).toBe(false);
  });

  test("draftProblem counts what the api counts: a no-break space at the end is a character", () => {
    expect(draftProblem(`${"a".repeat(4000)}\u00a0`)).toBe("tooLong");
    expect(draftProblem(`${"a".repeat(4000)}\u3000\n`)).toBeNull();
    // U+001C..U+001F at the ends are Java whitespace: stripped, so not a refused control.
    expect(draftProblem("hi\u001f")).toBeNull();
  });
});

test.describe("BUG-938 seedThread: the page's read joined with what the island held", () => {
  const thread = (messages: ReturnType<typeof msg>[], extra: { lastSeq?: number; hasOlder?: boolean } = {}) => ({
    threadState: "ACTIVE" as const,
    canSend: true,
    lastSeq: extra.lastSeq ?? messages[messages.length - 1]?.seq ?? 0,
    unread: 0,
    hasOlder: extra.hasOlder ?? false,
    hasMore: false,
    messages,
  });
  const seqsOf = (t: { messages: { seq: number }[] } | null) => t?.messages.map((m) => m.seq);

  test("nothing held: the page's read, its cursor, nothing marked", () => {
    const s = seedThread(thread([msg(1), msg(2)]), undefined);
    expect(seqsOf(s)).toEqual([1, 2]);
    expect(s).toMatchObject({ cursor: 2, hasOlder: false, marked: 0, lastSendAt: null });
    expect(seedThread(thread([], { lastSeq: 0 }), undefined)).toMatchObject({ messages: [], cursor: 0 });
  });

  test("a router-cache return: the page's read is older than what was held — the held list wins", () => {
    const held = { messages: [msg(1), msg(2, "COACH"), msg(3)], cursor: 3, hasOlder: false, marked: 3, lastSendAt: null };
    const s = seedThread(thread([msg(1)]), held);
    expect(seqsOf(s)).toEqual([1, 2, 3]);
    expect(s).toMatchObject({ cursor: 3, marked: 3, lastSendAt: null });
  });

  test("a fresh render newer than what was held: joined, the newer cursor", () => {
    const held = { messages: [msg(1), msg(2)], cursor: 2, hasOlder: false, marked: 1, lastSendAt: null };
    const s = seedThread(thread([msg(1), msg(2), msg(3), msg(4)]), held);
    expect(seqsOf(s)).toEqual([1, 2, 3, 4]);
    expect(s).toMatchObject({ cursor: 4, marked: 1, lastSendAt: null });
  });

  test("a sent message past a gap stays held, and the cursor does not skip the gap", () => {
    // The send was answered with seq 3 while the cursor was 1: seq 2 is for the next poll to read.
    const held = { messages: [msg(1), msg(3, "COACH")], cursor: 1, hasOlder: false, marked: 0, lastSendAt: null };
    const s = seedThread(thread([msg(1)]), held);
    expect(seqsOf(s)).toEqual([1, 3]);
    expect(s?.cursor).toBe(1);
  });

  test("older pages the coach loaded are kept, with the held list's hasOlder", () => {
    const held = { messages: [msg(10), msg(11), msg(60)], cursor: 60, hasOlder: false, marked: 0, lastSendAt: null };
    const s = seedThread(thread([msg(11), msg(60)], { hasOlder: true }), held);
    expect(seqsOf(s)).toEqual([10, 11, 60]);
    expect(s?.hasOlder).toBe(false);
    // The page's read reaches further back: its own flag.
    const t = seedThread(thread([msg(5), msg(60)], { hasOlder: true }), held);
    expect(t?.hasOlder).toBe(true);
  });

  test("a page that starts after held cursor + 1 would leave a gap: the page's read alone", () => {
    const held = { messages: [msg(1), msg(2)], cursor: 2, hasOlder: false, marked: 2, lastSendAt: null };
    const s = seedThread(thread([msg(4), msg(5)], { hasOlder: true }), held);
    expect(seqsOf(s)).toEqual([4, 5]);
    expect(s).toMatchObject({ cursor: 5, hasOlder: true, marked: 2, lastSendAt: null });
  });

  test("the page's read failed: null (its load notice), whatever was held", () => {
    expect(seedThread(null, { messages: [msg(1)], cursor: 1, hasOlder: false, marked: 1, lastSendAt: null })).toBeNull();
  });

  test("a held island that never read (cursor null): the page's read", () => {
    const s = seedThread(thread([msg(1)]), { messages: [], cursor: null, hasOlder: false, marked: 0, lastSendAt: null });
    expect(seqsOf(s)).toEqual([1]);
    expect(s?.cursor).toBe(1);
  });

  test("the coach's last send time is carried over, in the joined and in the page-only branch (AC-B3)", () => {
    const at = 1_700_000_000_000;
    const joined = seedThread(thread([msg(1)]), { messages: [msg(1), msg(2, "COACH")], cursor: 2, hasOlder: false, marked: 1, lastSendAt: at });
    expect(joined?.lastSendAt).toBe(at);
    const gap = seedThread(thread([msg(5)], { hasOlder: true }), { messages: [msg(1)], cursor: 1, hasOlder: false, marked: 1, lastSendAt: at });
    expect(seqsOf(gap)).toEqual([5]);
    expect(gap?.lastSendAt).toBe(at);
    expect(seedThread(thread([msg(1)]), undefined)?.lastSendAt).toBeNull();
  });
});

test.describe("BUG-938 heldThreads: per account and client, forgotten on a 403, cleared at a boundary", () => {
  const entry = (seq: number) => ({ messages: [msg(seq)], cursor: seq, hasOlder: false, marked: 0, lastSendAt: null });

  test("kept per account + client; a 403's forget drops only that entry; a boundary drops all", () => {
    clearHeldThreads();
    keepThread("coachA", "c1", entry(1));
    keepThread("coachB", "c1", entry(2));
    keepThread("coachA", "c2", entry(3));
    expect(heldThread("coachA", "c1")?.cursor).toBe(1);
    expect(heldThread("coachB", "c1")?.cursor).toBe(2);
    forgetThread("coachA", "c1");
    expect(heldThread("coachA", "c1")).toBeUndefined();
    expect(heldThread("coachA", "c2")?.cursor).toBe(3);
    clearHeldThreads();
    expect(heldThread("coachA", "c2")).toBeUndefined();
    expect(heldThread("coachB", "c1")).toBeUndefined();
  });

  test("the last 20 threads, the oldest kept dropped first (a re-kept one is newest)", () => {
    clearHeldThreads();
    for (let i = 0; i < 20; i++) keepThread("a", `c${i}`, entry(i));
    keepThread("a", "c0", entry(100));
    keepThread("a", "c20", entry(20));
    expect(heldThread("a", "c0")?.cursor).toBe(100);
    expect(heldThread("a", "c1")).toBeUndefined();
    expect(heldThread("a", "c20")?.cursor).toBe(20);
    clearHeldThreads();
  });
});

test.describe("BUG-942 the island's slot: a late 403 drops what the unmount kept; a replay is known", () => {
  const entry = (seq: number) => ({ messages: [msg(seq)], cursor: seq, hasOlder: false, marked: seq, lastSendAt: null });

  test("a 403 that resolves AFTER the unmount (staff N1): the held entry is gone", () => {
    clearHeldThreads();
    const slot = heldThreadSlot("coachA", "c1");
    keepThread("coachA", "c2", entry(9));
    slot.leave(entry(3)); // the coach leaves Messages: the island keeps its list
    expect(heldThread("coachA", "c1")?.cursor).toBe(3);
    slot.linkEnded(); // then the mark-read or the send still out answers 403
    expect(heldThread("coachA", "c1"), "the late 403 dropped the entry").toBeUndefined();
    expect(heldThread("coachA", "c2")?.cursor, "another client's entry stays").toBe(9);
    clearHeldThreads();
  });

  test("a 403 BEFORE the unmount: the unmount keeps nothing", () => {
    clearHeldThreads();
    keepThread("coachA", "c1", entry(1)); // from an earlier visit
    const slot = heldThreadSlot("coachA", "c1");
    slot.linkEnded();
    expect(heldThread("coachA", "c1")).toBeUndefined();
    slot.leave(entry(4));
    expect(heldThread("coachA", "c1"), "nothing kept after the link ended").toBeUndefined();
  });

  test("a mount with the same page-read object is a replay; a new object is a fresh render; a boundary forgets", () => {
    clearHeldThreads();
    const first = { messages: [msg(1)] };
    expect(isReplayedRead(first, undefined), "a first mount").toBe(false);
    noteMountedRead(first);
    expect(isReplayedRead(first, entry(1)), "the router cache's object again").toBe(true);
    expect(isReplayedRead({ messages: [msg(1)] }, entry(1)), "an equal but new object: a server render").toBe(false);
    // A failed page read has no identity: a replay exactly when something is held (a return).
    expect(isReplayedRead(null, undefined)).toBe(false);
    expect(isReplayedRead(null, entry(1))).toBe(true);
    noteMountedRead(null);
    clearHeldThreads();
    expect(isReplayedRead(first, undefined), "a session boundary forgets the reads").toBe(false);
  });
});

test.describe("BUG-943 a send or a mark-read answered after the island unmounted", () => {
  const ID = "11111111-1111-4111-8111-111111111111";
  const FRESH = "22222222-2222-4222-8222-222222222222";
  const out = { id: ID, body: "hi", failure: null };
  const left = (over: Partial<HeldThread> = {}): HeldThread => ({ messages: [msg(1)], cursor: 1, hasOlder: false, marked: 1, lastSendAt: null, outbox: out, ...over });
  const sent = (seq: number) => ({ kind: "sent" as const, message: msg(seq, "COACH"), lastSeq: seq });

  test("sent: the message joins, the cursor moves only to cursor + 1, AC-B3's send time is set, the outbox empties", () => {
    const a = heldAfterSend(left(), out, sent(2), 5_000, FRESH);
    expect(a).toMatchObject({ cursor: 2, lastSendAt: 5_000, outbox: null });
    expect(a.messages.map((m) => m.seq)).toEqual([1, 2]);
    // seq 3 answered while the client wrote 2: kept, but the cursor stays so the poll reads 2.
    const b = heldAfterSend(left(), out, sent(3), 5_000, FRESH);
    expect(b.cursor).toBe(1);
    expect(b.messages.map((m) => m.seq)).toEqual([1, 3]);
    // Already there (a read brought it): once.
    expect(heldAfterSend(left({ messages: [msg(1), msg(2, "COACH")], cursor: 2 }), out, sent(2), 1, FRESH).messages.map((m) => m.seq)).toEqual([1, 2]);
  });

  test("a failure keeps the text and the id (AC-B7); a 409 takes a new id; another send's outbox is left alone", () => {
    expect(heldAfterSend(left(), out, { kind: "failed" }, 1, FRESH).outbox).toEqual({ id: ID, body: "hi", failure: { kind: "sendFailed" } });
    expect(heldAfterSend(left(), out, { kind: "rateLimited", retryAfterSeconds: 60 }, 1, FRESH).outbox?.failure).toEqual({ kind: "rateLimited", retryAfterSeconds: 60 });
    expect(heldAfterSend(left(), out, { kind: "idReused" }, 1, FRESH).outbox).toEqual({ id: FRESH, body: "hi", failure: { kind: "idReused" } });
    const other = left({ outbox: { id: FRESH, body: "other", failure: null } });
    expect(heldAfterSend(other, out, { kind: "failed" }, 1, FRESH)).toBe(other);
    // denied / signedOut leave the page: not folded.
    expect(heldAfterSend(left(), out, { kind: "denied" }, 1, FRESH)).toEqual(left());
    expect(sendFailure({ kind: "refused" })).toEqual({ kind: "invisible" });
    expect(sendFailure({ kind: "sessionChanged" })).toEqual({ kind: "sessionChanged" });
    expect(sendFailure(sent(2))).toBeNull();
  });

  test("a mark-read: a 204 records its seq; any answer ends it being out", () => {
    expect(heldAfterMark(left({ marked: 0, marking: 3 }), 3, true)).toMatchObject({ marked: 3, marking: null });
    expect(heldAfterMark(left({ marked: 0, marking: 3 }), 3, false)).toMatchObject({ marked: 0, marking: null });
    expect(heldAfterMark(left({ marked: 5, marking: null }), 3, true)).toMatchObject({ marked: 5, marking: null });
  });

  test("the slot folds a late answer into its own entry only, and hands it to the island mounted for that thread", () => {
    clearHeldThreads();
    const gone = heldThreadSlot("coachA", "c1");
    keepThread("coachA", "c2", left({ cursor: 9 }));
    keepThread("coachB", "c1", left({ cursor: 7 }));
    gone.leave(left());
    const adopted: HeldThread[] = [];
    const back = heldThreadSlot("coachA", "c1");
    const detach = back.attach({ adopt: (e) => adopted.push(e), linkEnded: () => undefined });
    gone.settled((e) => heldAfterSend(e, out, sent(2), 5, FRESH));
    expect(heldThread("coachA", "c1")).toMatchObject({ cursor: 2, outbox: null, lastSendAt: 5 });
    expect(adopted, "the mounted island adopts the folded entry").toEqual([heldThread("coachA", "c1")]);
    expect(heldThread("coachA", "c2")?.cursor, "another client's entry is untouched").toBe(9);
    expect(heldThread("coachB", "c1")?.cursor, "another account's entry is untouched").toBe(7);
    detach();
    gone.settled((e) => heldAfterMark(e, 2, true));
    expect(adopted, "a detached island gets nothing").toHaveLength(1);
    expect(heldThread("coachA", "c1")?.marked).toBe(2);
    clearHeldThreads();
  });

  test("nothing late survives a session boundary, a forgotten entry or a late 403", () => {
    clearHeldThreads();
    const before = heldThreadSlot("coachA", "c1");
    before.leave(left());
    clearHeldThreads(); // sign-out / another account (ADR-0033 D33.7)
    before.settled((e) => heldAfterSend(e, out, sent(2), 5, FRESH));
    before.leave(left());
    expect(heldThread("coachA", "c1"), "a slot from before the boundary writes nothing").toBeUndefined();

    const slot = heldThreadSlot("coachA", "c1");
    slot.leave(left());
    let ended = 0;
    const back = heldThreadSlot("coachA", "c1");
    back.attach({ adopt: () => undefined, linkEnded: () => (ended += 1) });
    expect(slot.endedLate(), "the mounted island is told").toBe(true);
    expect(ended).toBe(1);
    expect(heldThread("coachA", "c1")).toBeUndefined();
    slot.settled((e) => heldAfterSend(e, out, sent(2), 5, FRESH));
    expect(heldThread("coachA", "c1"), "nothing written after the 403").toBeUndefined();
    clearHeldThreads();
    expect(heldThreadSlot("coachA", "c9").endedLate(), "no island mounted").toBe(false);
  });
});
