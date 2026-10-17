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
//             never over a focus move the caller made in the same commit: see `restore`. If the
//             control focus went back to is REMOVED soon after (the list refresh that follows a
//             confirmed delete takes its row), focus moves on to the next row, else the
//             previous one, else the list's container: see `guardRestored` (BUG-838);
//   · steps   focus that drops to `<body>` while the dialog is open (the pressed control was
//             replaced by the dialog's next step) is put back inside it (BUG-839);
//   · chains  a dialog opened from a control of a dialog that closed in the same change (pick a
//             trainee → confirm) hands focus back to what opened the FIRST one (BUG-840).
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
  /**
   * Per level of `chain`: the element siblings AFTER / BEFORE that level's child on the path to
   * `el` (`el` itself at level 0), nearest first. Read with the chain, so that when the child is
   * later removed — a list row — its neighbours are still known: BUG-838.
   */
  after: HTMLElement[][];
  before: HTMLElement[][];
}

/** What a dialog may hand focus back to, best first. */
export type Opener = Candidate[];

function candidate(el: Element | null): Candidate | null {
  if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) return null;
  const chain: HTMLElement[] = [];
  const after: HTMLElement[][] = [];
  const before: HTMLElement[][] = [];
  let child: HTMLElement = el;
  for (let at = el.parentElement; at && at !== document.body; child = at, at = at.parentElement) {
    chain.push(at);
    const next: HTMLElement[] = [];
    for (let s = child.nextElementSibling; s; s = s.nextElementSibling) if (s instanceof HTMLElement) next.push(s);
    const prev: HTMLElement[] = [];
    for (let s = child.previousElementSibling; s; s = s.previousElementSibling) if (s instanceof HTMLElement) prev.push(s);
    after.push(next);
    before.push(prev);
  }
  return { el, chain, after, before };
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
 * BUG-840 — the origin of each dialog that has closed, by its element. A dialog opened from a
 * control INSIDE a dialog that is no longer in the document (« Use on a trainee » → pick a
 * trainee → the confirm, which replaces the pick in one state change) inherits that dialog's
 * origin: the trainee button it was opened from is gone with the pick, and its ancestors lead
 * only to the library's first control. A dialog opened from one that is still OPEN (nested)
 * keeps its own opener. Weak: a closed dialog's element is garbage once nothing refers to it.
 */
const closedOrigins = new WeakMap<HTMLElement, Candidate | null>();

/**
 * BUG-839 — how long focus that dropped to `<body>` inside an open dialog is left there before
 * the dialog takes it back. Not zero: a caller that places focus itself after a step change
 * does so from a passive effect (EV-341y2's CatalogPicker moves, which do nothing when focus is
 * no longer on `<body>`), and after an `await` React runs those effects in a later task than the
 * DOM change. The dialog must come after them, not race them.
 *
 * It covers effects of the commit that changed the step — about one task — and nothing later.
 * A caller that places focus in a LATER commit (an effect keyed on data that arrives after the
 * step change) loses: the dialog has already moved focus to the step's first control, so the
 * caller's "only while focus is on `<body>`" check finds it taken. Focus is still inside the
 * dialog, never lost, but it is not where the caller wanted. Such a caller should not race at
 * all: mark the step's target with `data-autofocus`, which `initialTarget` honours whenever the
 * regain runs (staff, BUG-838/839/840 review N2).
 */
const REGAIN_DELAY_MS = 16;

const onBody = () => {
  const now = document.activeElement;
  return !now || now === document.body;
};

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
  // A dialog opening now owns focus: a previous dialog's wait for its disabled opener, or its
  // watch on the control it restored focus to (BUG-838), ends here.
  // Defensive — no sequence was found where the wait would otherwise act (focus inside an open
  // dialog is never "lost"), but a wait must not outlive the next dialog (staff r1 S1).
  cancelPendingRestore();
  const entry = {};
  stack.push(entry);
  const anchor = dialog.parentElement;
  const isTop = () => stack[stack.length - 1] === entry;

  // A focused element that CONTAINS the dialog (`<main tabIndex={-1}>`, after a click on the
  // page's text) is not an opener: it is where focus rests when no control has it.
  let origin = opener.find((c) => !c.el.contains(dialog) && !dialog.contains(c.el)) ?? null;
  // BUG-840: opened from inside a dialog that has closed — what opened THAT dialog is the opener.
  const host = origin?.chain.find((at) => closedOrigins.has(at));
  if (host && !host.isConnected) origin = closedOrigins.get(host) ?? null;

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

  /**
   * BUG-839 — the step change. A dialog that replaces its content while open (trial « Start from
   * a template » → the day, the add-client form → « Account set up », « Swap meal » → « Choose … »)
   * removes the control that was pressed, and focus falls to `<body>` with no event to catch:
   * `focusin` does not fire for the body. Any change to the dialog's tree is the signal; focus
   * that is then on `<body>` — and still there REGAIN_DELAY_MS later, after the caller's own
   * effects — goes to the dialog's initial target: the new step's first control.
   *
   * Only the tree is watched, not `disabled`. A focused button that becomes disabled also drops
   * focus to `<body>` (Chromium), but that is a confirm's request running — TemplateLibrary's
   * dialogs disable Cancel and the action while pending — not a new step: re-homing then put
   * focus on × for the whole request, and on × after a failed one (staff S1, BUG-838/839/840
   * review). Focus stays on `<body>` until the dialog closes and `restore` places it, as before
   * BUG-839; a later step or an error message inserted into the dialog is a tree change and
   * still re-homes. TrialSessionCard keeps its « Assign » enabled while busy for this reason.
   */
  let regain = 0;
  const lost = new MutationObserver(() => {
    if (regain || !isTop() || !dialog.isConnected || !onBody()) return;
    regain = window.setTimeout(() => {
      regain = 0;
      if (isTop() && dialog.isConnected && onBody()) initialTarget(dialog).focus();
    }, REGAIN_DELAY_MS);
  });
  lost.observe(dialog, { childList: true, subtree: true });

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("focusin", onFocusIn);

  return () => {
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("focusin", onFocusIn);
    lost.disconnect();
    window.clearTimeout(regain);
    const at = stack.indexOf(entry);
    if (at >= 0) stack.splice(at, 1);
    closedOrigins.set(dialog, origin);
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

/** Ends the one pending wait — or removal watch (`guardRestored`) — if any (never more than one). */
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
  const placed = origin && tryFocus(origin.el, late) ? origin.el : rehome(origin, late, true);
  if (placed && placed !== document.getElementById("main")) guardRestored(placed);
}

