"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/kit";
import { clearClientSession, crossSessionBoundary, replaceDocument, sessionReloadTarget } from "@/lib/clientSession";
import { useCopy } from "@/lib/i18n/client";
import {
  SESSION_ENDED_ATTR,
  SESSION_EPOCH_ATTR,
  SESSION_LEAVING_ATTR,
  isSessionLeaving,
  isStale,
  readBrowserSessionEpoch,
} from "@/lib/sessionEpoch";
import { hasUnsavedWork, onUnsavedWorkCleared } from "@/lib/useUnsavedChanges";

/**
 * BUG-745, ADR-0033 D33.14 — a sign-in or a sign-out in one tab is honoured by every tab of
 * the browser.
 *
 * A tab holds pages rendered for the session it was opened under: the App Router's cache
 * (a page opened in the last 30 s, a Back/Forward entry) and the document on screen. When the
 * session changes in ANOTHER tab, nothing here makes a request, so middleware never gets to
 * say no. This guard compares the session epoch (`src/lib/sessionEpoch.ts`) with the one the
 * server rendered this document under, at every way a page can change, and when they differ
 * it hides the portal before the next frame and reloads, so middleware decides.
 *
 * WHERE it sits (`src/app/layout.tsx`): a sibling of `#app-root` inside `CopyProvider`,
 * OUTSIDE the root `<Suspense>` and inside none of its own. It wraps nothing. A Suspense
 * around `{children}` would move the shell's flush above every page and turn
 * `/clients/[id]`'s `redirect('/clients/denied')` into a `200` meta refresh (BUG-139); none is
 * needed because the root layout is dynamic, and a static route with an unwrapped
 * `useSearchParams` fails `next build` (`missingSuspenseWithCSRBailout`).
 *
 * THE LAYERS. Each records itself in the attribute it sets (`leave(layer)` / `ended(layer)`):
 *  - (a) window CAPTURE listeners for `click`, `auxclick` and `submit`. They run before React's
 *    listeners on the document, so neither a Link's `onClick` nor a button's handler runs. The
 *    write stop.
 *  - (b) `popstate`: Back/Forward. The only layer for a restore to the SAME URL (the unsaved
 *    guard's sentinel), where (c) is silent; for any other traversal an earlier hide.
 *  - (c) a LAYOUT effect on the URL. A URL change commits the new hooks' values and the new
 *    page in one React commit, and layout effects run inside it, before the browser paints:
 *    `#app-root` is hidden in the first frame the new tree could reach. It catches what passes
 *    (a) and (b): a `router.push` after an action resolves, a timer's navigation, a synced
 *    `replaceState`, a traversal. Its first run, at hydration, is not skipped. THE zero-frame
 *    mechanism for URL changes; it renders nothing different.
 *  - (d) wake-ups: the `evoli-pro-session` BroadcastChannel (posted by sign-out, sign-in and
 *    activation), `visibilitychange` to visible, `pageshow` and `focus`. They only shorten how
 *    long a page already on screen stays there; the zero-frame guarantee does not rest on them.
 *
 * THE EDITOR EXCEPTION (point 4, D33.7: a session end never navigates away from unsaved work).
 * When a layer fires while `hasUnsavedWork()` (evaluated at every event, never cached), the
 * page stays, `html[data-session-ended]` is set, and the banner below is shown OUTSIDE
 * `#app-root`. Until the coach acts, layer (a) cancels every `submit` and every click but
 * those inside the banner and those whose NEAREST interactive ancestor carries
 * `data-session-safe` (section toggles, the unsaved prompt's Stay and Leave). A control nobody
 * marked costs a dead click while signed out, never a write under another account's cookies.
 *
 * THE RULE FOR WRITES NOT STARTED BY A CLICK: there is no `fetch` wrapper. Any write started
 * from an effect, a timer or an action's continuation must check `isSessionStale()` first, and
 * reopen ADR-0033 D33.14 point 4. Today's one such write (`InviteLinkPanel`'s mount-effect
 * mint) is click-gated.
 */

type Layer = "a" | "b" | "c" | "d";

