"use client";
// BUG-171 — the keyboard contract of the kit's `Modal` (kit.tsx), owned once here so every
// dialog built on it inherits it: the ARIA APG dialog pattern that `aria-modal="true"` claims.
//
//   · open    focus moves INTO the dialog: an element already focused inside it (a field's
//             `autoFocus`), else the one marked `data-autofocus`, else the first tabbable of
//             the dialog's body, else its first tabbable (the × Close button);
//   · Tab     Tab / Shift+Tab cycle within the dialog and never reach the page behind it;
//   · Escape  calls `onClose` — the same function as × — so a dialog whose `onClose` refuses
//             while a request is in flight (`() => !pending && …`) refuses Escape too. A DIRTY
//             dialog ignores Escape, as it ignores a backdrop click (BUG-699/702: only × and
//             Cancel, which say what they do, may discard what the coach typed) — unless the
//             dialog opts out with `escapeIgnoresDirty` (the catalogue picker);
//   · close   focus returns to the element that opened the dialog — once it is enabled again
//             if the dialog's request left it disabled; if it is gone, to the first control of
//             its nearest surviving container, then to `<main id="main">` — EXACTLY ONCE, and
//             never over a focus move the caller made in the same commit: see `restore`.
//
// Only the TOPMOST open dialog acts on a key or a focus move (`stack`), so a dialog opened from
// another dialog takes Escape and the trap for itself and hands them back when it closes.

const TABBABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "summary",
  '[contenteditable]:not([contenteditable="false"])',
  "[tabindex]",
].join(",");

/** The dialog's body (`data-modal-body`, kit.tsx): where the initial focus looks first. */
const MODAL_BODY = "[data-modal-body]";

function rendered(el: HTMLElement): boolean {
  if (el.closest("[inert]")) return false;
  if (el.getClientRects().length === 0) return false;
  return getComputedStyle(el).visibility !== "hidden";
}

/**
 * The elements Tab stops on inside `root`, in DOM order (the portal sets no positive
 * `tabindex`). A radio group is one stop, as the browser makes it: its checked radio, or its
 * first when none is.
 */
export function tabbables(root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  const groups = new Set<string>();
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(TABBABLE))) {
    if (el.tabIndex < 0 || !rendered(el)) continue;
    if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
      if (groups.has(el.name)) continue;
      const group = Array.from(root.querySelectorAll<HTMLInputElement>(`input[type="radio"]`)).filter(
        (r) => r.name === el.name && !r.disabled && rendered(r)
      );
      const stop = group.find((r) => r.checked) ?? group[0];
      groups.add(el.name);
      if (stop) out.push(stop);
      continue;
    }
    out.push(el);
  }
  return out;
}

function initialTarget(dialog: HTMLElement): HTMLElement {
  const marked = dialog.querySelector<HTMLElement>("[data-autofocus]");
  if (marked && rendered(marked)) return marked;
  const body = dialog.querySelector<HTMLElement>(MODAL_BODY);
  return (body && tabbables(body)[0]) || tabbables(dialog)[0] || dialog;
}

/** Focus `el` and report whether it took it (a disabled or detached element silently does not). */
function tryFocus(el: HTMLElement | null | undefined, preventScroll = false): boolean {
  if (!el || !el.isConnected || !rendered(el)) return false;
  el.focus({ preventScroll });
  return document.activeElement === el;
}

/**
 * Two stand-ins for the opener, for when the focused element at the moment a dialog opens is
 * `<body>`:
 *
 *   · `pressed` — a press on a button does not focus it in Safari (WebKit), so a dialog opened by
 *     a pointer there finds nothing focused. The last pressed control stands in. A key press
 *     clears it: from the keyboard, focus is the truth.
 *   · `lastFocused` — a control that is DISABLED while its request runs drops focus to the body,
 *     and the dialog opens when the answer arrives: « Publish » (RoutineEditor) asks for the
 *     publish preview first. The element that last held focus is that control.
 *
 * Installed when this module first evaluates in the browser, so the first dialog has them too.
 */
