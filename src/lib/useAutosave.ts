"use client";

import { useEffect, useRef, useState } from "react";
import { AutosaveEngine, type AutosaveSnapshot, type SaveOutcome } from "./autosave";

/**
 * EV-341b — `AutosaveEngine` (`./autosave.ts`) for a component: one engine for the life of the
 * component, its snapshot as state.
 *
 * `send` and the callbacks are read through a ref, so the engine is built once and always
 * calls the latest ones. The engine never touches the form: the consumer passes the WHOLE
 * section with each `change`, and is told through `onSaved` what the server holds.
 *
 * ACCESS ENDED (B14, staff H2 on `4c3b4e5`). `onAccessEnded` must end access THROUGH THE FORM:
 * `form.endAccess(() => router.refresh(), "leaves")`, never a bare `router.refresh()`. While
 * the form is dirty, the unsaved-changes guard holds a sentinel history entry, and a refresh
 * issued while that entry is current never reaches the layout's redirect to /clients/denied;
 * `endAccess` stops guarding, takes the entry out, and only then refreshes. The engine has
 * already stopped every queue and reports `dirty: false`, so the guard cannot re-arm.
 *
 * It never calls `router.refresh()` itself, and nothing it sends is a server action (B3).
 */
export interface UseAutosaveOptions<K extends string, P> {
  versions: Record<K, number>;
  send(key: K, version: number, payload: P): Promise<SaveOutcome>;
  onSaved?(key: K, payload: P, version: number): void;
  onAccessEnded?(): void;
  idleMs?: number;
  retryDelaysMs?: readonly number[];
}

export interface Autosave<K extends string, P> extends AutosaveSnapshot<K> {
  change(key: K, payload: P): void;
  block(key: K): void;
  flush(key: K): void;
  retry(): void;
  reload(key: K, version: number): void;
  endSession(): void;
}

export function useAutosave<K extends string, P>(options: UseAutosaveOptions<K, P>): Autosave<K, P> {
  const latest = useRef(options);
  latest.current = options;
  const engineRef = useRef<AutosaveEngine<K, P> | null>(null);
  const [, setTick] = useState(0);

  if (engineRef.current === null) {
    engineRef.current = new AutosaveEngine<K, P>(
      {
        idleMs: options.idleMs,
        retryDelaysMs: options.retryDelaysMs,
        send: (key, version, payload) => latest.current.send(key, version, payload),
        onSaved: (key, payload, version) => latest.current.onSaved?.(key, payload, version),
        onAccessEnded: () => latest.current.onAccessEnded?.(),
        onChange: () => setTick((n) => n + 1),
      },
      options.versions
    );
  }
  const engine = engineRef.current;

  // The engine outlives re-renders, not the component: timers die with it. `resume` first,
  // because React's development StrictMode unmounts and remounts once on mount, and a
  // disposed engine would otherwise ignore every change for the life of the page.
  useEffect(() => {
    engine.resume();
    return () => engine.dispose();
  }, [engine]);

  const snapshot = engine.snapshot();
  return {
    ...snapshot,
    change: (key, payload) => engine.change(key, payload),
    block: (key) => engine.block(key),
    flush: (key) => engine.flush(key),
    retry: () => engine.retry(),
    reload: (key, version) => engine.reload(key, version),
    endSession: () => engine.endSession(),
  };
}