/**
 * What the server rendered this document under (staff r2 N5): the root layout's
 * `<html data-session-epoch>`, read ONCE per document. Not the cookie: a boundary crossed after
 * the server rendered this document but before its script ran would then read as "not stale"
 * for good. `""` is "no epoch" (a session from before the cookie existed).
 *
 * ⚠ Read at the guard's FIRST COMMIT (`seedSeen`), not at module evaluation as D33.14 point 2
 * words it. A render that throws before the first byte (BUG-629's 500, BUG-689) is served as
 * Next's error shell, `<html id="__next_error__">` with none of the root layout's attributes
 * (next/dist/server/app-render/app-render.js:381-389), and the browser then CLIENT-renders the
 * whole tree (next/dist/client/app-index.js:152). At module evaluation the attribute is absent,
 * `seen` read `null`, the cookie made that "stale", and every such page reloaded itself forever
 * (witnessed: `client-overview-load-error-status.spec.ts` timed out in `page.goto`). By the
 * first commit React has applied the root layout's `<html>` props, which carry the value the
 * server read from the request's cookie: the same N5 value in both the SSR and the error-shell
 * case. No listener exists before that commit, so nothing reads `seen` earlier.
 */
let seen: string | null = null;
/**
 * Fixture mode only: `evoli_fixture_session_wake=off` makes the root layout render
 * `data-session-wake="off"`, which removes layer (d) — no BroadcastChannel post or listener and
 * no wake-up listener. ADR-0033 D33.14's witnesses of (a), (b) and (c) run that way (staff r2
 * S3): with (d) on, the sign-out's message reloads the tab before the click, traversal or
 * action resolution the witness is about. The root layout never renders it in live mode.
 * Read with `seen`, at the first commit, for the same error-shell reason (staff N1).
 */
let wakeOff = false;
let seeded = false;
function seedSeen(): void {
  if (seeded) return;
  seeded = true;
  const html = document.documentElement;
  seen = html.getAttribute(SESSION_EPOCH_ATTR) || null;
  wakeOff = html.getAttribute("data-session-wake") === "off";
}

const CHANNEL_NAME = "evoli-pro-session";
let channel: BroadcastChannel | null = null;

/**
 * One channel object per document, for posting AND listening: a BroadcastChannel never
 * delivers a message to the object that posted it, so the tab that crossed the boundary does
 * not answer its own announcement (its own `crossSessionBoundary` is already loading the page).
 * `null` without BroadcastChannel (Safari before 15.4): only (d)'s eviction is lost.
 */
function sessionChannel(): BroadcastChannel | null {
  if (wakeOff || typeof BroadcastChannel === "undefined") return null;
  channel ??= new BroadcastChannel(CHANNEL_NAME);
  return channel;
}

/**
 * Tell the other tabs of this browser that the session changed here. Called by the sign-out
 * button after the logout POST, and by the sign-in and activation forms before
 * `crossSessionBoundary`. Best effort by design: layers (a)–(c) do not need it.
 */
export function announceSessionBoundary(): void {
  try {
    sessionChannel()?.postMessage("boundary");
  } catch {
    // A closed or unavailable channel loses only the eviction.
  }
}

/** The epoch in the jar now differs from the one this document was rendered under. */
export function isSessionStale(): boolean {
  return isStale(seen, readBrowserSessionEpoch());
}

/** First writer wins, so the attribute names the layer that did the work. */
function mark(attr: string, layer: Layer): void {
  const html = document.documentElement;
  if (!html.hasAttribute(attr)) html.setAttribute(attr, layer);
}

/**
 * Hide the portal (`globals.css` hides `#app-root` under `html[data-session-leaving]`), drop
 * the client caches and reload this URL (or, in the tab that crossed the boundary itself, the
 * page it is already loading: `sessionReloadTarget`, ruling R9), all in one task. Middleware
 * then decides: `/login` after a sign-out, this page re-rendered for the new session after a
 * sign-in elsewhere.
 *
 * Once per document (R6), unless the load was lost (R10). A second layer that fires while the
 * document is already leaving issues nothing within the retry gap of the last issue, so a Back's
 * (b)-then-(c) stays one reload and a slow load is not restarted. Past the gap it re-issues, and
 * the gap doubles (3 s, 6, 12, 24, capped at 30 s): WebKit keeps the old document, hidden, when
 * the reload is lost (a dropped connection, a 204, Esc), and a coach's next click or wake-up is
 * then what recovers it. No timer: nothing runs while the coach is idle. A `popstate` while
 * leaving re-issues with no gate (`onPopState`), because a traversal cancels the load at once.
 */