let pressed: HTMLElement | null = null;
let lastFocused: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      pressed = event.target instanceof Element ? event.target.closest<HTMLElement>(TABBABLE) : null;
    },
    true
  );
  document.addEventListener("keydown", () => (pressed = null), true);
  document.addEventListener(
    "focusin",
    (event) => {
      if (event.target instanceof HTMLElement) lastFocused = event.target;
    },
    true
  );
}

/** An opener candidate and its ancestors, read while it is still in the document. */
interface Candidate {
  el: HTMLElement;
  /** Parent first, up to (not including) `<body>`. */
  chain: HTMLElement[];
}

/** What a dialog may hand focus back to, best first. */
export type Opener = Candidate[];

function candidate(el: Element | null): Candidate | null {
  if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return null;
  const chain: HTMLElement[] = [];
  for (let at = el.parentElement; at && at !== document.body; at = at.parentElement) chain.push(at);
  return { el, chain };
}

/**
 * Read the opener DURING the render that opens the dialog — before the commit. Two reasons:
 * a field's `autoFocus` inside the dialog takes focus in that commit, and an opener that the
 * same state change removes (RevokeMenu's « Revoke access » item, whose menu closes as the
 * dialog opens) is only still in the document, with its ancestors, at render time.
 */
export function captureOpener(): Opener {
  if (typeof document === "undefined") return [];
  return [candidate(document.activeElement), candidate(pressed), candidate(lastFocused)].filter(
    (c): c is Candidate => c !== null && c.el.isConnected
  );
}

/** Open dialogs, topmost last. */
const stack: object[] = [];

/**
 * Wire the contract to the rendered dialog. Returns the cleanup, to be called when the dialog
 * closes or unmounts. Run from a PASSIVE effect (useEffect): the restore it schedules must come
 * after every effect of the commit that closed the dialog — see `restore`.
 */
