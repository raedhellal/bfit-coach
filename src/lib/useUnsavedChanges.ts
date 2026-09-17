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
    const push = () =>
      window.history.pushState(
        { ...window.history.state, evoliUnsavedGuard: true },
        "",
        window.location.href
      );
    push();
    const onPop = () => {
      if (bypass.current) return;
      push();
      setPending({ route: "back", href: null });
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // The work was saved (or the editor unmounted): take the sentinel back out, or
      // the coach's next Back press would appear to do nothing.
      // `bypass` means we are in the middle of a confirmed navigation: the entry is
      // about to be replaced by the router, and stepping back here would race it.
      if (!bypass.current && window.history.state?.evoliUnsavedGuard) {
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
    bypass.current = true;
    if (pending.href) {
      router.push(pending.href);
    } else {
      // Back: two entries — the sentinel we re-pushed, and the page itself.
      window.history.go(-2);
    }
    window.setTimeout(() => {
      bypass.current = false;
    }, 0);
  }, [pending, router]);

  /**
   * Stand down entirely, and hand the history back CLEAN, for a navigation the page
   * did not initiate.
   *
   * EV-190 edge case 4, and it is measured rather than reasoned: with the sentinel
   * entry in place, the `router.refresh()` that discovers a revoked link never reached
   * /clients/denied — the coach stayed on a revoked trainee's plan, which is precisely
   * what edge case 4 says may not happen. Next's router reconciles a refresh against
   * `history.state`, and an extra entry this hook pushed over the top of it is not
   * something it can reconcile.
   *
   * So the sentinel is removed FIRST and the caller's navigation runs only once the
   * `popstate` has landed. `bypass` keeps the pop from re-arming the prompt, and the
   * no-sentinel case (nothing was dirty) runs the callback straight away.
   */
  const release = useCallback((then: () => void) => {
    bypass.current = true;
    if (!window.history.state?.evoliUnsavedGuard) {
      bypass.current = false;
      then();
      return;
    }
    const onPop = () => {
      window.removeEventListener("popstate", onPop);
      bypass.current = false;
      then();
    };
    window.addEventListener("popstate", onPop);
    window.history.back();
  }, []);

  return { prompted: pending !== null, stay, leave, release };
}
