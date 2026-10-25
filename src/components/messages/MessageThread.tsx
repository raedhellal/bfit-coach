"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/kit";
import type { CoachClientMessage, CoachClientThread } from "@/lib/coachApi";
import { retryMinutes } from "@/lib/addClient";
import { SESSION_SUBJECT_HEADER } from "@/lib/autosaveTransport";
import { useCopy } from "@/lib/i18n/client";
import { heldThread, heldThreadSlot, isReplayedRead, noteMountedRead, type ThreadIsland } from "@/lib/heldThreads";
import { MessageTime } from "./MessageTime";
import {
  MAX_PAGES_PER_POLL,
  POLL_ACTIVE_MS,
  codePointCount,
  draftProblem,
  heldAfterMark,
  heldAfterSend,
  javaStrip,
  mergeMessages,
  messagesPath,
  messagesReadPath,
  normaliseNewlines,
  pollPeriod,
  sameMessage,
  seedThread,
  sendFailure,
  sendOutcome,
  threadOutcome,
  type HeldSend,
  type HeldThread,
  type SendFailure,
  type SendOutcome,
  type ThreadOutcome,
} from "@/lib/messages";

/**
 * EV-095b — the thread and its composer, the « Messages » tab's island.
 *
 * THE POLL (AC-B3, ADR-0038 D38.1). `GET /api/bff/clients/{id}/messages?after={cursor}`:
 *   · every 15 s while `document.visibilityState === "visible"`; every 5 s for the 60 s after
 *     the coach's own 2xx send (`pollPeriod`); never two at once, never faster than 5 s;
 *   · none while hidden; one at once on becoming visible again, then the cadence; one at once on a
 *     return through the router cache (BUG-942, THE RETURN READ), then the cadence;
 *   · none after the page is left (the effect's cleanup aborts the read in flight and clears the
 *     timer), after a 403 (the link ended: `router.refresh()` to the layout's denial page), or
 *     after the middleware's 307 (the session ended: the page is reloaded, which lands on /login).
 * The precedent is `src/components/client/IntakeConsentCard.tsx`'s poll (EV-341w W3).
 *
 * THE CURSOR. A poll asks for `seq > cursor`, and the api's pages are contiguous, so `cursor` only
 * moves to the last seq of a page READ, or to a sent message's seq when that seq is exactly
 * `cursor + 1`. A send answered with seq k + 2 (the client wrote k + 1 meanwhile) leaves the cursor
 * at k, so the next poll reads k + 1 and k + 2, and nothing is skipped; the merge drops the copy.
 *
 * THE SEND (AC-B5). The composer clears ONLY on a 2xx. On any failure the text stays, with
 * « Réessayer » in place of « Envoyer », and one sentence saying what happened (a 429 has its own,
 * with the api's Retry-After). `clientMessageId` is generated once per TEXT and reused on every
 * retry of that same text, so a send whose answer was lost and is retried is the api's 200 replay,
 * never a second message (AC-A5); a changed text gets a new id, and so does the retry after a
 * 409 MESSAGE_ID_REUSED. `\r\n` and a lone `\r` are sent as `\n` (the api refuses `\r`). The text
 * is otherwise sent as typed: the api trims it and is the one judge (a 400 is a sentence here).
 * Each send names the page's account (`x-evoli-session-subject`): a send under another account's
 * cookies is refused by the route before the api (ADR-0033 D33.14 point 4).
 *
 * MARK READ (AC-B4's other half). When a read shows `unread > 0` and the page is visible, the
 * island posts `{ seq: lastSeq }` once, so the roster's dot is gone on its next load. Never while
 * hidden: a coach who has not looked has not read.
 *
 * BODIES are drawn with bidi isolation (`dir="auto"` + `unicode-bidi: plaintext`, `.msg-body`):
 * a right-to-left message cannot reorder the author or the time beside it, and each of its lines
 * takes its own direction. No read receipt and no "delivered" is drawn (D38.1).
 *
 * BACK TO THE TAB (BUG-938). The island is left and remounted on every tab change, and a return
 * inside `staleTimes.dynamic` (30 s, next.config.mjs) is drawn from the client router cache with no
 * render: `initial` is then the FIRST visit's read, without the coach's send or what the poll read
 * since, and the first poll is 15 s away. So the island keeps what it held when it unmounted
 * (`src/lib/heldThreads.ts`, per account and client), and its first state is that joined with the
 * page's read (`seedThread`), with the time of the coach's last send, so AC-B3's 5 s period after
 * a send holds across the return. The held list adds no request (no `router.refresh()`; the one
 * read a replayed mount makes is BUG-942's, below). It is
 * the tab's memory only: a reload, a session boundary (a document load, ADR-0033 D33.7) or another
 * account's page starts from the page's read alone. Nothing is written to it on the server (an
 * effect's cleanup never runs there), so the server render and hydration read `initial` as before.
 *
 * THE RETURN READ (BUG-942). A router-cache return renders nothing on the server, so the layout's
 * 403 decision (BUG-671) is not made again either: a link that ended while the coach was on another
 * tab went unnoticed until the first poll, 15 s later (5 s in a send window), with the old thread
 * and an editable composer on screen. So a mount that is a REPLAY (`isReplayedRead`: the same page
 * read object as an earlier mount) reads the thread once at once, `?after=cursor`, as a poll tick:
 * a 403 is the denial page after its round trip and the refresh's, new messages come with it, and the cadence runs
 * from it (AC-B3: 5 s after it inside a send window, else 15 s). It is ADR-0038 D38.1's "visible
 * again means one immediate fetch", applied to coming back to the page; it costs one BFF GET of an
 * usually empty page, where the return without the router cache is a server render of three api
 * reads. A fresh render (a new object: the server read the thread with the link checked) adds no
 * request. No mark-read is added: `marked` is carried, so only a read showing new unread messages
 * marks them, as any poll does.
 *
 * LEFT WITH A REQUEST OUT (BUG-943). A send or a mark-read still out when the island unmounts
 * answers after `leave` kept the list, so its answer used to land in a component that was gone.
 * Now the island keeps what is out too (`outbox`: the send's id and text; `marking`: the seq), and
 * an answer that arrives after the unmount goes through the slot (`slot.settled`): folded into the
 * kept entry (`heldAfterSend` / `heldAfterMark`) and handed to the island mounted for the thread by
 * then (`adopt`). So the return shows the coach's message in its first frame, or its failure with
 * the text and « Réessayer » (the same id: AC-B7, a replay, never a second message); a send still
 * out shows as sending, read-only, until its answer, which then lands as on the page; AC-B3's 5 s
 * period runs from the late send; and a mark-read out (or answered) is not posted again. A late
 * 403 forgets the entry and ends the mounted island too (`slot.endedLate`). Nothing is written
 * across accounts, clients or a session boundary (`heldThreadSlot`).
 */

