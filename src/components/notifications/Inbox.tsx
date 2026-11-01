"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/ui/Link";
import { Button } from "@/components/ui/kit";
import { SESSION_SUBJECT_HEADER } from "@/lib/autosaveTransport";
import type { NotificationPage } from "@/lib/coachApi";
import { useCopy, useLocale } from "@/lib/i18n/client";
import {
  itemText,
  pageBff,
  pageOutcome,
  READ_ALL_BFF,
  readOneBff,
  relativeTime,
  shownItems,
  targetOf,
  type PageOutcome,
  type ShownNotification,
} from "@/lib/notifications";
import { useNotifications } from "./NotificationsProvider";

/**
 * EV-455f — the inbox's island (story In scope 3 and 4, AC-3, AC-4, AC-7, AC-9, AC-10).
 *
 * STATES, none of them blank: the first read draws skeleton rows (`aria-busy`, a spoken
 * « Chargement… »); a failed first read draws « Impossible de charger les notifications. » and
 * « Réessayer », which reads again in place; no item at all draws « Aucune notification pour le
 * moment. »; a failed « Charger plus » keeps the rows and says the same sentence with its own
 * « Réessayer ».
 *
 * THE EMPTY STATE is "no item shown AND no page left": a page can hold only types the portal does
 * not show (story edge case), and the coach's items may then be on the next page, which is read
 * at once rather than drawn as empty (`settleShown`). It never reads the bell's count: a 0 there
 * proves nothing about the list, and a failed count proves less.
 *
 * OPENING AN ITEM (AC-4). Each item is a LINK to its target (`targetOf`). A click on an unread one
 * marks it read in the list and drops the bell by one at once, posts `…/{id}/read`, and lets the
 * link navigate; the post is not awaited by the click, so it is held in `pendingMarks`, and the
 * next inbox to mount waits for it before its first read: back on /notifications the item is
 * read. When the post settles, the bell reads the count again (the server's truth).
 *
 * « TOUT MARQUER COMME LU » (AC-7) is offered while a SHOWN item is unread, and also while the
 * api's count (when it is known) says something is unread that is not shown: an item on a page not
 * read yet, or a type the portal does not show. A failed count read therefore never hides it while
 * the list shows unread items. On its 204 every shown item turns read and the badge goes, then the
 * bell re-reads. No reload.
 *
 * A 307 / 401 (the session ended) reloads the page: the middleware's sign-in redirect.
 */

/** Marks posted by a click whose page may have navigated away before the answer. */
const pendingMarks = new Set<Promise<unknown>>();

/** How many pages one read may chain while every page it read shows nothing (edge case). */
const MAX_EMPTY_CHAIN = 10;

async function readPage(cursor: string | null, signal?: AbortSignal): Promise<PageOutcome> {
  try {
    const res = await fetch(pageBff(cursor), {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
      headers: { Accept: "application/json" },
      signal,
    });
    const body: unknown = res.status === 200 ? await res.json().catch(() => null) : null;
    return pageOutcome(res.status, res.type, body);
  } catch {
    return { kind: "failed" };
  }
}

type Load = "loading" | "ready" | "failed";

