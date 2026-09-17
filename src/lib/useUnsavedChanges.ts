"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { logPortalEvent } from "./portalEvents";

/**
 * EV-190 U2 / AC2 — a coach's unsaved editor work cannot leave the page silently.
 *
 * The routine editor is a client island holding a working copy, and the only writes
 * are "Save draft" and publish. Before this there was no `beforeunload` and no
 * route-change guard, so clicking the Nutrition tab after editing six days lost all of
 * it with no warning.
 *
 * ⚠️ `isDraft` is NOT the flag and must never become it: it is true for a SAVED draft
 * with no edits, so a guard driven by it would fire on a page where nothing is
 * outstanding. A warning that cries wolf is dismissed reflexively and then ignored on
 * the day it matters. The caller therefore passes a separate `dirty` flag that its own
 * edit path sets and only a SUCCESSFUL save or publish clears.
 *
 * Four routes out of the page, which is what AC2 enumerates:
 *   · the client tabs and the roster breadcrumb — same-document `<Link>` navigations,
 *     intercepted as anchor clicks in the CAPTURE phase, before Next's router sees
 *     them. There is no supported App Router navigation event to hook (`useBlocker`
 *     is a Pages/React-Router idea), and patching `router.push` would miss the
 *     prefetching `<Link>` entirely;
 *   · the browser Back button — a sentinel history entry, re-pushed on `popstate`, so
 *     the page stays put while the coach answers;
 *   · closing the tab — `beforeunload`, whose dialog is the browser's own and whose
 *     wording is not ours to choose.
 *
 * ⚠️ What this deliberately does NOT block: a navigation the SERVER caused. Edge case
 * 4 — a write answered 403 means the link was revoked, the editor calls
 * `router.refresh()` and the layout redirects to /clients/denied. A coach whose access
 * ended may not be held on a revoked trainee's plan by a dialog about their own work,
 * so the editor clears `dirty` on that path and nothing here can intercept a
 * `redirect()` anyway: only anchor clicks and `popstate` are hooked.
 */
export type LeaveRoute = "tabs" | "breadcrumb" | "back" | "unload";

type Pending = { route: LeaveRoute; href: string | null };

export function useUnsavedChanges(dirty: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  /**
   * Set while we are performing a navigation the coach has just confirmed, so the
   * `popstate` listener does not re-arm the guard against our own `history.go`.
   */
  const bypass = useRef(false);
  /**
   * Whether OUR sentinel entry is the current one.
   *
   * Tracked here rather than read back off `history.state`: the state object is shared
   * with Next's router, anything may write to it, and "is this entry mine" is a fact
   * about this hook, not about the document.
   */
  const sentinel = useRef(false);

  /**
   * Take our sentinel entry back out of the history, then do `then`.
   *
   * Everything that leaves this page or hands the router a navigation goes through
   * here, for two measured reasons. A sentinel left behind costs the coach a DEAD BACK
   * PRESS after they leave by a link (the entry has the editor's URL, so Back appears
   * to do nothing) — and with the sentinel still current, a `router.refresh()` never
   * reaches the layout's redirect to /clients/denied, which is EV-190 edge case 4
   * failing silently.
   */
  const withCleanHistory = useCallback((then: () => void) => {
    bypass.current = true;
    if (!sentinel.current) {
      bypass.current = false;
      then();
      return;
    }
    const onPop = () => {
      window.removeEventListener("popstate", onPop);
      sentinel.current = false;
      bypass.current = false;
      then();
    };
    window.addEventListener("popstate", onPop);
    window.history.back();
  }, []);

  // ── Closing the tab or reloading ────────────────────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // The browser owns this dialog; `preventDefault` + `returnValue` is the whole
      // API, and the sentence is Chrome's, not ours. It is still the only thing
      // standing between a closed tab and lost work.
      event.preventDefault();
      event.returnValue = "";
      logPortalEvent({
        event: "coach_unsaved_changes_prompted",
        route: "unload",
        // Unknowable: the browser never tells the page which button was pressed. A
        // fabricated `true` would make the field a lie, and the field is the whole
        // point of the event, so the honest answer is the one we can observe — the
        // page is still running when this fires.
        stayed: false,
      });
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // ── The client tabs and the roster breadcrumb ───────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // A link back to this very page loses nothing.
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPending({
        // The tab strip is the only navigation INTO this trainee's own sections; the
        // breadcrumb and the header logo both leave for the roster.
        route: url.pathname.startsWith("/clients/") ? "tabs" : "breadcrumb",
        href: `${url.pathname}${url.search}${url.hash}`,
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  // ── The browser Back button ─────────────────────────────────────────────────
  useEffect(() => {
    if (!dirty) return;
    /**
     * One extra entry for the SAME url, carrying Next's own router state so the
     * router is not confused when it is popped. Back then lands on it, `popstate`
     * fires, we push it again, and the coach is asked while still on the page with
     * every edit intact.
     */
    const push = () => {
      window.history.pushState(
        { ...window.history.state, evoliUnsavedGuard: true },
        "",
        window.location.href
      );
      sentinel.current = true;
    };
    push();
    const onPop = () => {
      if (bypass.current) return;
      // The browser has already stepped off the sentinel; put it back so the coach is
      // asked while still on the page, with every edit intact.
      sentinel.current = false;
      push();
      setPending({ route: "back", href: null });
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // The work was saved (or the editor unmounted): take the sentinel back out, or
      // the coach's next Back press would appear to do nothing.
      // `bypass` means a confirmed navigation is already removing it.
      if (!bypass.current && sentinel.current) {
        sentinel.current = false;
        bypass.current = true;
        window.history.back();
        window.setTimeout(() => {
          bypass.current = false;
        }, 0);
      }
    };
  }, [dirty]);

  const stay = useCallback(() => {
    if (pending) {
      logPortalEvent({
        event: "coach_unsaved_changes_prompted",
        route: pending.route,
        stayed: true,
      });
    }
    setPending(null);
  }, [pending]);

  const leave = useCallback(() => {
    if (!pending) return;
    logPortalEvent({
      event: "coach_unsaved_changes_prompted",
      route: pending.route,
      stayed: false,
    });
    setPending(null);
    withCleanHistory(() => {
      // The sentinel is gone by now, so a link navigation leaves exactly one entry for
      // this page — no dead Back press — and "back" means one more step, not `go(-2)`.
      if (pending.href) router.push(pending.href);
      else window.history.back();
    });
  }, [pending, router, withCleanHistory]);

  /**
   * Stand down, and hand the history back clean, for a navigation the page did not
   * initiate — an access-ended refresh, or the refresh after a successful save.
   * `withCleanHistory` is the whole of it; this name is what the editor reads.
   */
  const release = withCleanHistory;

  return { prompted: pending !== null, stay, leave, release };
}
