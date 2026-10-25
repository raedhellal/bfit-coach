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
 */
import type { HeldThread } from "./messages";

const HELD_MAX = 20;
const held = new Map<string, HeldThread>();

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
}
