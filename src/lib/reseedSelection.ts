/**
 * BUG-1070 — a re-seed keeps the selection the coach is holding in the field it rewrites.
 *
 * `useCoachForm` writes the server's text into every field the coach has not typed in since
 * the send: on a successful save (`markSaved`) and on a server push (`reseedFromServer`). That
 * text is canonical (`60.00` comes back `60`, `20,5` comes back `20.5` on an English page), and
 * a browser that is given a different `value` for a focused `<input>` collapses its selection
 * to a caret at the end (witnessed in Chromium only; WebKit is not installed on the rig).
 * A coach who had selected the whole field during « Saving… » to replace it then had their next
 * keystroke APPENDED to the server's text: `60.00` → `603`, and `5.0` → `53`, which is in range.
 *
 * The re-seed still happens, so « Saved » is true of what is on screen; only the selection is
 * carried over, for the two shapes whose meaning survives any rewrite of the text:
 *
 *   · the whole text selected → the whole new text selected;
 *   · a caret at the end → a caret at the end of the new text.
 *
 * Anything else (a partial selection, a caret inside the text) is left to the browser: how it
 * maps from `60.00` to `60` is not defined (BUG-1070's ruling, Out).
 *
 * Nothing here reads or changes what counts as unsaved: it is the DOM half of a re-seed that
 * `coachFormState.ts` has already decided.
 *
 * It relies on one condition: every consumer renders the field's `value` from `form.values` (as
 * `value={form.values[key]}`, or through a prop derived from it in the same render), so React
 * writes the re-seeded text into the input in the same commit as the state change, and the hook's
 * layout effect runs right after that write. The four consumers that attach `scope`
 * (ProgressGoalBlock, NutritionTargetsCard, NutritionTemplateEditor, IntakeInterview) do, checked
 * at this commit; CreateChallengeDialog attaches no `scope`, so it is never held.
 */

import type { FormValue } from "./coachFormState";

type TextField = HTMLInputElement | HTMLTextAreaElement;

/** A selection to put back once React has written `to` into `field`. */
export interface HeldSelection {
  field: TextField;
  /** The text the selection was taken over, and the text the re-seed writes. */
  from: string;
  to: string;
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
}

/** Where a selection over `from` lands in `to`, or null when it has no defined place there. */
export function mapSelection(from: string, start: number, end: number, to: string): [number, number] | null {
  if (from.length > 0 && start === 0 && end === from.length) return [0, to.length];
  if (start === end && end === from.length) return [to.length, to.length];
  return null;
}

function isTextField(el: Element | null): el is TextField {
  return (
    (typeof HTMLInputElement !== "undefined" && el instanceof HTMLInputElement) ||
    (typeof HTMLTextAreaElement !== "undefined" && el instanceof HTMLTextAreaElement)
  );
}

/**
 * Before a re-seed from `before` to `after` is committed: if the focused text field inside
 * `scope` shows a field's text that the re-seed changes, hold its selection. Null when the form
 * attaches no `scope`, when nothing focused inside it is rewritten, or when the selection has no
 * defined place in the new text.
 */
export function holdSelection(
  scope: HTMLElement | null,
  before: Record<string, FormValue>,
  after: Record<string, FormValue>
): HeldSelection | null {
  if (scope === null || typeof document === "undefined") return null;
  const field = document.activeElement;
  if (!isTextField(field) || !scope.contains(field)) return null;
  const from = field.value;
  let to: string | null = null;
  for (const key of Object.keys(after)) {
    const old = before[key];
    const next = after[key];
    if (typeof old === "string" && typeof next === "string" && old === from && next !== old) {
      to = next;
      break;
    }
  }
  if (to === null) return null;
  let start: number | null;
  let end: number | null;
  try {
    // On an input type with no selection (`number`, `date`) the spec has these getters return
    // null, so the try is only a guard, not a path any witnessed engine takes. (It is
    // `setSelectionRange` that throws, an `InvalidStateError`, which `restoreSelection` catches.)
    start = field.selectionStart;
    end = field.selectionEnd;
  } catch {
    return null;
  }
  if (start === null || end === null) return null;
  const mapped = mapSelection(from, start, end, to);
  if (mapped === null) return null;
  return { field, from, to, start: mapped[0], end: mapped[1], direction: field.selectionDirection ?? "none" };
}

/**
 * After a commit. `"wait"`: the re-seed has not reached the field yet (a commit before it).
 * `"done"`: the selection was put back, or there is nothing left to do (the field holds some
 * other text, or lost focus) and the hold should be dropped.
 */
export function restoreSelection(held: HeldSelection): "wait" | "done" {
  const { field } = held;
  if (!field.isConnected || document.activeElement !== field) return "done";
  if (field.value === held.from) return "wait";
  if (field.value === held.to) {
    try {
      field.setSelectionRange(held.start, held.end, held.direction);
    } catch {
      // An input type with no selection: nothing to put back.
    }
  }
  return "done";
}