export function Inbox({ sessionSubject }: { sessionSubject: string }) {
  const copy = useCopy();
  const locale = useLocale();
  const c = copy.notifications;
  const { unread, refresh, settle } = useNotifications();

  const [pages, setPages] = useState<NotificationPage[]>([]);
  const [first, setFirst] = useState<Load>("loading");
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");
  const [markingAll, setMarkingAll] = useState(false);
  const [now, setNow] = useState(0);
  const alive = useRef(true);

  const post = useCallback(
    (path: string) =>
      fetch(path, {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        redirect: "manual",
        keepalive: true,
        headers: { "Content-Type": "application/json", Accept: "application/json", [SESSION_SUBJECT_HEADER]: sessionSubject },
        body: "{}",
      }),
    [sessionSubject]
  );

  /**
   * Reads from `cursor` and keeps reading while the pages read show nothing and another exists,
   * so the empty state and « Charger plus » are never drawn over a page of hidden types.
   */
  const readFrom = useCallback(async (cursor: string | null, signal?: AbortSignal): Promise<NotificationPage[] | "failed" | "signedOut"> => {
    const read: NotificationPage[] = [];
    let at = cursor;
    for (let i = 0; i < MAX_EMPTY_CHAIN; i++) {
      const outcome = await readPage(at, signal);
      if (outcome.kind === "signedOut") return "signedOut";
      if (outcome.kind === "failed") return read.length > 0 ? read : "failed";
      read.push(outcome.page);
      if (shownItems([outcome.page]).length > 0 || !outcome.page.nextCursor) break;
      at = outcome.page.nextCursor;
    }
    return read;
  }, []);

  const loadFirst = useCallback(
    async (signal?: AbortSignal) => {
      setFirst("loading");
      setMore("idle");
      // A click on the inbox that navigated away posted a mark: this read must see it (AC-4).
      if (pendingMarks.size > 0) await Promise.allSettled([...pendingMarks]);
      const result = await readFrom(null, signal);
      if (!alive.current || signal?.aborted) return;
      if (result === "signedOut") return window.location.reload();
      if (result === "failed") return setFirst("failed");
      setPages(result);
      setNow(Date.now());
      setFirst("ready");
    },
    [readFrom]
  );

  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    void loadFirst(abort.signal);
    return () => {
      alive.current = false;
      abort.abort();
    };
  }, [loadFirst]);

  const nextCursor = pages.length > 0 ? pages[pages.length - 1].nextCursor : null;

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setMore("loading");
    const result = await readFrom(nextCursor);
    if (!alive.current) return;
    if (result === "signedOut") return window.location.reload();
    if (result === "failed") return setMore("failed");
    setPages((held) => [...held, ...result]);
    setNow(Date.now());
    setMore("idle");
  }, [nextCursor, readFrom]);

  const items = useMemo(() => shownItems(pages), [pages]);
  const shownUnread = items.some((item) => item.readAt === null);
  const showMarkAll = first === "ready" && (shownUnread || (unread.kind === "known" && unread.count > 0));

  const markReadInList = useCallback((isTarget: (id: string) => boolean) => {
    const at = new Date().toISOString();
    setPages((held) =>
      held.map((page) => ({
        ...page,
        items: page.items.map((item) => (item.readAt === null && isTarget(item.id) ? { ...item, readAt: at } : item)),
      }))
    );
  }, []);

  const open = useCallback(
    (item: ShownNotification) => {
      if (item.readAt !== null) return;
      markReadInList((id) => id === item.id);
      settle((count) => count - 1);
      const sent = post(readOneBff(item.id))
        .catch(() => undefined)
        .finally(() => {
          pendingMarks.delete(sent);
          refresh();
        });
      pendingMarks.add(sent);
    },
    [markReadInList, post, refresh, settle]
  );

  const markAll = useCallback(async () => {
    setMarkingAll(true);
    let res: Response | null = null;
    try {
      res = await post(READ_ALL_BFF);
    } catch {
      res = null;
    }
    if (!alive.current) return;
    setMarkingAll(false);
    if (res && (res.type === "opaqueredirect" || res.status === 401)) return window.location.reload();
    if (res && res.status === 204) {
      markReadInList(() => true);
      settle(() => 0);
    }
    refresh();
  }, [markReadInList, post, refresh, settle]);

  return (
    <div>
      {showMarkAll && (
        <div className="inbox-head">
          <span />
          <Button variant="secondary" onClick={() => void markAll()} disabled={markingAll}>
            {c.markAll}
          </Button>
        </div>
      )}

      {first === "loading" && (
        <div className="inbox-list" aria-busy="true" data-inbox-state="loading">
          <span className="sr-only" role="status">
            {c.loading}
          </span>
          {[0, 1, 2].map((key) => (
            <div key={key} className="inbox-skeleton" aria-hidden="true" />
          ))}
        </div>
      )}

      {first === "failed" && (
        <div className="inbox-state" role="alert" data-inbox-state="error">
          <p style={{ margin: 0 }}>{c.loadError}</p>
          {/* « Réessayer » reads the list again, and the bell's count with it (AC-9). */}
          <Button
            variant="secondary"
            onClick={() => {
              refresh();
              void loadFirst();
            }}
          >
            {c.retry}
          </Button>
        </div>
      )}

      {first === "ready" && items.length === 0 && !nextCursor && (
        <p className="inbox-state" data-inbox-state="empty">
          {c.empty}
        </p>
      )}

      {first === "ready" && items.length > 0 && (
        <ul className="inbox-list" aria-label={c.listLabel} data-inbox-state="list">
          {items.map((item) => {
            const href = targetOf(item);
            const isUnread = item.readAt === null;
            const time = relativeTime(item.createdAt, now, locale);
            const body = (
              <>
                <span className="inbox-item-text">
                  <span className="inbox-item-line">{itemText(item, copy)}</span>
                  {time && (
                    <time className="inbox-item-time" dateTime={item.createdAt}>
                      {time}
                    </time>
                  )}
                </span>
                {isUnread && (
                  <>
                    <span className="inbox-item-dot" aria-hidden="true" />
                    <span className="sr-only">, {c.unread}</span>
                  </>
                )}
              </>
            );
            return (
              <li key={item.id}>
                {href ? (
                  <Link
                    href={href}
                    className="inbox-item"
                    data-unread={isUnread ? "true" : "false"}
                    data-type={item.type}
                    data-notification-id={item.id}
                    onClick={() => open(item)}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="inbox-item" data-unread={isUnread ? "true" : "false"} data-type={item.type} data-notification-id={item.id}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {first === "ready" && nextCursor && (
        <div className="inbox-more">
          {more === "failed" && (
            <p role="alert" style={{ margin: 0 }} data-inbox-state="more-error">
              {c.loadError}
            </p>
          )}
          <Button variant="secondary" onClick={() => void loadMore()} disabled={more === "loading"}>
            {more === "failed" ? c.retry : c.more}
          </Button>
        </div>
      )}
    </div>
  );
}
