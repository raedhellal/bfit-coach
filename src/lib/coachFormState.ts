/**
 * EV-342o (B2) — the state behind `useCoachForm`, as plain functions.
 *
 * No React here, so the rules can be read and unit-tested on their own
 * (`qa/coach-form-state.spec.ts`). Every function returns a NEW state; the hook applies them
 * with functional updates, because a save's success handler runs after an `await` and a
 * closure over the render's state is stale by then.
 *
 * ═══ THE FOUR FLAGS, AND WHY THEY ARE FOUR ═══════════════════════════════════════════════
 *
 * Each one answers a different question, and folding any two together has already cost a
 * lost edit somewhere in this portal:
 *
 *   · `baseline` — what the SERVER holds: the last seed from props, or the last save it
 *     accepted. "Unsaved" is a value that differs from it (`isDirty`). A value-to-baseline
 *     comparison, not a "was edited" flag, so typing a field back to what is stored is not
 *     unsaved work, a refused save leaves the form unsaved, and anything typed while a save
 *     was in flight stays unsaved after that save lands.
 *   · `edited` — typed since the last save was SENT. It decides re-seeding only: a field the
 *     coach is in the middle of is never overwritten by props (ADR-0033 D33.9; the
 *     `revalidatePath` push arrives in the same tick as the action's result, see
 *     `ProgressGoalBlock`). Cleared on send, so the reply may re-seed what was sent.
 *   · `touched` — typed since the field was last SEEDED from the server. It outlives a
 *     refused save, which `edited` does not: EV-274 B4's body-fat key is sent only when the
 *     text is the coach's, and after a refused save the text still is
 *     (`progress-goal-absent-key-semantics`).
 *   · `abandoned` — the access ended (a 403 on a write). Nothing typed can ever be saved, so
 *     the form stops reporting unsaved work and the guard lets the page go to the denied
 *     screen. The next keystroke, if the page is somehow still there, clears it.
 *
 * `seen` is the signature of the last server prop this form was GIVEN, never of anything it
 * saved (`an-island-must-re-seed-from-props-not-from-its-own-save`).
 */

export type FormValue = string | boolean | readonly string[];
export type FormValues = Record<string, FormValue>;
/** Any object whose fields are form values: an `interface` qualifies, unlike `FormValues`. */
export type FormShape<V> = { [K in keyof V]: FormValue };

type Flags<V> = Record<keyof V, boolean>;
export type FieldErrors<V> = Partial<Record<keyof V, string>>;

export interface CoachFormState<V extends FormShape<V>> {
  values: V;
  baseline: V;
  /** What the last `markSent` sent; the baseline after a success that echoes nothing. */
  sent: V | null;
  edited: Flags<V>;
  touched: Flags<V>;
  errors: FieldErrors<V>;
  seen: string;
  abandoned: boolean;
}

export function sameValue(a: FormValue, b: FormValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => item === b[i]);
  }
  return a === b;
}

/** The server values' identity. Key order is the caller's object literal, which is stable. */
export function signatureOf(values: object): string {
  return JSON.stringify(values);
}

function flags<V extends FormShape<V>>(values: V, on: boolean): Flags<V> {
  const out = {} as Flags<V>;
  for (const key of Object.keys(values) as (keyof V)[]) out[key] = on;
  return out;
}

/** A clean form: every field shows, and is measured against, what the server sent. */
export function seedForm<V extends FormShape<V>>(server: V): CoachFormState<V> {
  return {
    values: server,
    baseline: server,
    sent: null,
    edited: flags(server, false),
    touched: flags(server, false),
    errors: {},
    seen: signatureOf(server),
    abandoned: false,
  };
}

/** Is there work the server has not got? What the unsaved-changes guard is armed by. */
export function isDirty<V extends FormShape<V>>(state: CoachFormState<V>): boolean {
  if (state.abandoned) return false;
  return (Object.keys(state.values) as (keyof V)[]).some(
    (key) => !sameValue(state.values[key], state.baseline[key])
  );
}

/** The coach changed one field. Its own error goes: the sentence was about the old value. */
export function editField<V extends FormShape<V>, K extends keyof V>(
  state: CoachFormState<V>,
  key: K,
  value: V[K]
): CoachFormState<V> {
  const errors = { ...state.errors };
  delete errors[key];
  return {
    ...state,
    values: { ...state.values, [key]: value },
    edited: { ...state.edited, [key]: true },
    touched: { ...state.touched, [key]: true },
    errors,
    abandoned: false,
  };
}

/**
 * New props from the server (a route render, a `revalidatePath` push). Every field the
 * coach is NOT in the middle of takes the server's value and is the server's again
 * (`touched` cleared); an `edited` field keeps the coach's text and its flags. The baseline
 * becomes the server's in full either way: that is what the server holds now, and an
 * edited field that differs from it is unsaved work.
 */
export function reseedFromServer<V extends FormShape<V>>(
  state: CoachFormState<V>,
  server: V
): CoachFormState<V> {
  const values = { ...server };
  const touched = { ...state.touched };
  for (const key of Object.keys(server) as (keyof V)[]) {
    if (state.edited[key]) values[key] = state.values[key];
    else touched[key] = false;
  }
  return { ...state, values, baseline: server, touched, seen: signatureOf(server) };
}

/** A save is on its way: what is on screen is the coach's settled intent until re-typed. */
export function markSent<V extends FormShape<V>>(state: CoachFormState<V>): CoachFormState<V> {
  return { ...state, sent: state.values, edited: flags(state.values, false) };
}

/**
 * The server accepted the save. `stored` is its answer in the form's terms when it has one
 * (a clamped calorie target, a re-formatted milestone); otherwise what was sent is what is
 * stored. Fields typed since the send keep the coach's text and stay unsaved; every other
 * field is the server's again (`touched` cleared).
 */
export function markSaved<V extends FormShape<V>>(state: CoachFormState<V>, stored?: V): CoachFormState<V> {
  const baseline = stored ?? state.sent ?? state.values;
  const values = { ...state.values };
  const touched = { ...state.touched };
  for (const key of Object.keys(baseline) as (keyof V)[]) {
    if (state.edited[key]) continue;
    values[key] = baseline[key];
    touched[key] = false;
  }
  return { ...state, values, baseline, sent: null, touched, errors: {}, abandoned: false };
}

/** Start over from `values` (a dialog opened afresh). Nothing is unsaved after this. */
export function resetForm<V extends FormShape<V>>(state: CoachFormState<V>, values: V): CoachFormState<V> {
  return { ...seedForm(values), seen: state.seen };
}
