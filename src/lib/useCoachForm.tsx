"use client";

import { useCallback, useRef, useState, type ReactElement, type RefObject } from "react";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import {
  editField,
  isDirty,
  markSaved,
  markSent,
  reseedFromServer,
  resetForm,
  seedForm,
  signatureOf,
  type CoachFormState,
  type FieldErrors,
  type FormShape,
} from "./coachFormState";
import { useAdoptPrehydrationInput } from "./useAdoptPrehydrationInput";
import { useUnsavedChanges } from "./useUnsavedChanges";

/**
 * EV-342o (B2) — one way to build a coach-portal form.
 *
 * Every portal form used to hand-roll the same five things, and the ones that forgot one
 * shipped the gap (BUG-665: four forms with no leave guard). This hook gives them by
 * construction:
 *
 *   1. **a field registry** — `values` (the fields are the keys of `server`) and `set(key, value)`;
 *   2. **a dirty flag** — work the server has not got (`coachFormState.ts` says why it is a
 *      comparison with the server's values, not an "edited" flag);
 *   3. **per-field errors** — `errors[key]`, set by the caller (a code → sentence map, or the
 *      api's declared field path), and cleared when that field changes;
 *   4. **pre-hydration adoption** — `scope` is `useAdoptPrehydrationInput`'s ref (BUG-686 /
 *      BUG-687). Put it on ONE element holding the fields (the kit `Card` takes `rootRef`).
 *      The adoption scopes are not nest-safe, so a form built with this hook must not sit
 *      inside another adopting scope;
 *   5. **the unsaved-changes guard** — `useUnsavedChanges(dirty)` is called here, and
 *      `guard` is its dialog. Render `{form.guard}` once, after the form's own markup.
 *
 * And it re-seeds from the server's props by itself (ADR-0033 D33.9): pass the server's
 * values as `server` on every render. When they change, every field the coach is not in the
 * middle of takes the new value; a field typed since the last send keeps the coach's text.
 *
 * ═══ THE SAVE PROTOCOL ═══════════════════════════════════════════════════════════════════
 *
 *   form.markSent();                     // before the request: what is shown is what is sent
 *   const result = await settled(...);
 *   if (result.ok) form.saved(stored?);  // the server's answer, in the form's terms
 *   else if (access ended) form.endAccess(() => router.refresh());
 *   else form.setErrors({...});          // and the work stays unsaved
 *
 * A save that NAVIGATES (a create that goes to a list, a dialog that opens what it made)
 * passes the navigation as `saved(stored, then)`: the guard holds a sentinel history entry
 * while the form is dirty, and a `router.push` over it leaves a dead Back press, after which
 * the guard's cleanup would step the coach back off the page they were sent to.
 *
 * ONE GUARDED FORM PER PAGE. Each form built with this hook runs its own
 * `useUnsavedChanges`: two dirty on one page would each push a history entry and each
 * capture a link click (document-level capture listeners; `stopPropagation` does not stop a
 * sibling listener on the same node), so the coach would get two stacked questions, and
 * Leave in one would re-arm the other through its popstate. No page has two today (the
 * overview holds the progress goal only, the nutrition tab the targets only). A page that
 * needs several sections (EV-341b's intake) builds them as ONE form, or lifts the guard
 * out of the sections first.
 */
export interface CoachForm<V extends FormShape<V>> {
  values: V;
  /** Work the server has not got, and the guard is armed (see `enabled`). */
  dirty: boolean;
  errors: FieldErrors<V>;
  set<K extends keyof V>(key: K, value: V[K]): void;
  /** Typed since the field was last seeded from the server (survives a refused save). */
  touched(key: keyof V): boolean;
  setErrors(errors: FieldErrors<V>): void;
  markSent(): void;
  /** The server accepted the save; `then`: a navigation it leads to (see the protocol). */
  saved(stored?: V, then?: () => void): void;
  reset(values: V): void;
  /** A 403 on a write: stop guarding (nothing can be saved), then `then` (a refresh). */
  endAccess(then: () => void): void;
  scope: RefObject<HTMLDivElement>;
  guard: ReactElement;
}

export function useCoachForm<V extends FormShape<V>>({
  server,
  enabled = true,
}: {
  /** The server's values for the fields, in the form's terms (strings for text fields). */
  server: V;
  /** False while the form is not on screen (a closed dialog): nothing to guard then. */
  enabled?: boolean;
}): CoachForm<V> {
  const [state, setState] = useState<CoachFormState<V>>(() => seedForm(server));

  // D33.9 — compared during render with the last prop this form was GIVEN, as the progress
  // goal block always did; React re-renders at once with the re-seeded state.
  const signature = signatureOf(server);
  let current = state;
  if (signature !== state.seen) {
    current = reseedFromServer(state, server);
    setState((s) => (s.seen === signature ? s : reseedFromServer(s, server)));
  }

  const dirty = enabled && isDirty(current);
  const leaving = useUnsavedChanges(dirty);
  const scope = useAdoptPrehydrationInput<HTMLDivElement>();
  /** The state as last rendered, for `saved` to decide synchronously (see there). */
  const latest = useRef(current);
  latest.current = current;

  const set = useCallback(<K extends keyof V>(key: K, value: V[K]) => {
    setState((s) => editField(s, key, value));
  }, []);

  const { release } = leaving;

  /**
   * The save landed. If nothing is unsaved after it, the guard's history entry is handed
   * back NOW, inside the save's own callback, before the « Enregistré » render commits, as
   * the three older editors do (`leaving.release()` after a save). Left to the guard's
   * effect cleanup instead, the `history.back()` that removes the entry ran AFTER that
   * render painted, and a reload in that window was aborted by the traversal (witnessed:
   * `coach-progress-goal.spec.ts` "editing only the start date…", 2 of 3 runs,
   * `net::ERR_ABORTED`). Anything typed during the save keeps the form dirty, and then
   * nothing is released.
   *
   * `then` is a navigation the save leads to (a create that opens the list). It runs after
   * the entry is gone, whatever was typed meanwhile: `release` must be called ONCE per
   * save, since a second call before the first's popstate would step back twice.
   */
  const saved = useCallback(
    (stored?: V, then?: () => void) => {
      const next = markSaved(latest.current, stored);
      if (then) release(then);
      else if (!isDirty(next)) release();
      setState((s) => markSaved(s, stored));
    },
    [release]
  );

  const endAccess = useCallback(
    (then: () => void) => {
      setState((s) => ({ ...s, abandoned: true }));
      release(then);
    },
    [release]
  );

  const values = current.values;
  return {
    values,
    dirty,
    errors: current.errors,
    set,
    touched: (key) => current.touched[key],
    setErrors: useCallback((errors: FieldErrors<V>) => setState((s) => ({ ...s, errors })), []),
    markSent: useCallback(() => setState((s) => markSent(s)), []),
    saved,
    reset: useCallback((next: V) => setState((s) => resetForm(s, next)), []),
    endAccess,
    scope,
    guard: <UnsavedChangesDialog leaving={leaving} />,
  };
}