export function engageModal(
  dialog: HTMLElement,
  opener: Opener,
  onClose: () => void,
  /** True while Escape must not close: the dialog is dirty and has not opted out (kit.tsx). */
  escapeHeld: () => boolean
): () => void {
  // A dialog opening now owns focus: a previous dialog's wait for its disabled opener ends here.
  // Defensive — no sequence was found where the wait would otherwise act (focus inside an open
  // dialog is never "lost"), but a wait must not outlive the next dialog (staff r1 S1).
  cancelPendingRestore();
  const entry = {};
  stack.push(entry);
  const anchor = dialog.parentElement;
  const isTop = () => stack[stack.length - 1] === entry;

  // A focused element that CONTAINS the dialog (`<main tabIndex={-1}>`, after a click on the
  // page's text) is not an opener: it is where focus rests when no control has it.
  const origin = opener.find((c) => !c.el.contains(dialog) && !dialog.contains(c.el)) ?? null;

  const active = document.activeElement;
  if (!(active instanceof HTMLElement && dialog.contains(active) && active !== dialog)) {
    initialTarget(dialog).focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (!isTop() || !dialog.isConnected) return;
    if (event.key === "Escape" || event.key === "Esc") {
      // A control inside the dialog that uses Escape itself (and says so) keeps it.
      if (event.defaultPrevented || event.isComposing) return;
      // Changed fields: Escape is a backdrop click, not a Cancel — orchestrator ruling
      // (BUG-171 staff r2), to be recorded by senior-po on BUG-171's row.
      if (escapeHeld()) return;
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
    const stops = tabbables(dialog);
    const now = document.activeElement;
    const inside = now instanceof HTMLElement && dialog.contains(now) && now !== dialog;
    if (stops.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (event.shiftKey ? !inside || now === first : !inside || now === last) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  /**
   * The backstop for what `tabbables` cannot see (a scroll container Chromium makes a tab stop,
   * a script's `focus()`): focus that lands on the page behind the dialog is brought back. An
   * element that CONTAINS the dialog is left alone — a click on the dialog's own text focuses
   * the nearest focusable ancestor, and pulling focus to a field on that click would be wrong.
   */
  function onFocusIn(event: FocusEvent) {
    if (!isTop() || !dialog.isConnected) return;
    const target = event.target;
    if (!(target instanceof Node) || dialog.contains(target) || target.contains(dialog)) return;
    initialTarget(dialog).focus();
  }

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("focusin", onFocusIn);

  return () => {
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("focusin", onFocusIn);
    const at = stack.indexOf(entry);
    if (at >= 0) stack.splice(at, 1);
    restore(origin, anchor);
  };
}

/**
 * Focus goes back to the opener ONCE, and only if nobody else has placed it.
 *
 * Deferred to a microtask, which runs after the passive-effect flush of the commit that closed
 * the dialog. So a caller that moves focus in an EFFECT OF THAT SAME COMMIT (TrialSessionCard's
 * `refocus`, a `returnFocus` effect keyed on the dialog's state) has done so by then, and the
 * Modal leaves focus where it was put (staff, EV-337g2 review N6). A caller that moves focus
 * LATER — in a `requestAnimationFrame`, after an `await`, in a later commit — is not seen: focus
 * then moves twice, first to the opener, then to the caller's target (staff r1 probe P4). Such a
 * caller should move focus from an effect instead.
 *
 * "Lost" means: on the body, on nothing, or on an element containing the dialog's mount point —
 * where focus falls when the focused element inside the dialog is removed, or after a click on
 * the dialog's text.
 *
 * Also safe under React StrictMode's mount → unmount → mount of a dialog that is still open:
 * by the microtask the second mount has put focus back inside the dialog, so nothing moves.
 */
function restore(origin: Candidate | null, anchor: HTMLElement | null): void {
  const isLost = () => {
    const now = document.activeElement;
    return !now || now === document.body || (anchor !== null && anchor.isConnected && now.contains(anchor));
  };
  queueMicrotask(() => {
    if (!isLost()) return;
    const el = origin?.el;
    if (el && el.isConnected && el.matches(":disabled")) {
      waitForOpener(el, origin, isLost);
      return;
    }
    settle(origin, false);
  });
}

/** How long a disabled opener is waited for before the fallback takes focus. */
export const RESTORE_WAIT_MS = 10_000;

/** Ends the one pending wait, if any (there is never more than one). */
let cancelPendingRestore: () => void = () => {};

/** Anything the user does ends a wait: focus is never moved under someone who has acted. */
const USER_INPUT = ["pointerdown", "keydown", "wheel"] as const;

/**
 * The opener is still there but disabled because the dialog's own request is still settling
 * (« Apply to … » stays disabled until the applied week has been read back): focus goes to it as
 * soon as it is enabled again, if focus is still nowhere then. Bounded: a control that stays
 * disabled gets the fallback at RESTORE_WAIT_MS rather than nothing.
 *
 * The wait ENDS, with no focus move, on the first pointer press, key press or wheel turn, and
 * when another dialog opens (staff r1 S1: a module-level wait that outlived its dialog moved
 * focus 10 s later under a coach doing something else). Its focus never scrolls the page.
 */
function waitForOpener(el: HTMLElement, origin: Candidate | null, isLost: () => boolean): void {
  cancelPendingRestore();
  const finish = () => {
    stop();
    if (isLost()) settle(origin, true);
  };
  const observer = new MutationObserver(() => {
    if (!el.matches(":disabled")) finish();
  });
  const timer = window.setTimeout(finish, RESTORE_WAIT_MS);
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
    for (const type of USER_INPUT) document.removeEventListener(type, stop, true);
    if (cancelPendingRestore === stop) cancelPendingRestore = () => {};
  }
  observer.observe(el, { attributes: true, attributeFilter: ["disabled"] });
  for (const type of USER_INPUT) document.addEventListener(type, stop, true);
  cancelPendingRestore = stop;
}

function settle(origin: Candidate | null, late: boolean): void {
  if (origin && tryFocus(origin.el, late)) return;
  // The opener is gone (its menu closed, its row was deleted), disabled or hidden: the first
  // control of its nearest surviving container — RevokeMenu's ⋮ button for « Revoke access »,
  // the next row of a list — and, failing that, the page's main landmark, where the skip link
  // sends focus, rather than the top of the document.
  for (const at of origin?.chain ?? []) {
    if (!at.isConnected) continue;
    if (at.matches("main, [role=main]")) break;
    if (tabbables(at).some((el) => tryFocus(el, late))) return;
  }
  tryFocus(document.getElementById("main"), late);
}
