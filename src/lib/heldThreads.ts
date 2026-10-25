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
 */
import type { HeldThread } from "./messages";

const HELD_MAX = 20;
const held = new Map<string, HeldThread>();

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

/**
 * The island's slot in this store, for one account and client: what it leaves behind on unmount,
 * and nothing once the link ended (ADR-0033 D33.7). BUG-942 (staff's N1 on BUG-938): `linkEnded`
 * forgets the entry ITSELF, so a 403 that resolves after the island unmounted (a mark-read or a
 * send still out when the coach left) drops what the unmount kept, and a later `leave` keeps nothing.
 */
export function heldThreadSlot(sessionSubject: string, clientId: string): { leave(thread: HeldThread): void; linkEnded(): void } {
  let ended = false;
  return {
    leave(thread) {
      if (ended) forgetThread(sessionSubject, clientId);
      else keepThread(sessionSubject, clientId, thread);
    },
    linkEnded() {
      ended = true;
      forgetThread(sessionSubject, clientId);
    },
  };
}
