"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/ui/Link";
import { Button } from "@/components/ui/kit";
import { SESSION_SUBJECT_HEADER } from "@/lib/autosaveTransport";
import type { NotificationPage } from "@/lib/coachApi";
import { useCopy, useLocale } from "@/lib/i18n/client";
import {
  itemText,
  MARK_WAIT_MS,
  marksSettled,
  pageBff,
  pageOutcome,
  READ_ALL_BFF,
  readOneBff,
  relativeTime,
  shownItems,
  targetOf,
  trackMark,
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
 * link navigate; the post is not awaited by the click, so it is tracked (`trackMark`), and both the
 * next inbox and the next page's bell wait for it before their first read (`marksSettled`): back on
 * /notifications the item is read, and the bell on the page the link opened counts it read.
 *
 * « TOUT MARQUER COMME LU » (AC-7) is offered while a SHOWN item is unread, and also while the
 * api's count (when it is known) says something is unread that is not shown: an item on a page not
 * read yet, or a type the portal does not show. A failed count read therefore never hides it while
 * the list shows unread items. On its 204 every shown item turns read and the badge goes, then the
 * bell re-reads. No reload. The button then leaves the page, so focus moves to the list (it never
 * falls to `<body>`, WCAG 2.4.3) and the status line says everything is read. A failed request
 * (502, 403, no answer) keeps the button and says so beside it, in the load-error sentence.
 *
 * « CHARGER PLUS » leaves the page with the last page read; focus moves to the first row it added.
 *
 * A 307 / 401 (the session ended) reloads the page: the middleware's sign-in redirect.
 */

/** How many pages one read may chain while every page it read shows nothing (edge case). */
const MAX_EMPTY_CHAIN = 10;

/** The page's h1, focusable from script: where focus lands when there is no list (no shown row). */
function headingOf(): HTMLElement | null {
  const h1 = document.querySelector<HTMLElement>("main h1");
  if (h1 && !h1.hasAttribute("tabindex")) h1.setAttribute("tabindex", "-1");
  return h1;
}

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
  const [markAllFailed, setMarkAllFailed] = useState(false);
  const [allRead, setAllRead] = useState(false);
  /** The last count a read KNEW (BUG-1094); `null` before any. Written during render, see below. */
  const lastKnown = useRef<number | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  /** Where focus goes after the next render: the list, or the row at this index (S3). */
  const pendingFocus = useRef<"list" | number | null>(null);
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
        // Bounded (staff round 2): a hung request must not hold `marksSettled` or the button.
        signal: AbortSignal.timeout(MARK_WAIT_MS),
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
      await marksSettled();
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

  const shownBefore = useRef(0);
  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setMore("loading");
    const result = await readFrom(nextCursor);
    if (!alive.current) return;
    if (result === "signedOut") return window.location.reload();
    if (result === "failed") return setMore("failed");
    // The last page: « Charger plus » is about to leave the page; focus goes to the first new row.
    if (!result[result.length - 1].nextCursor) pendingFocus.current = shownBefore.current;
    setPages((held) => [...held, ...result]);
    setNow(Date.now());
    setMore("idle");
  }, [nextCursor, readFrom]);

  const items = useMemo(() => shownItems(pages), [pages]);
  shownBefore.current = items.length;

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null || first !== "ready") return;
    pendingFocus.current = null;
    const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-notification-id]");
    const row = typeof target === "number" && rows && target < rows.length ? rows[target] : null;
    const landing = row ?? listRef.current ?? headingOf();
    landing?.focus();
  });
  const shownUnread = items.some((item) => item.readAt === null);
  const countSaysUnread = unread.kind === "known" && unread.count > 0;
  const showMarkAll = first === "ready" && (shownUnread || countSaysUnread);
  // BUG-1094: the status line says "everything is read", so it is shown only while the LAST KNOWN
  // count is 0. `lastKnown` follows every known count, in the render that receives it, so a new
  // item read by the 60 s poll (1) hides the line in the same render as the bell's 1. A failed or
  // loading read is no evidence and changes nothing: after a 1, a 502 keeps the line hidden (it
  // never reads as a 0, AC-9); after a 0, it keeps it shown. `null` is no evidence yet.
  // A mark-all 204 is evidence of 0 (`markAll` sets it), so the line shows even when the count was
  // failing at the time. A read sent before the mark that answers after it (a stale 3) hides the
  // line until the re-read the 204 asked for (`refresh`) answers 0 and shows it again.
  if (unread.kind === "known") lastKnown.current = unread.count;
  const allReadShown = allRead && lastKnown.current === 0;

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
      void trackMark(post(readOneBff(item.id)).catch(() => undefined)).finally(refresh);
    },
    [markReadInList, post, refresh, settle]
  );

  const markAll = useCallback(async () => {
    setMarkingAll(true);
    setMarkAllFailed(false);
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
      lastKnown.current = 0;
      setAllRead(true);
      pendingFocus.current = "list";
    } else {
      setMarkAllFailed(true);
    }
    refresh();
  }, [markReadInList, post, refresh, settle]);

  return (
    <div>
      {showMarkAll && (
        <div className="inbox-head">
          {markAllFailed ? (
            <p role="alert" style={{ margin: 0 }} data-inbox-state="mark-all-error">
              {c.loadError}
            </p>
          ) : (
            <span />
          )}
          <Button variant="secondary" onClick={() => void markAll()} disabled={markingAll}>
            {c.markAll}
          </Button>
        </div>
      )}
      {/* Always in the page, so its change is announced (S3). */}
      <p role="status" className={allReadShown ? "inbox-status" : "sr-only"} data-inbox-state="all-read-status">
        {allReadShown ? c.allRead : ""}
      </p>

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
        <ul ref={listRef} tabIndex={-1} className="inbox-list" aria-label={c.listLabel} data-inbox-state="list">
          {items.map((item) => {
            const href = targetOf(item);
            const isUnread = item.readAt === null;
            const time = relativeTime(item.createdAt, now, locale);
            const line = itemText(item, copy);
            // BUG-1094 rider: the link's name is stated, so the unread marker joins the time with
            // no space before its comma ("now, unread"). From content, the .sr-only span is out of
            // flow and the name computation put a space before it ("now , unread").
            const name = `${line}${time ? ` ${time}` : ""}${isUnread ? `, ${c.unread}` : ""}`;
            const body = (
              <>
                <span className="inbox-item-text">
                  <span className="inbox-item-line">{line}</span>
                  {time && (
                    <time className="inbox-item-time" dateTime={item.createdAt}>
                      {time}
                    </time>
                  )}
                </span>
                {isUnread && (
                  <>
                    <span className="inbox-item-dot" aria-hidden="true" />
                    {/* Kept: a link's stated `aria-label` overrides it, but a row with no target (the
                        `div` below, a generic that may not carry `aria-label`) is read from content,
                        and this is the only place it says "unread" to a screen reader. */}
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
                    aria-label={name}
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
