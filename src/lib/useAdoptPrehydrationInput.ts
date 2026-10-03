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
 * Two phases, both forced by what the first two attempts did (measured 2026-10-03):
 *   1. SNAPSHOT in the mount effect, before anything re-renders. Any re-render of a form
 *      writes every controlled field's value back into its DOM node, so the first replay's
 *      render ERASED what was typed into every field not yet replayed.
 *   2. REPLAY one field at a time, each committed before the next (`flushSync`), from a task
 *      of its own (`setTimeout`: a passive effect runs inside React's commit, where
 *      `flushSync` cannot flush). Replayed in one batch, the editors kept only the last
 *      field: their handlers close over the render's draft (`setDraft({ ...draft, … })`),
 *      so each replay overwrote the one before with the server's values. A keystroke never
 *      meets either problem, because each one gets its own render.
 * Before its replay, each field is given its typed value back.
 *
 * Radios: the option chosen before hydration (checked now, not checked as rendered) is
 * replayed as a click on it, which is how React sees a radio change; the option it
 * displaced needs nothing. Not replayed: `type="file"` and buttons. A textarea whose
 * rendered value is NOT empty never reaches this hook: React 18's hydration writes its text
 * content back into it, so what was typed there is discarded at hydration (shown and held
 * values agree; measured on the recipe steps). StrictMode's second mount clears the first's
 * timer and snapshots the same values again (the dev-server specs run under StrictMode). Whether browser or
 * password-manager AUTOFILL before hydration lands here too was not tested.
 */
export function useAdoptPrehydrationInput<T extends HTMLElement>() {
  const scope = useRef<T>(null);
  useEffect(() => {
    const typed = scope.current ? typedBeforeHydration(scope.current) : [];
    if (typed.length === 0) return;
    const timer = setTimeout(() => typed.forEach(replay), 0);
    return () => clearTimeout(timer);
  }, []);
  return scope;
}

const NOT_REPLAYED = new Set(["file", "hidden", "button", "submit", "reset", "image"]);

type Typed =
  | { kind: "text"; field: HTMLInputElement | HTMLTextAreaElement; value: string }
  | { kind: "checkbox"; field: HTMLInputElement; checked: boolean }
  | { kind: "radio"; field: HTMLInputElement }
  | { kind: "select"; field: HTMLSelectElement; value: string };

/** Every field in `scope` whose DOM differs from what React rendered into it. */
export function typedBeforeHydration(scope: ParentNode): Typed[] {
  const out: Typed[] = [];
  for (const field of Array.from(scope.querySelectorAll("input, textarea, select"))) {
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

/** Puts the typed value back and fires the change React listens for, committed at once. */
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