type Failure = SendFailure;

/** A failure the same text can be retried after (the others need the text changed). */
function retryable(f: Failure | null): boolean {
  return !!f && (f.kind === "sendFailed" || f.kind === "idReused" || f.kind === "rateLimited");
}

/** A v4 UUID. `crypto.randomUUID` exists only in a secure context; `getRandomValues` everywhere. */
function newMessageId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The last seq of a page (ascending), or undefined for an empty one. */
function lastSeqOf(list: readonly CoachClientMessage[]): number | undefined {
  return list.length > 0 ? list[list.length - 1].seq : undefined;
}

const visible = () => document.visibilityState === "visible";

async function readThread(clientId: string, cursor: { after: number } | { before: number } | undefined, signal?: AbortSignal): Promise<ThreadOutcome> {
  try {
    const res = await fetch(messagesPath(clientId, cursor), {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
      headers: { Accept: "application/json" },
      signal,
    });
    const body: unknown = res.status === 200 ? await res.json().catch(() => null) : null;
    return threadOutcome(res.status, res.type, body);
  } catch {
    return { kind: "failed" };
  }
}

export function MessageThread({
  clientId,
  sessionSubject,
  firstName,
  initial,
}: {
  clientId: string;
  /** `sessionSubjectTag()` of the account the page was rendered for. */
  sessionSubject: string;
  /** `firstName(traineeDisplayName, locale)`, computed by the page. */
  firstName: string;
  /** The page's read of the latest page, or null when it failed (not a 403: the page handles that). */
  initial: CoachClientThread | null;
}) {
  const copy = useCopy();
  const c = copy.messages;
  const router = useRouter();
  const composerId = useId();
  const failureId = useId();

  // BUG-938: read once, on the first render (see BACK TO THE TAB).
  const [{ seed, replayed, held }] = useState(() => {
    const held = heldThread(sessionSubject, clientId);
    return { seed: seedThread(initial, held), replayed: isReplayedRead(initial, held), held };
  });
  /** BUG-943: the send the island was left with, still out or failed after it. */
  const carried = held?.outbox ?? null;
  /** BUG-938 / BUG-942: this island's entry in the held-thread store. */
  const [slot] = useState(() => heldThreadSlot(sessionSubject, clientId));
  const [messages, setMessages] = useState<CoachClientMessage[]>(() => seed?.messages ?? []);
  const [loaded, setLoaded] = useState(seed !== null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [hasOlder, setHasOlder] = useState(seed?.hasOlder ?? false);
  const [older, setOlder] = useState<"idle" | "loading" | "failed">("idle");
  const [draft, setDraft] = useState(carried?.body ?? "");
  const [sending, setSending] = useState(carried !== null && carried.failure === null);
  const [failure, setFailure] = useState<Failure | null>(carried?.failure ?? null);

  /** The poll's cursor (see THE CURSOR); null until a read has succeeded. */
  const cursor = useRef<number | null>(seed ? seed.cursor : null);
  /** When the coach's last 2xx send landed (AC-B3's 60 s), or null. Kept across a return (BUG-938). */
  const lastSendAt = useRef<number | null>(seed?.lastSendAt ?? null);
  /**
   * BUG-938: the list as the island holds it, moved in the SAME statement as the cursor, so the
   * entry kept on unmount never says "covered up to `cursor`" while missing what moved it (a
   * state update not yet rendered). `messages` is its rendered copy. Likewise `hasOlder`.
   */
  const list = useRef<CoachClientMessage[]>(seed?.messages ?? []);
  const olderExists = useRef(seed?.hasOlder ?? false);
  /** The id bound to the text last attempted, reused on a retry of the same text (AC-A5). */
  const pending = useRef<{ id: string; body: string } | null>(carried ? { id: carried.id, body: carried.body } : null);
  /** BUG-943: the send out now (kept on unmount), and whether it is an earlier mount's. */
  const outbox = useRef<HeldSend | null>(carried && carried.failure === null ? carried : null);
  const inheritedSend = useRef(outbox.current !== null);
  /** Mark read: the highest seq the api has acknowledged, and the seq of a post out (or null). */
  const marked = useRef(seed?.marked ?? held?.marked ?? 0);
  const marking = useRef<number | null>(held?.marking ?? null);
  /** BUG-943: the mark-read out is an earlier mount's: its answer comes through `adopt`. */
  const inheritedMark = useRef(marking.current !== null);
  /** BUG-943: false once unmounted, so a late answer goes to the slot, not to this gone island. */
  const alive = useRef(false);
  /** Set by the poll effect: re-time the next poll to 5 s from now (after a send). */
  const hurry = useRef<() => void>(() => undefined);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToEnd = useRef(true);

  function linkEnded() {
    // BUG-942 / N1: forgets the held entry now, so a 403 after the unmount drops it too.
    slot.linkEnded();
    router.refresh();
  }
  const linkEndedRef = useRef(linkEnded);
  linkEndedRef.current = linkEnded;

  function markRead(lastSeq: number, unread: number) {
    if (unread <= 0 || lastSeq <= marked.current || marking.current !== null || !visible()) return;
    marking.current = lastSeq;
    const settle = (status: number | null) => {
      if (!alive.current) {
        // BUG-943: answered after the unmount: into what the island kept, and the island mounted now.
        if (status === 403) {
          if (!slot.endedLate()) router.refresh();
          return;
        }
        return slot.settled((entry) => heldAfterMark(entry, lastSeq, status === 204));
      }
      if (marking.current === lastSeq) marking.current = null;
      if (status === 204) marked.current = Math.max(marked.current, lastSeq);
      else if (status === 403) linkEndedRef.current();
      // Anything else: the next read still says `unread > 0`, and marks again.
    };
    void fetch(messagesReadPath(clientId), {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
      headers: { "Content-Type": "application/json", Accept: "application/json", [SESSION_SUBJECT_HEADER]: sessionSubject },
      body: JSON.stringify({ seq: lastSeq }),
    }).then(
      (res) => settle(res.status),
      () => settle(null)
    );
  }
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  /** One page read by a poll: held, the cursor moved, the thread marked read if visible. */
  function applyPage(thread: CoachClientThread) {
    list.current = mergeMessages(list.current, thread.messages);
    setMessages(list.current);
    const last = lastSeqOf(thread.messages);
    if (cursor.current === null) {
      // The first good read after a failed page read was the latest page, like the page's own.
      cursor.current = last ?? thread.lastSeq;
      olderExists.current = thread.hasOlder;
      setHasOlder(thread.hasOlder);
    } else if (last !== undefined) {
      cursor.current = Math.max(cursor.current, last);
    }
    setLoaded(true);
    setRefreshFailed(false);
    markReadRef.current(thread.lastSeq, thread.unread);
  }
  const applyPageRef = useRef(applyPage);
  applyPageRef.current = applyPage;

  /**
   * BUG-943: the kept entry changed under this island: a send or a mark-read of an earlier mount
   * answered. Joined with what it holds; an inherited send or mark-read that settled ends here.
   */
  function adopt(entry: HeldThread) {
    if (cursor.current !== null && entry.cursor !== null) {
      // The entry is this island's seed plus the late answer: the join covers both cursors.
      list.current = mergeMessages(list.current, entry.messages);
      setMessages(list.current);
      cursor.current = Math.max(cursor.current, entry.cursor);
    }
    marked.current = Math.max(marked.current, entry.marked);
    if (inheritedMark.current && (entry.marking ?? null) !== marking.current) {
      inheritedMark.current = false;
      marking.current = null;
    }
    if (entry.lastSendAt !== null && (lastSendAt.current === null || entry.lastSendAt > lastSendAt.current)) {
      lastSendAt.current = entry.lastSendAt;
      hurry.current(); // AC-B3: 5 s from the send (a no-op before the poll effect has run)
    }
    if (inheritedSend.current) {
      const out = entry.outbox ?? null;
      if (out === null || out.failure !== null) {
        inheritedSend.current = false;
        outbox.current = null;
        setSending(false);
        if (out === null) {
          // Sent: as on the page, the composer clears and the list stays at its end.
          pending.current = null;
          setDraft("");
          setFailure(null);
          stickToEnd.current = true;
        } else {
          pending.current = { id: out.id, body: out.body };
          setFailure(out.failure);
        }
      }
    }
  }
  const adoptRef = useRef(adopt);
  adoptRef.current = adopt;

  // BUG-938: what this island holds, kept when it is left; nothing after a 403 (the entry goes).
  // BUG-943: with what it has out (a send, a mark-read), whose answer then goes to the slot.
  useEffect(
    () => () =>
      slot.leave({
        messages: list.current,
        cursor: cursor.current,
        hasOlder: olderExists.current,
        marked: marked.current,
        lastSendAt: lastSendAt.current,
        marking: marking.current,
        outbox: outbox.current,
      }),
    [slot]
  );
  // BUG-943: mounted for this thread, so an earlier mount's late answer reaches it. Declared before
  // the poll so a late send folded since the first render is adopted before the poll is timed.
  useEffect(() => {
    alive.current = true;
    const island: ThreadIsland = { adopt: (entry) => adoptRef.current(entry), linkEnded: () => linkEndedRef.current() };
    const detach = slot.attach(island);
    const now = heldThread(sessionSubject, clientId);
    if (now !== undefined && now !== held) adoptRef.current(now);
    return () => {
      alive.current = false;
      detach();
    };
  }, [slot, sessionSubject, clientId, held]);
  // BUG-942: the page read it was mounted with is noted, so a router-cache remount knows it is one.
  useEffect(() => noteMountedRead(initial), [initial]);

  // The page's own read showed unread messages: mark them, if the coach is looking. Once, for
  // the page's read (held in a ref, so it is not a dependency); every later read marks from
  // `applyPage`, and a page that loaded hidden marks on its first read after becoming visible.
  const initialRead = useRef(initial);
  useEffect(() => {
    const first = initialRead.current;
    if (first) markReadRef.current(first.lastSeq, first.unread);
  }, []);

  // AC-B3: the poll.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight: AbortController | null = null;
    let startedAt = Date.now();

    function schedule(delay: number) {
      clearTimeout(timer);
      timer = undefined;
      if (stopped || !visible()) return;
      timer = setTimeout(tick, Math.max(0, delay));
    }

    async function tick() {
      timer = undefined;
      if (stopped) return;
      startedAt = Date.now();
      inFlight = new AbortController();
      let outcome: ThreadOutcome = { kind: "failed" };
      for (let pages = 0; pages < MAX_PAGES_PER_POLL; pages++) {
        const at = cursor.current;
        outcome = await readThread(clientId, at === null ? undefined : { after: at }, inFlight.signal);
        if (stopped) return;
        if (outcome.kind !== "thread") break;
        applyPageRef.current(outcome.thread);
        // `hasMore`: the rest of the backlog now, in the same turn (a paging of one read, not a poll).
        if (!outcome.thread.hasMore || at === null) break;
      }
      inFlight = null;
      if (stopped) return;
      switch (outcome.kind) {
        case "denied":
          stopped = true;
          return linkEndedRef.current();
        case "signedOut":
          stopped = true;
          window.location.reload();
          return;
        case "failed":
          // What is shown stays; the next turn reads again. A page that never loaded keeps its notice.
          if (cursor.current !== null) setRefreshFailed(true);
          break;
        case "thread":
          break;
      }
      schedule(pollPeriod(Date.now(), lastSendAt.current) - (Date.now() - startedAt));
    }

    function onVisibility() {
      if (stopped) return;
      if (!visible()) {
        clearTimeout(timer);
        timer = undefined;
        return;
      }
      // Back in view: one read now, unless one is out or already timed.
      if (inFlight === null && timer === undefined) void tick();
    }

    hurry.current = () => {
      if (stopped || inFlight !== null) return; // the read out will time the next one itself
      schedule(POLL_ACTIVE_MS);
    };

    // BUG-942: a router-cache replay reads at once (THE RETURN READ). A 0 ms timer, not a call, so
    // React's dev double effect cancels the first before it leaves: one read, not two.
    schedule(replayed ? 0 : pollPeriod(Date.now(), lastSendAt.current));
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      inFlight?.abort();
      hurry.current = () => undefined;
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clientId, replayed]);

  // Keep the newest message in view when the coach was already at the end (or just sent).
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && stickToEnd.current) log.scrollTop = log.scrollHeight;
  }, [messages]);

  function onScroll() {
    const log = logRef.current;
    if (log) stickToEnd.current = log.scrollHeight - log.scrollTop - log.clientHeight < 48;
  }

  async function showOlder() {
    const first = messages[0]?.seq;
    if (older === "loading" || first === undefined) return;
    setOlder("loading");
    const outcome = await readThread(clientId, { before: first });
    if (outcome.kind === "thread") {
      stickToEnd.current = false;
      list.current = mergeMessages(list.current, outcome.thread.messages);
      setMessages(list.current);
      olderExists.current = outcome.thread.hasOlder;
      setHasOlder(outcome.thread.hasOlder);
      setOlder("idle");
      return;
    }
    if (outcome.kind === "denied") return linkEndedRef.current();
    if (outcome.kind === "signedOut") return window.location.reload();
    setOlder("failed");
  }

  async function send() {
    if (sending) return;
    const body = normaliseNewlines(draft);
    const problem = draftProblem(body);
    if (problem === "empty") return;
    if (problem === "tooLong") return setFailure({ kind: "tooLong", count: codePointCount(javaStrip(body)) });
    if (problem === "invisible") return setFailure({ kind: "invisible" });

    // AC-B7: the same message is the same text after the api's own `String.strip()`, so a retry
    // that only adds or drops spaces / line breaks at the ends keeps the id (a replay, not a 409).
    const id = pending.current && sameMessage(pending.current.body, body) ? pending.current.id : newMessageId();
    pending.current = { id, body };
    outbox.current = { id, body, failure: null };
    setSending(true);
    let outcome: SendOutcome;
    try {
      const res = await fetch(messagesPath(clientId), {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "manual",
        headers: { "Content-Type": "application/json", Accept: "application/json", [SESSION_SUBJECT_HEADER]: sessionSubject },
        body: JSON.stringify({ clientMessageId: id, body }),
      });
      const parsed: unknown = await res.json().catch(() => null);
      outcome = sendOutcome(res.status, res.type, parsed);
    } catch {
      outcome = { kind: "failed" };
    }
    if (!alive.current) return sendSettledLate({ id, body }, outcome);
    outbox.current = null;
    setSending(false);

    switch (outcome.kind) {
      case "sent": {
        const { message } = outcome;
        pending.current = null;
        setDraft("");
        setFailure(null);
        stickToEnd.current = true;
        list.current = mergeMessages(list.current, [message]);
        setMessages(list.current);
        if (cursor.current !== null && message.seq === cursor.current + 1) cursor.current = message.seq;
        lastSendAt.current = Date.now();
        hurry.current();
        // The button turns disabled with the empty composer: keep the focus where the next message goes.
        inputRef.current?.focus();
        return;
      }
      case "denied":
        return linkEndedRef.current();
      case "signedOut":
        window.location.reload();
        return;
      case "idReused":
        // The id met another text: the retry is a new message, with a new id.
        pending.current = { id: newMessageId(), body };
        return setFailure(sendFailure(outcome));
      default:
        // 429, 400, 401 SESSION_CHANGED, or a failure (the answer may have been lost after the api
        // stored it: the retry keeps the id, a replay).
        return setFailure(sendFailure(outcome));
    }
  }

  /** BUG-943: a send answered after this island unmounted (see LEFT WITH A REQUEST OUT). */
  function sendSettledLate(sent: { id: string; body: string }, outcome: SendOutcome) {
    if (outcome.kind === "denied") {
      if (!slot.endedLate()) router.refresh();
      return;
    }
    if (outcome.kind === "signedOut") {
      window.location.reload();
      return;
    }
    slot.settled((entry) => heldAfterSend(entry, sent, outcome, Date.now(), newMessageId()));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter is a new line; Ctrl+Enter / ⌘+Enter sends.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void send();
    }
  }

  function onChange(next: string) {
    setDraft(next);
    // A failure about the text itself is over once the text changes; a retryable one stays
    // until the next attempt (AC-B5: the text and « Réessayer » stay together).
    if (failure && !retryable(failure)) setFailure(null);
  }

  const failureText = !failure
    ? null
    : failure.kind === "rateLimited"
      ? failure.retryAfterSeconds
        ? c.rateLimited(retryMinutes(failure.retryAfterSeconds))
        : c.rateLimitedNoTime
      : failure.kind === "tooLong"
        ? c.tooLong(failure.count)
        : c[failure.kind];
  const canRetry = retryable(failure) && pending.current !== null && sameMessage(pending.current.body, normaliseNewlines(draft));
  const empty = draftProblem(normaliseNewlines(draft)) === "empty";

  return (
    <section className="msg" data-messages-state={loaded ? "ready" : "loadError"}>
      {!loaded && (
        <p className="ov-note" role="alert" data-messages-notice="loadError">
          {c.loadError}
        </p>
      )}
      {loaded && refreshFailed && (
        <p className="ov-note msg-refresh-failed" role="status" data-messages-notice="refreshFailed">
          {c.refreshFailed}
        </p>
      )}

      <div
        ref={logRef}
        className="msg-log"
        role="log"
        id={`${composerId}-log`}
        aria-label={c.threadLabel(firstName)}
        onScroll={onScroll}
        tabIndex={0}
      >
        {loaded && hasOlder && (
          <div className="msg-older">
            <Button variant="secondary" size="sm" onClick={showOlder} disabled={older === "loading"}>
              {c.older}
            </Button>
            {older === "failed" && (
              <p className="ov-note" role="alert">
                {c.olderFailed}
              </p>
            )}
          </div>
        )}
        {loaded && messages.length === 0 && (
          <p className="ov-note msg-empty" data-messages-empty="">
            {c.empty(firstName)}
          </p>
        )}
        {messages.length > 0 && (
          <ol className="msg-list">
            {messages.map((m) => (
              <li key={m.seq} className="msg-item" data-message-seq={m.seq} data-author={m.author}>
                <p className="msg-meta">
                  <span className="msg-author">{m.author === "COACH" ? c.you : firstName}</span>
                  {/* BUG-934: the coach's own zone, filled in by the browser. */}
                  <MessageTime iso={m.sentAt} />
                </p>
                <p className="msg-body" dir="auto">
                  {m.body}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <form className="msg-composer" onSubmit={onSubmit} data-composer-state={sending ? "sending" : failure ? "failed" : "idle"}>
        <label className="intake-label" htmlFor={composerId}>
          {c.composerLabel(firstName)}
        </label>
        {/* No `maxLength`: it counts UTF-16 units, not the api's code points. */}
        <textarea
          id={composerId}
          ref={inputRef}
          className="intake-textarea msg-input"
          value={draft}
          rows={3}
          dir="auto"
          readOnly={sending}
          aria-describedby={failureText ? failureId : undefined}
          aria-invalid={failure?.kind === "tooLong" || failure?.kind === "invisible" ? true : undefined}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {failureText && (
          <p id={failureId} className="intake-error msg-failure" role="alert" data-messages-failure={failure!.kind}>
            {failureText}
          </p>
        )}
        <div className="msg-actions">
          {/* Not disabled while sending (a focused button that turns disabled drops the focus);
              `send()` ignores a second press instead. */}
          <Button type="submit" disabled={empty && !sending}>
            {sending ? c.sending : canRetry ? c.retry : c.send}
          </Button>
        </div>
      </form>
    </section>
  );
}
