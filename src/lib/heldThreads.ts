/**
 * BUG-938 — what each « Messages » island held when the coach left it, in this tab's memory.
 *
 * `MessageThread` keeps its list here when it unmounts and joins it with the page's read when it
 * mounts again (`seedThread` in `./messages`), because a return inside `staleTimes.dynamic` is
 * drawn from the client router cache, whose read is the first visit's.
 *
 * One entry per account (`sessionSubjectTag`) and client, the last `HELD_MAX` threads, newest
 * last. Nothing here is ever written on the server: only an effect's cleanup writes, and effects
 * do not run there. A session boundary drops it (`clearClientSession`, ADR-0033 D33.7), and the
 * document load that follows discards the module anyway.
 *
 * BUG-942 — which page reads an island has already been mounted with (`mountedReads`), so a mount
 * can tell a router-cache replay (the SAME read object, from the cached payload: no server render,
 * so no layout 403 decision) from a fresh render (a new object, which the server read with the link
 * checked). A replay reads the thread at once (`MessageThread`'s return read): it is the only way
 * this tab can learn that the link ended while the coach was on another tab.
 *
 * BUG-943 — a send or a mark-read still out when the island unmounted answers AFTER `leave` kept
 * the list. Its answer is folded into the kept entry (`slot.settled`, with `heldAfterSend` /
 * `heldAfterMark` from `./messages`), and handed to the island mounted for that thread by then, if
 * one is (`slot.attach`): the return shows the message at once, or the failure, and posts no second
 * mark-read. A mount re-reads the entry when it attaches, so an answer folded between its first
 * render and its effects is not missed. Only the island's own slot writes, only into the entry of
 * its own account and client, and nothing from before a session boundary (`generation`).
 */
import type { HeldThread } from "./messages";

const HELD_MAX = 20;
const held = new Map<string, HeldThread>();

/** BUG-943: what an island mounted for a thread takes from a late answer of an earlier mount. */
export interface ThreadIsland {
  /** The kept entry changed under it (a late send or mark-read answer): join it with what it holds. */
  adopt(entry: HeldThread): void;
  /** A late 403: the link ended. */
  linkEnded(): void;
}
/** BUG-943: the island mounted for each thread, if any (one « Messages » page at a time). */
const live = new Map<string, ThreadIsland>();
/** BUG-943: bumped at a session boundary, so a slot from before it writes nothing after it. */
let generation = 0;

/** BUG-942: the page reads islands were mounted with (object identity; never on the server). */
let mountedReads = new WeakSet<object>();

const keyOf = (sessionSubject: string, clientId: string) => `${sessionSubject}\u0000${clientId}`;

export function heldThread(sessionSubject: string, clientId: string): HeldThread | undefined {
  return held.get(keyOf(sessionSubject, clientId));
}

export function keepThread(sessionSubject: string, clientId: string, thread: HeldThread): void {
  const key = keyOf(sessionSubject, clientId);
  held.delete(key);
  held.set(key, thread);
  while (held.size > HELD_MAX) held.delete(held.keys().next().value as string);
}

/** A 403 ended the link: the island keeps nothing for that client (ADR-0033 D33.7). */
export function forgetThread(sessionSubject: string, clientId: string): void {
  held.delete(keyOf(sessionSubject, clientId));
}

export function clearHeldThreads(): void {
  held.clear();
  live.clear();
  generation += 1;
  mountedReads = new WeakSet<object>();
}

/**
 * BUG-942 — is this mount drawn from the client router cache? `initial` is the page's read as the
 * island receives it. The router cache hands a remounted island the very object its first mount
 * got; a server render deserialises a new one. A failed page read (`null`) has no identity: it
 * counts as a replay when something is held for the thread (a return), so it reads at once too.
 * A payload the router cached but no island ever MOUNTED (an intent prefetch of the tab, say)
 * counts as fresh: its object is not in the set, so its first mount makes no return read. Its read
 * is at most `staleTimes` old and was made with the link checked; the poll covers the rest.
 */
export function isReplayedRead(initial: object | null, held: HeldThread | undefined): boolean {
  return initial !== null ? mountedReads.has(initial) : held !== undefined;
}

/** BUG-942 — note the read an island was mounted with (from an effect: never on the server). */
export function noteMountedRead(initial: object | null): void {
  if (initial !== null) mountedReads.add(initial);
}

/** The island's slot in this store, for one account and client (`heldThreadSlot`). */
export interface HeldThreadSlot {
  /** What the island holds as it unmounts; nothing once the link ended. */
  leave(thread: HeldThread): void;
  /** A 403 seen by the mounted island: the entry goes, and a later `leave` keeps nothing. */
  linkEnded(): void;
  /** BUG-943: the island is mounted; returns its detach (the unmount). */
  attach(island: ThreadIsland): () => void;
  /**
   * BUG-943: a request of this island answered after it unmounted: `update` folds the answer into
   * the kept entry, which the island mounted by then (if any) adopts. Nothing when there is no
   * entry (forgotten, evicted, or cleared at a session boundary) or the link ended.
   */
  settled(update: (entry: HeldThread) => HeldThread): void;
  /**
   * BUG-943: a 403 answered after the island unmounted. Forgets the entry, as `linkEnded`, and tells
   * the island mounted by then, if any (which then leaves nothing either). True when one was told.
   */
  endedLate(): boolean;
}

/**
 * The island's slot in this store, for one account and client: what it leaves behind on unmount,
 * and nothing once the link ended (ADR-0033 D33.7). BUG-942 (staff's N1 on BUG-938): `linkEnded`
 * forgets the entry ITSELF, so a 403 that resolves after the island unmounted (a mark-read or a
 * send still out when the coach left) drops what the unmount kept, and a later `leave` keeps nothing.
 */
export function heldThreadSlot(sessionSubject: string, clientId: string): HeldThreadSlot {
  const key = keyOf(sessionSubject, clientId);
  const born = generation;
  let ended = false;
  return {
    leave(thread) {
      // BUG-943: an island mounted before a session boundary keeps nothing after it.
      if (born !== generation) return;
      if (ended) forgetThread(sessionSubject, clientId);
      else keepThread(sessionSubject, clientId, thread);
    },
    linkEnded() {
      ended = true;
      forgetThread(sessionSubject, clientId);
    },
    attach(island) {
      if (born !== generation) return () => undefined;
      live.set(key, island);
      return () => {
        if (live.get(key) === island) live.delete(key);
      };
    },
    settled(update) {
      if (ended || born !== generation) return;
      const entry = held.get(key);
      if (!entry) return;
      const next = update(entry);
      if (next === entry) return;
      held.set(key, next);
      live.get(key)?.adopt(next);
    },
    endedLate() {
      ended = true;
      forgetThread(sessionSubject, clientId);
      const island = born === generation ? live.get(key) : undefined;
      island?.linkEnded();
      return island !== undefined;
    },
  };
}
