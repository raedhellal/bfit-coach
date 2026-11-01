import type { CoachNotification, NotificationPage } from "./coachApi";
import type { Copy } from "./copy";
import { formatShortDate } from "./format";
import { intlLocale, type Locale } from "./i18n/locale";
import { fullNameOf } from "./traineeName";

/**
 * EV-455f — the coach's bell and inbox: what an item says, where it opens, and how a BFF answer
 * is read. Pure, and safe in a client island (no `server-only` import): the bell, the inbox and
 * `qa/notifications-unit.spec.ts` read the same table.
 *
 * TYPES SHOWN. The coach rows of the EV-455 catalogue only. Any other type (a trainee's
 * `COACH_*` row, or a type a later api adds before this portal knows it) is NOT shown and is not
 * counted in anything the portal calls "shown" (story edge case): the portal has no text for it,
 * and a line it cannot word would be a guess. The BADGE still says what the api counts (the
 * api's `unread-count` counts every unread item): the bell never subtracts what it cannot show.
 *
 * X1: the line is built from `type` and `actor.displayName` only (the api sends no text), so it
 * can carry nothing but the catalogue sentence.
 */

export const COACH_NOTIFICATION_TYPES = [
  "CLIENT_MESSAGE",
  "CLIENT_JOINED",
  "CLIENT_SESSION_COMPLETED",
  "CLIENT_RED_FLAG",
] as const;

export type CoachNotificationType = (typeof COACH_NOTIFICATION_TYPES)[number];

export type ShownNotification = CoachNotification & { type: CoachNotificationType };

export function isShown(item: CoachNotification): item is ShownNotification {
  return (COACH_NOTIFICATION_TYPES as readonly string[]).includes(item.type);
}

/** The catalogue sentence (story « Copy », the catalogue's coach rows), the client as the roster names them. */
export function itemText(item: ShownNotification, copy: Pick<Copy, "notifications" | "challenges">): string {
  const client = fullNameOf(item.actor?.displayName, copy);
  return copy.notifications.item[item.type](client);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where an item opens (the catalogue's « Opens » column, AC-4): the message thread for
 * `CLIENT_MESSAGE`, the client's overview for the other three. An ended link is not this
 * module's question: `/clients/{id}`'s layout sends a 403 to `/clients/denied` (X6, AC-6).
 * An item whose link id is missing or is not a UUID opens the inbox itself rather than a
 * guessed URL (`null`: the row is drawn without a link target).
 */
export function targetOf(item: ShownNotification): string | null {
  const id = item.target?.coachClientId;
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const client = `/clients/${encodeURIComponent(id)}`;
  return item.type === "CLIENT_MESSAGE" ? `${client}/messages` : client;
}

/** The badge's text: none at 0 (no badge), `1`…`9`, then `9+` (story In scope 2). */
export function badgeText(count: number): string | null {
  if (!Number.isInteger(count) || count <= 0) return null;
  return count > 9 ? "9+" : String(count);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * « il y a 5 minutes » / "5 minutes ago" up to a week, then the date (`formatShortDate`). A time
 * ahead of the browser's clock reads as "now", never as a negative age. `now` is the moment the
 * page was read, so the times move on each read, never on a timer.
 */
export function relativeTime(iso: string, now: number, locale: Locale): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const age = Math.max(0, now - at);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  if (age < MINUTE) return rtf.format(0, "second");
  if (age < HOUR) return rtf.format(-Math.floor(age / MINUTE), "minute");
  if (age < DAY) return rtf.format(-Math.floor(age / HOUR), "hour");
  if (age < 7 * DAY) return rtf.format(-Math.floor(age / DAY), "day");
  return formatShortDate(iso, locale);
}

/* ── reading the BFF's answers (a body that is not the contract is a FAILED read) ─────────── */

/** What a count read gave. `failed` is never drawn as 0 (AC-9): the bell shows no badge. */
export type CountOutcome = { kind: "count"; count: number } | { kind: "signedOut" } | { kind: "failed" };

/** What a page read gave. */
export type PageOutcome = { kind: "page"; page: NotificationPage } | { kind: "signedOut" } | { kind: "failed" };

/**
 * The middleware answers a session it cannot continue with a 307 to /login, which a
 * `redirect: "manual"` fetch sees as an opaque redirect; a handler's own 401 is the same fact.
 * Both are the existing sign-in redirect (story edge case), as `threadOutcome` reads them.
 */
function signedOut(status: number, type: string): boolean {
  return type === "opaqueredirect" || (status >= 300 && status < 400) || status === 401;
}

export function countOutcome(status: number, type: string, body: unknown): CountOutcome {
  if (signedOut(status, type)) return { kind: "signedOut" };
  if (status !== 200) return { kind: "failed" };
  const count = body && typeof body === "object" ? (body as Record<string, unknown>).count : undefined;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return { kind: "failed" };
  return { kind: "count", count };
}

function asItem(raw: unknown): CoachNotification | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.type !== "string" || typeof r.createdAt !== "string") return null;
  if (r.readAt !== null && typeof r.readAt !== "string") return null;
  const actor = r.actor && typeof r.actor === "object" ? (r.actor as Record<string, unknown>) : {};
  const target = r.target && typeof r.target === "object" ? (r.target as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    id: r.id,
    type: r.type,
    createdAt: r.createdAt,
    readAt: r.readAt as string | null,
    count: typeof r.count === "number" && r.count >= 1 ? r.count : 1,
    actor: { displayName: str(actor.displayName) },
    target: { coachClientId: str(target.coachClientId), planId: str(target.planId), weekStart: str(target.weekStart) },
  };
}

