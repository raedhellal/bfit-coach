"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useCopy } from "@/lib/i18n/client";

/**
 * A thin bar at the top of the window while a page change is slow.
 *
 * Why it exists (perf/coach-fast-routes-no-skeleton): the client tabs and the challenge
 * page lost their `loading.tsx`. A committed `loading.tsx` fallback holds the page for
 * React's ~300 ms reveal throttle, so every first visit took ~310 ms even when the server
 * answered in 70 ms. Without a fallback, React keeps the OLD page on screen until the new
 * one is ready. That is what makes fast routes fast, but on a slow response nothing would
 * move. Next 14 has no "link pending" hook (`useLinkStatus` is Next 15), so this watches
 * the clicks itself:
 *
 *   · a same-document link click to another path or query STARTS a pending navigation,
 *     and so does `startNavigationProgress(href)`, which every `router.push` / `replace`
 *     to a route without a skeleton calls first (see below);
 *   · the committed URL changing (`usePathname` / `useSearchParams`) ENDS it;
 *   · the bar becomes visible only if the navigation is still pending after
 *     NAV_PROGRESS_DELAY_MS, so a fast change (or a revisit served from the router cache)
 *     never flashes it;
 *   · a navigation that never commits (an error, a cancelled click) gives up after
 *     GIVE_UP_MS rather than leaving a bar on screen.
 *
 * A navigation started from code is invisible to the click listener. Staff's review
 * measured what that cost: "Leave without saving", "Use this template", the nutrition
 * template's "Use on a trainee" and "Create and invite" each close a dialog and then
 * `router.push` to a page that no longer has a skeleton, and with reads held 1.2 s the
 * coach saw nothing for 2.4-4.8 s. Those call sites now call `startNavigationProgress`
 * right before the push. Back/Forward is still not covered: it is a router-cache
 * restore, or a document load the browser shows itself.
 * Clicks that the unsaved-changes guard intercepts never reach this listener: the guard
 * stops them in the capture phase, and this listens in the bubble phase. Its "Leave"
 * button calls `startNavigationProgress` AFTER popping its history sentinel, because
 * that `popstate` ends any pending navigation here.
 *
 * Back/Forward ends a pending navigation (`popstate`). Usually the URL change does that
 * anyway, but a Back to an entry with the SAME URL (the unsaved-changes guard's sentinel
 * has that shape) makes Next abandon the pending navigation without any URL change, and
 * without this the bar would stay until the 20 s give-up (measured).
 *
 * Accessibility: `role="progressbar"` with a name and no value (indeterminate), `hidden`
 * (so out of the accessibility tree) except while it shows, and `aria-busy` on
 * `#app-root` while it shows. It is `position: fixed` and 3 px tall, so
 * it never moves the layout. Under `prefers-reduced-motion` the bar stands still.
 */
export const NAV_PROGRESS_DELAY_MS = 400;
export const NAV_PROGRESS_GIVE_UP_MS = 20_000;
const START_EVENT = "evoli:navigation-start";

/** True when `href` is where the page already is (path and query): nothing will commit. */
function isHere(href: string): boolean {
  const url = new URL(href, window.location.href);
  return url.origin === window.location.origin
    ? `${url.pathname}${url.search}` === `${window.location.pathname}${window.location.search}`
    : true;
}

/**
 * Call right before a `router.push` / `router.replace` to a route without a
 * `loading.tsx`: the bar then shows if the page has not committed after 400 ms. A target
 * equal to the current URL is ignored (no commit would ever end it).
 */
export function startNavigationProgress(href: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(START_EVENT, { detail: href }));
}

/**
 * Set through `dangerouslySetInnerHTML`, never as a text child: React's server render
 * escapes a `<style>` text child (`>` became `&gt;`), which broke the rule in the HTML
 * and made the hydration text differ — the dev overlay then painted over every page.
 */
const CSS = `
.nav-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:1000;pointer-events:none;overflow:hidden;background:rgba(79,124,255,.18)}
.nav-progress-fill{position:absolute;top:0;bottom:0;left:0;width:40%;background:var(--grad-energy,#4F7CFF);animation:nav-progress-slide 1.1s ease-in-out infinite}
@keyframes nav-progress-slide{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}
@media (prefers-reduced-motion: reduce){.nav-progress-fill{width:100%;animation:none;opacity:.6}}
`;

/** The path and query a click on this anchor would navigate to, or null if it would not. */
function navigationTarget(event: MouseEvent): string | null {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  // The same page (or only its #hash) is not a navigation Next waits for.
  return isHere(url.href) ? null : `${url.pathname}${url.search}`;
}

export function NavigationProgress() {
  const copy = useCopy();
  const pathname = usePathname();
  const search = useSearchParams()?.toString() ?? "";
  const bar = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);

  /**
   * Shown and hidden on the DOM directly, never through React state. Measured: a
   * `router.push` that follows a `popstate` (the unsaved-changes guard's « Leave » pops
   * its history entry first) holds every React update until the new page commits, so a
   * `setState(true)` at 400 ms painted the bar only together with the content, 2.8 s
   * later. The bar exists to show while React is busy; it cannot wait for React.
   * React renders the element once with `hidden` and never changes that prop, so it never
   * touches what is set here.
   */
  const show = useCallback((on: boolean) => {
    const el = bar.current;
    if (el) {
      el.hidden = !on;
      if (on) el.setAttribute("data-nav-progress", "visible");
      else el.removeAttribute("data-nav-progress");
    }
    const root = document.getElementById("app-root");
    if (on) root?.setAttribute("aria-busy", "true");
    else root?.removeAttribute("aria-busy");
  }, []);

  const stop = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    show(false);
  }, [show]);

  useEffect(() => {
    const begin = () => {
      stop();
      timers.current = [
        window.setTimeout(() => show(true), NAV_PROGRESS_DELAY_MS),
        window.setTimeout(stop, NAV_PROGRESS_GIVE_UP_MS),
      ];
    };
    const onClick = (event: MouseEvent) => {
      if (navigationTarget(event)) begin();
    };
    document.addEventListener("click", onClick);
    // The event names its target, and the same-URL rule is applied HERE, where a test
    // can reach it by dispatching the event.
    const onStart = (event: Event) => {
      const href = (event as CustomEvent<unknown>).detail;
      if (typeof href === "string" && !isHere(href)) begin();
    };
    window.addEventListener(START_EVENT, onStart);
    window.addEventListener("popstate", stop);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener(START_EVENT, onStart);
      window.removeEventListener("popstate", stop);
      stop();
    };
  }, [show, stop]);

  // The new URL committed: the navigation is over, however it ended.
  useEffect(() => stop(), [pathname, search, stop]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div ref={bar} className="nav-progress" role="progressbar" aria-label={copy.navProgress.label} hidden>
        <span className="nav-progress-fill" />
      </div>
    </>
  );
}