/** R10: when this document last issued its reload, and how long before a re-entry may re-issue it. */
let issuedAt = 0;
let retryGap = 3_000;
const RETRY_GAP_CAP = 30_000;

function issue(): void {
  issuedAt = performance.now();
  replaceDocument(sessionReloadTarget());
}

function leave(layer: Layer): void {
  if (isSessionLeaving()) {
    // R10: WebKit keeps the old document, hidden, when the reload is lost. A coach's next click or
    // wake-up re-issues it, but never within the gap, so a slow load is not restarted and a Back's
    // (b)-then-(c) stays one reload (R6).
    if (performance.now() - issuedAt < retryGap) return;
    retryGap = Math.min(retryGap * 2, RETRY_GAP_CAP);
    issue();
    return;
  }
  mark(SESSION_LEAVING_ATTR, layer);
  clearClientSession();
  issue();
}

let showBanner: (() => void) | null = null;

function ended(layer: Layer): void {
  mark(SESSION_ENDED_ATTR, layer);
  showBanner?.();
}

function decide(layer: Layer): void {
  if (!isSessionStale()) return;
  if (hasUnsavedWork()) ended(layer);
  else leave(layer);
}

const INTERACTIVE =
  "a,button,input,select,textarea,summary,label,[role=button],[role=link],[tabindex]";

/**
 * The exception's allowlist (point 4, staff r2 S2). The banner's own subtree, or a click whose
 * NEAREST interactive ancestor is marked. Not "inside a marked element": a mark on a container
 * would then pass every control in it, a Save included.
 */
export function allowedWhileSessionEnded(target: EventTarget | null): boolean {
  const el = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!el) return false;
  if (el.closest("[data-session-ended-banner]")) return true;
  const control = el.closest(INTERACTIVE);
  return !!control && control.matches("[data-session-safe]");
}

function cancel(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

/** Layer (a). */
function onActivate(event: Event): void {
  if (!isSessionStale()) return;
  if (!hasUnsavedWork()) {
    cancel(event);
    leave("a");
    return;
  }
  ended("a");
  if (event.type !== "submit" && allowedWhileSessionEnded(event.target)) return;
  cancel(event);
}

/** Layer (b). */
function onPopState(): void {
  if (isSessionLeaving()) {
    // A traversal queued before or after `leave()` must not leave a hidden tab that never loads.
    // Ungated (R6, R10), and it restarts the retry clock.
    issue();
    return;
  }
  decide("b");
}

/** Layer (d). */
function onWake(): void {
  decide("d");
}

function onVisibility(): void {
  if (document.visibilityState === "visible") decide("d");
}

/** `useLayoutEffect` in the browser; nothing on the server, where it only warns. */
const useCommitEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function SessionEpochGuard() {
  const copy = useCopy();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isEnded, setEnded] = useState(false);

  useCommitEffect(() => {
    seedSeen();
    showBanner = () => setEnded(true);
    window.addEventListener("click", onActivate, true);
    window.addEventListener("auxclick", onActivate, true);
    window.addEventListener("submit", onActivate, true);
    window.addEventListener("popstate", onPopState);
    // Staff S2: the moment nothing is unsaved any more, the exception no longer applies.
    const offCleared = onUnsavedWorkCleared(() => decide("c"));
    return () => {
      offCleared();
      showBanner = null;
      window.removeEventListener("click", onActivate, true);
      window.removeEventListener("auxclick", onActivate, true);
      window.removeEventListener("submit", onActivate, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  // Layer (c): after every commit that changes the URL, before the browser paints it.
  useCommitEffect(() => {
    decide("c");
  }, [pathname, searchParams]);

  // Layer (d).
  useEffect(() => {
    if (wakeOff) return;
    const ch = sessionChannel();
    ch?.addEventListener("message", onWake);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      ch?.removeEventListener("message", onWake);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, []);

  if (!isEnded) return null;
  return (
    <div className="session-ended-banner" data-session-ended-banner="" role="alert">
      <p className="session-ended-text">{copy.shell.sessionEnded}</p>
      <Button
        variant="primary"
        size="sm"
        // The browser still asks before discarding the editor's work (its `beforeunload`):
        // that question is D33.7's intent, the coach confirms leaving it.
        onClick={() => crossSessionBoundary(`${window.location.pathname}${window.location.search}`)}
      >
        {copy.shell.sessionEndedSignIn}
      </Button>
    </div>
  );
}
