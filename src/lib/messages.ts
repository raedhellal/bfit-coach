/**
 * EV-095b — « Messages »: the thread island's vocabulary, client-safe and pure.
 *
 * No `server-only` import and no runtime `coachApi` import: the island (a client component)
 * reads these, and `qa/messages-unit.spec.ts` runs them in node with no server. The api's codes
 * are read in the BFF route handlers only (`src/app/api/bff/clients/[id]/messages/**`).
 *
 * The rules this module owns, each from EV-095 / ADR-0038:
 *   · the poll cadence (AC-B3, D38.1): every 15 s while the page is visible, every 5 s for the
 *     60 s after the coach's own send, never faster than 5 s, none while hidden;
 *   · the body the api will take (AC-A6, D38.3 as built): `\r\n` and a lone `\r` become `\n`
 *     BEFORE sending (the api refuses `\r`), 1..4000 code points after trim, no other control
 *     character than `\n` and `\t`, no bidi embedding / override / isolate control;
 *   · how a BFF answer is read (`threadOutcome`, `sendOutcome`).
 */
import type { CoachClientMessage, CoachClientThread, CoachMessageAuthor } from "./coachApi";

/** AC-B3: the idle period, visible. */
export const POLL_IDLE_MS = 15_000;
/** AC-B3: the period for `ACTIVE_WINDOW_MS` after the coach's own send; also the floor. */
export const POLL_ACTIVE_MS = 5_000;
/** AC-B3: how long after a send the 5 s period holds. */
export const ACTIVE_WINDOW_MS = 60_000;
/** AC-A6: the api's bound, in code points after trim. */
export const MESSAGE_MAX_CODE_POINTS = 4_000;
/** One poll follows `hasMore` this many pages at most, then waits for its next tick. */
export const MAX_PAGES_PER_POLL = 5;

/**
 * The delay before the next poll, from when the last one started. `lastSendAt` is the instant
 * of the coach's last 2xx send (null: none on this page). Never below `POLL_ACTIVE_MS`.
 */
export function pollPeriod(now: number, lastSendAt: number | null): number {
  if (lastSendAt !== null && now - lastSendAt < ACTIVE_WINDOW_MS) return POLL_ACTIVE_MS;
  return POLL_IDLE_MS;
}

/** `\r\n` and a lone `\r` → `\n`: the api refuses `\r` (a control character other than `\n`/`\t`). */
export function normaliseNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * Java `String.strip()` (AC-B7): drops leading and trailing code points for which
 * `Character.isWhitespace` holds, which is how the api stores a body and compares a replay
 * (`MessageBody.of`, api `0507b3be`). That is U+0009..U+000D, U+001C..U+001F, and the Zs / Zl / Zp
 * characters EXCEPT the no-break spaces U+00A0, U+2007, U+202F, which Java keeps.
 *
 * Not JS `trim()` (it also strips U+00A0, U+2007, U+202F and U+FEFF, all kept by Java, and keeps
 * U+001C..U+001F) and not `javaTrim` (`String.trim()`: code points <= U+0020 only).
 */
export function javaStrip(value: string): string {
  const chars = Array.from(value);
  let start = 0;
  let end = chars.length;
  while (start < end && isJavaWhitespace(chars[start])) start += 1;
  while (end > start && isJavaWhitespace(chars[end - 1])) end -= 1;
  return start === 0 && end === chars.length ? value : chars.slice(start, end).join("");
}

/** `Character.isWhitespace` for one code point (as a string of one code point). */
function isJavaWhitespace(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  if (c === 0x00a0 || c === 0x2007 || c === 0x202f) return false;
  return (c >= 0x09 && c <= 0x0d) || (c >= 0x1c && c <= 0x1f) || /^[\p{Zs}\u2028\u2029]$/u.test(ch);
}

/**
 * AC-B7: two newline-normalised drafts are the same message when the api would call them the
 * same (it compares stripped text with stripped text, D38.4 step 4): a retry of one keeps the
 * `clientMessageId`, and « Retry » stays offered.
 */
export function sameMessage(a: string, b: string): boolean {
  return javaStrip(a) === javaStrip(b);
}

/** Code points, as the api counts (an emoji is one). */
export function codePointCount(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

/**
 * The api's "only whitespace and invisible fillers counts as empty" (BUG-901), as its
 * `openapi.yaml` lists them: whitespace (NBSP included) and U+200B..U+200D, U+2060, U+FEFF,
 * U+3164, U+115F, U+1160, U+FFA0, U+2800, U+180E, U+034F, U+00AD.
 */
const FILLERS = /[\s\u00a0\u200b-\u200d\u2060\ufeff\u3164\u115f\u1160\uffa0\u2800\u180e\u034f\u00ad]/gu;

/** Control characters the api refuses: C0 except `\t` and `\n`, DEL, C1. (`\r` is normalised first.) */
const REFUSED_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u;
/** Bidi embedding, override and isolate controls (U+202A..U+202E, U+2066..U+2069): refused (staff N4). */
const REFUSED_BIDI = /[\u202a-\u202e\u2066-\u2069]/u;
/** An unpaired surrogate (BUG-902). */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

/** Why a draft cannot be sent, judged before any request; null = it can. */
export type DraftProblem = "empty" | "tooLong" | "invisible";

/**
 * The composer's own check of the text it would send (already newline-normalised). The api is
 * still the judge: a 400 from it is the same `invisible` sentence.
 */
export function draftProblem(normalised: string): DraftProblem | null {
  // The api's own strip (AC-B7), so the count and the checks see the text it would store.
  const trimmed = javaStrip(normalised);
  if (trimmed.replace(FILLERS, "") === "") return "empty";
  if (codePointCount(trimmed) > MESSAGE_MAX_CODE_POINTS) return "tooLong";
  if (REFUSED_CONTROL.test(trimmed) || REFUSED_BIDI.test(trimmed) || LONE_SURROGATE.test(trimmed)) {
    return "invisible";
  }
  return null;
}

/**
 * One message as the island holds it, re-built field by field from an answer. A message
 * without its five fields (or an author this build does not know) is dropped, never drawn.
 */
export function asMessage(value: unknown): CoachClientMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const author = r.author;
  if (
    typeof r.id !== "string" ||
    typeof r.seq !== "number" ||
    !Number.isInteger(r.seq) ||
    r.seq < 1 ||
    (author !== "COACH" && author !== "TRAINEE") ||
    typeof r.body !== "string" ||
    typeof r.sentAt !== "string"
  ) {
    return null;
  }
  return { id: r.id, seq: r.seq, author: author as CoachMessageAuthor, body: r.body, sentAt: r.sentAt };
}

const nonNegativeInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * A thread page, re-built field by field. Anything without the view's own fields is a failed
 * read (never a guess that the thread is empty). Used by the BFF route (on the api's answer)
 * AND by the island (on the route's answer), so neither trusts the other's shape.
 */
export function asThread(value: unknown): CoachClientThread | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const state = r.threadState;
  if (
    (state !== "ACTIVE" && state !== "ENDED" && state !== "NONE") ||
    typeof r.canSend !== "boolean" ||
    !nonNegativeInt(r.lastSeq) ||
    !nonNegativeInt(r.unread) ||
    typeof r.hasOlder !== "boolean" ||
    typeof r.hasMore !== "boolean" ||
    !Array.isArray(r.messages)
  ) {
    return null;
  }
  const messages = r.messages.map(asMessage).filter((m): m is CoachClientMessage => m !== null);
  return {
    threadState: state,
    canSend: r.canSend,
    lastSeq: r.lastSeq,
    unread: r.unread,
    hasOlder: r.hasOlder,
    hasMore: r.hasMore,
    messages,
  };
}

/** Two lists merged by `seq` (a later copy of a seq replaces nothing: messages are immutable). */
export function mergeMessages(held: readonly CoachClientMessage[], incoming: readonly CoachClientMessage[]): CoachClientMessage[] {
  if (incoming.length === 0) return held as CoachClientMessage[];
  const bySeq = new Map<number, CoachClientMessage>();
  for (const m of held) bySeq.set(m.seq, m);
  for (const m of incoming) if (!bySeq.has(m.seq)) bySeq.set(m.seq, m);
  return Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq);
}

/** The BFF paths. The subject is the URL segment, as on every api path. */
export function messagesPath(clientId: string, cursor?: { after: number } | { before: number }): string {
  const base = `/api/bff/clients/${encodeURIComponent(clientId)}/messages`;
  if (!cursor) return base;
  return "after" in cursor ? `${base}?after=${cursor.after}` : `${base}?before=${cursor.before}`;
}
export function messagesReadPath(clientId: string): string {
  return `/api/bff/clients/${encodeURIComponent(clientId)}/messages/read`;
}

/**
 * A read's outcome, as the island acts on it. `redirect: "manual"` makes the middleware's 307
 * to /login an `opaqueredirect` (status 0), read as signed out, as the intake card does.
 */
export type ThreadOutcome =
  | { kind: "thread"; thread: CoachClientThread }
  | { kind: "denied" }
  | { kind: "signedOut" }
  | { kind: "failed" };

export function threadOutcome(status: number, type: string, body: unknown): ThreadOutcome {
  if (type === "opaqueredirect" || (status >= 300 && status < 400) || status === 401) return { kind: "signedOut" };
  if (status === 403) return { kind: "denied" };
  if (status !== 200) return { kind: "failed" };
  const thread = asThread(body);
  return thread ? { kind: "thread", thread } : { kind: "failed" };
}

/** A send's outcome (AC-B5: only `sent` clears the composer). */
export type SendOutcome =
  | { kind: "sent"; message: CoachClientMessage; lastSeq: number }
  /** AC-B5 / AC-A6: 429 MESSAGE_RATE_LIMIT; `retryAfterSeconds` is the api's header, or null. */
  | { kind: "rateLimited"; retryAfterSeconds: number | null }
  /** 400: the api refused the text (a character it does not take). */
  | { kind: "refused" }
  /** 409 MESSAGE_ID_REUSED: the id met another text. The next try takes a new id. */
  | { kind: "idReused" }
  | { kind: "denied" }
  | { kind: "signedOut" }
  /** 401 SESSION_CHANGED: another account signed in in this browser. */
  | { kind: "sessionChanged" }
  | { kind: "failed" };

export function sendOutcome(status: number, type: string, body: unknown): SendOutcome {
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  if (type === "opaqueredirect" || (status >= 300 && status < 400)) return { kind: "signedOut" };
  if (status === 401) return record.code === "SESSION_CHANGED" ? { kind: "sessionChanged" } : { kind: "signedOut" };
  if (status === 403 && record.code === "COACH_ACCESS_DENIED") return { kind: "denied" };
  if (status === 429) {
    const s = record.retryAfterSeconds;
    return { kind: "rateLimited", retryAfterSeconds: typeof s === "number" && Number.isInteger(s) && s > 0 ? s : null };
  }
  if (status === 409 && record.code === "MESSAGE_ID_REUSED") return { kind: "idReused" };
  if (status === 400) return { kind: "refused" };
  if (status === 200 || status === 201) {
    const message = asMessage(record.message);
    if (message && nonNegativeInt(record.lastSeq)) return { kind: "sent", message, lastSeq: record.lastSeq };
  }
  return { kind: "failed" };
}
