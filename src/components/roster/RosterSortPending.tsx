"use client";

import { createContext, useContext, useTransition, type ReactNode } from "react";

type SortTransition = { pending: boolean; startTransition: ReturnType<typeof useTransition>[1] };

const SortTransitionContext = createContext<SortTransition | null>(null);

/**
 * Fluidity batch 1, F3 — the roster sort's ONE transition, shared by the toggle that starts
 * it and the list it re-orders. They are siblings in the server-rendered page, so the
 * pending state has to live above both: the toggle shows the chosen order at once, and the
 * rows say they are being re-ordered (`aria-busy`, dimmed) until the server's order lands.
 * The rows themselves still re-order only when the server answers (`RosterBrowser`: the
 * sort key spans the whole roster, so the browser never sorts).
 *
 * Renders no element: wrapping the page's nodes changes no layout.
 */
export function RosterSortPending({ children }: { children: ReactNode }) {
  const [pending, startTransition] = useTransition();
  return <SortTransitionContext.Provider value={{ pending, startTransition }}>{children}</SortTransitionContext.Provider>;
}

/** The shared sort transition; a toggle rendered outside the provider gets its own. */
export function useRosterSortTransition(): SortTransition {
  const [pending, startTransition] = useTransition();
  return useContext(SortTransitionContext) ?? { pending, startTransition };
}

/** Whether a sort is on its way (false outside the provider). */
export function useRosterSortPending(): boolean {
  return useContext(SortTransitionContext)?.pending ?? false;
}