/** A page rebuilt field by field: an item that is not an item is dropped, a body that is not a page fails. */
export function asNotificationPage(body: unknown): NotificationPage | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.items)) return null;
  const items = b.items.map(asItem).filter((i): i is CoachNotification => i !== null);
  const nextCursor = typeof b.nextCursor === "string" && b.nextCursor ? b.nextCursor : null;
  return { items, nextCursor };
}

export function pageOutcome(status: number, type: string, body: unknown): PageOutcome {
  if (signedOut(status, type)) return { kind: "signedOut" };
  if (status !== 200) return { kind: "failed" };
  const page = asNotificationPage(body);
  return page ? { kind: "page", page } : { kind: "failed" };
}

/**
 * The shown list from the pages read so far, newest first as the api orders them, each id once.
 * A collapsed item (X3) moves up when a new event joins it, so between two reads it can be on a
 * later page too; the first (newest) copy wins.
 */
export function shownItems(pages: readonly NotificationPage[]): ShownNotification[] {
  const seen = new Set<string>();
  const out: ShownNotification[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (isShown(item)) out.push(item);
    }
  }
  return out;
}

/* ── the BFF paths (one place, for the islands and the specs' request counters) ──────────── */

export const NOTIFICATIONS_BFF = "/api/bff/notifications";
export const UNREAD_COUNT_BFF = `${NOTIFICATIONS_BFF}/unread-count`;
export const READ_ALL_BFF = `${NOTIFICATIONS_BFF}/read-all`;
export const readOneBff = (id: string) => `${NOTIFICATIONS_BFF}/${encodeURIComponent(id)}/read`;
export const pageBff = (cursor: string | null) =>
  cursor ? `${NOTIFICATIONS_BFF}?cursor=${encodeURIComponent(cursor)}` : NOTIFICATIONS_BFF;

/** The bell's poll (story In scope 5, as EV-095b): every 60 s, only while the tab is visible. */
export const UNREAD_POLL_MS = 60_000;

/* ── marks in flight, and the last count read (module state: one per document) ───────────── */

/**
 * The inbox's item clicks post `…/{id}/read` and let the link navigate without waiting, so the
 * answer can land after the shell that sent it has unmounted. Every count read and every inbox
 * first read waits for these first (`marksSettled`): the new page's bell never reads a count from
 * before the mark (staff S1). Module state lives as long as the document, and a session boundary
 * is a document load (ADR-0033 D33.7), so nothing crosses accounts.
 */
const pendingMarks = new Set<Promise<unknown>>();

export function trackMark<T>(mark: Promise<T>): Promise<T> {
  const held = mark.finally(() => pendingMarks.delete(held));
  pendingMarks.add(held);
  return held;
}

/** Resolves once every mark tracked so far has settled (whatever its answer). */
export async function marksSettled(): Promise<void> {
  if (pendingMarks.size > 0) await Promise.allSettled([...pendingMarks]);
}

/**
 * The last count this document READ (or that a mark it made moved), so a new page's bell starts
 * from it instead of drawing nothing until its own read: the previous real read, never a guessed
 * 0. A failed read clears it, so after a failure the next page starts unknown, as AC-9 requires.
 */
let lastKnown: number | null = null;

export function lastKnownCount(): number | null {
  return lastKnown;
}

export function rememberCount(count: number | null): void {
  lastKnown = count;
}
