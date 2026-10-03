"use client";

import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";

/**
 * BUG-686 and its follow-up — what a coach types into a server-rendered field BEFORE React
 * hydrates it reaches the field's own `onChange`, once, right after hydration.
 *
 * The defect: every form of the portal is server HTML first, and its fields are live as
 * soon as they paint. React 18 hydrates a controlled `<input>`/`<textarea>`/`<select>`
 * WITHOUT resetting the DOM to the controlled value (it only records the DOM's value as the
 * one it has "seen"). So text typed on a slow first load stayed visible while the state
 * behind it was still the server's value: /activate's « Finish my account » stayed disabled
 * on a filled form, every editor (template, recipe, nutrition template, routine, targets,
 * goal) held the server's values under the coach's, and the template editor SAVED the
 * server's name while showing the typed one (witnessed on a862698). Field by field, in
 * Chromium and WebKit: `qa/prehydration-sweep.spec.ts`.
 *
 * The fix: after the component that owns `scope` has hydrated (a mount effect runs after
 * its subtree's hydration commit), each field inside `scope` whose DOM value differs from
 * the value React rendered is REPLAYED as the change event a keystroke would have sent. The
 * field's own handler runs, so its own parsing, validation and "unsaved changes" marking
 * apply exactly as for live typing; nothing here knows any form's state shape.
 *
 * "The value React rendered" is read from the DOM, not from React internals: hydration sets
 * `defaultValue` / `defaultChecked` to the controlled value (React 18's input post-mount),
 * and server HTML marks the controlled option of a `<select>` `selected`, which is its
 * `defaultSelected`.
 *
 * Why a replay needs two writes (text fields, checkboxes, radios): React fires `onChange` only
 * when the node's value differs from the one it last saw, and at hydration it saw the TYPED
 * value. Assigning through the node (`field.value = …`) is what React's value tracker
 * observes, so the field is first set to the rendered value that way, then put back to the
 * typed value through the prototype setter (which the tracker does not observe), and then
 * the event is dispatched. `<select>` needs none of this: React treats every `change` on a
 * select as a change.
 *
 * Two phases; what prevents loss is the snapshot plus the separate task:
 *   1. SNAPSHOT in the mount effect, before anything re-renders. Any re-render of a form
 *      writes every controlled field's value back into its DOM node, so a replay's render
 *      erases what was typed into every field not yet replayed.
 *   2. REPLAY from a task of its own (`setTimeout`), one field at a time, each field given
 *      its typed value back first. Replayed inside the effect instead, the editors lost all
 *      but one field (their handlers close over the render's draft, `setDraft({ ...draft,
 *      … })`, and updates made inside the commit are batched): measured by staff review,
 *      3 of 4 typed fields lost, and `qa/editor-prehydration-input.spec.ts`'s two-field
 *      cases go red under exactly that change. From a task, each dispatched event is
 *      committed before the next one is handled.
 *   `flushSync` around each dispatch is a stated SAFETY NET, not a measured need: removing it
 *   stayed green everywhere (staff review, 2026-10-03). It makes the "committed before the
 *   next" property explicit instead of relying on React's discrete-event flushing.
 *
 * Radios: the option chosen before hydration (checked now, not checked as rendered) is
 * replayed as a click on it, which is how React sees a radio change; the option it
 * displaced needs nothing. Not replayed: `type="file"` and buttons. A textarea whose
 * rendered value is NOT empty never reaches this hook: React 18's hydration writes its text
 * content back into it, so what was typed there is discarded at hydration (shown and held
 * values agree; measured on the recipe steps). StrictMode's second mount clears the first's
 * timer and snapshots the same values again (the dev-server specs run under StrictMode). Whether browser or
 * password-manager AUTOFILL before hydration lands here too was not tested.
 *
 * NEVER ADOPTED: a field marked `data-adopt="never"` is not replayed. It is RESET instead,
 * through the node's normal setter, to the value React rendered, so the screen and the
 * state agree on that value and the person has to act again. The activation consent box is
 * the reason for this (staff ruling, 2026-10-03). A checked box in a fresh document is not
 * proof that this person ticked it in this document: a Back navigation into a new document
 * (back_forward, not the bfcache) has the BROWSER restore the box as ticked. Consent must be
 * the person's own act (BUG-023 / Planet49, ADR-0019), so it is never inferred from the DOM.
 *
 * NOT NEST-SAFE: two adopting scopes, one inside the other, would replay the inner fields
 * twice. That is harmless for a setter. It is not harmless for a handler with an effect:
 * `LanguageSwitch`'s `choose()` would fire `setLocaleAction` twice. Give each field exactly
 * one adopting ancestor.
 */