/** `root` itself when it is a Tab stop, then the Tab stops inside it. */
function stopsIn(root: HTMLElement): HTMLElement[] {
  const self = root.matches(TABBABLE) && root.tabIndex >= 0 && rendered(root) ? [root] : [];
  return [...self, ...tabbables(root)];
}

/**
 * Where focus goes when `origin.el` cannot take it. Returns the element that took focus.
 *
 * The opener is gone (its menu closed, its row was deleted), disabled or hidden: walk up its
 * ancestors to the nearest one still in the document. Where the child on the path was REMOVED
 * (a deleted row), its nearest surviving sibling after it — the next row of a list — else the
 * nearest before it — the previous row — takes focus, on its first control (BUG-838). Failing
 * that (or where the opener is still there but disabled: O-1, « Save draft »), the first control
 * of that ancestor — RevokeMenu's ⋮ button for « Revoke access », a library's « New template »
 * once its last row is gone. With `landmark`, the page's main landmark is the last resort, where
 * the skip link sends focus, rather than the top of the document.
 */
function rehome(origin: Candidate | null, late: boolean, landmark: boolean): HTMLElement | null {
  const { el, chain, after, before } = origin ?? { el: null, chain: [], after: [], before: [] };
  for (let i = 0; i < chain.length; i++) {
    const at = chain[i];
    if (!at.isConnected) continue;
    if (at.matches("main, [role=main]")) break;
    const child = i === 0 ? el : chain[i - 1];
    if (child && !child.isConnected) {
      for (const sibling of [...after[i], ...before[i]]) {
        if (sibling.parentElement !== at) continue;
        const hit = stopsIn(sibling).find((stop) => tryFocus(stop, late));
        if (hit) return hit;
      }
    }
    const hit = tabbables(at).find((stop) => tryFocus(stop, late));
    if (hit) return hit;
  }
  const main = document.getElementById("main");
  return landmark && tryFocus(main, late) ? main : null;
}

/**
 * BUG-838 — the control focus was handed back to is removed AFTER the hand-back. A confirmed
 * delete closes its dialog, the restore focuses the row's « Delete » (still there), and the
 * list refresh that follows removes the row ~35 ms later: focus fell to `<body>`, and the
 * fallback above never ran because the restore had succeeded.
 *
 * So the restored control is watched, for RESTORE_WAIT_MS: removed while it held focus, focus
 * goes to its next row, else the previous one, else the surviving container's first control
 * (`rehome`, from where the control was when it took focus), and that control is watched for
 * the rest of the window. Never to `<main>`: a control removed with every one of its ancestors
 * up to the main landmark went with a new page (a navigation), which is not this dialog's to
 * place. The watch ENDS, with no focus move, on any user input (USER_INPUT), on focus going
 * anywhere else, and when another dialog opens — as the disabled-opener wait does.
 */
function guardRestored(el: HTMLElement, until = Date.now() + RESTORE_WAIT_MS): void {
  const where = candidate(el);
  if (!where) return;
  cancelPendingRestore();
  const observer = new MutationObserver(() => {
    if (el.isConnected) return;
    stop();
    if (!onBody()) return;
    const next = rehome(where, true, false);
    if (next && Date.now() < until) guardRestored(next, until);
  });
  const timer = window.setTimeout(() => stop(), Math.max(0, until - Date.now()));
  function onFocusIn(event: FocusEvent) {
    if (event.target !== el) stop();
  }
  function stop() {
    observer.disconnect();
    window.clearTimeout(timer);
    for (const type of USER_INPUT) document.removeEventListener(type, stop, true);
    document.removeEventListener("focusin", onFocusIn, true);
    if (cancelPendingRestore === stop) cancelPendingRestore = () => {};
  }
  observer.observe(document.body, { childList: true, subtree: true });
  for (const type of USER_INPUT) document.addEventListener(type, stop, true);
  document.addEventListener("focusin", onFocusIn, true);
  cancelPendingRestore = stop;
}