export function useAdoptPrehydrationInput<T extends HTMLElement>() {
  const scope = useRef<T>(null);
  useEffect(() => {
    if (scope.current) resetNeverAdopted(scope.current);
    const typed = scope.current ? typedBeforeHydration(scope.current) : [];
    if (typed.length === 0) return;
    const timer = setTimeout(() => typed.forEach(replay), 0);
    return () => clearTimeout(timer);
  }, []);
  return scope;
}

const NOT_REPLAYED = new Set(["file", "hidden", "button", "submit", "reset", "image"]);
const NEVER = '[data-adopt="never"]';

/**
 * Puts every `data-adopt="never"` field in `scope` back to what React rendered, visibly. It
 * writes through the node's own setter, which React's value tracker observes, so React's
 * idea of the field and the field itself agree. The state was never changed, so nothing
 * re-renders and no event is sent.
 */
export function resetNeverAdopted(scope: ParentNode) {
  for (const field of Array.from(scope.querySelectorAll(NEVER))) {
    if (field instanceof HTMLInputElement && (field.type === "checkbox" || field.type === "radio")) {
      if (field.checked !== field.defaultChecked) field.checked = field.defaultChecked;
    } else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      if (field.value !== field.defaultValue) field.value = field.defaultValue;
    } else if (field instanceof HTMLSelectElement) {
      for (const option of Array.from(field.options)) option.selected = option.defaultSelected;
    }
  }
}

type Typed =
  | { kind: "text"; field: HTMLInputElement | HTMLTextAreaElement; value: string }
  | { kind: "checkbox"; field: HTMLInputElement; checked: boolean }
  | { kind: "radio"; field: HTMLInputElement }
  | { kind: "select"; field: HTMLSelectElement; value: string };

/** Every field in `scope` whose DOM differs from what React rendered into it. */
export function typedBeforeHydration(scope: ParentNode): Typed[] {
  const out: Typed[] = [];
  for (const field of Array.from(scope.querySelectorAll("input, textarea, select"))) {
    if (field.matches(NEVER)) continue;
    if (field instanceof HTMLSelectElement) {
      if (field.multiple) continue;
      const rendered = Array.from(field.options).find((o) => o.defaultSelected);
      // No option marked: nothing says what React rendered, so nothing is replayed.
      if (rendered && field.value !== rendered.value) out.push({ kind: "select", field, value: field.value });
    } else if (field instanceof HTMLInputElement && field.type === "checkbox") {
      if (field.checked !== field.defaultChecked) out.push({ kind: "checkbox", field, checked: field.checked });
    } else if (field instanceof HTMLInputElement && field.type === "radio") {
      if (field.checked && !field.defaultChecked) out.push({ kind: "radio", field });
    } else if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      if (field instanceof HTMLInputElement && NOT_REPLAYED.has(field.type)) continue;
      if (field.value !== field.defaultValue) out.push({ kind: "text", field, value: field.value });
    }
  }
  return out;
}

/** Writes `prop` without going through any setter installed on the node itself. */
function setUntracked(field: HTMLElement, prop: "value" | "checked", value: string | boolean) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), prop)?.set;
  setter?.call(field, value);
}

/** Puts the typed value back and fires the change React listens for (`flushSync`: see above). */
function replay(typed: Typed) {
  const { field } = typed;
  // An earlier replay may have re-rendered the form without this node.
  if (!field.isConnected) return;
  let event: "input" | "click" | "change";
  if (typed.kind === "select") {
    field.value = typed.value;
    event = "change";
  } else if (typed.kind === "checkbox") {
    typed.field.checked = !typed.checked;
    setUntracked(field, "checked", typed.checked);
    // React's checkbox onChange listens to `click`. A plain Event (not a MouseEvent) has
    // no activation behaviour, so the box is not toggled a second time.
    event = "click";
  } else if (typed.kind === "radio") {
    // React tracks a radio's `checked` too, and also listens to `click` for it.
    typed.field.checked = false;
    setUntracked(field, "checked", true);
    event = "click";
  } else {
    typed.field.value = typed.field.defaultValue;
    setUntracked(field, "value", typed.value);
    event = "input";
  }
  flushSync(() => {
    field.dispatchEvent(new Event(event, { bubbles: true }));
  });
}
