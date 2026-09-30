"use client";

import { createContext, useContext } from "react";
import type { Copy } from "../copy";
import { copyFor } from "./dictionaries";
import type { Locale } from "./locale";

/**
 * EV-324 — the dictionary for client components.
 *
 * The root layout decides the locale on the server (`getLocale`) and hands it to this
 * provider as a STRING. The dictionary itself cannot cross the server/client boundary —
 * it holds functions — so each side resolves the same string to the same object through
 * `copyFor`, and the server render and the hydration agree by construction.
 *
 * There is no default value: a client component rendered outside the provider throws,
 * rather than quietly speaking English to a French coach.
 */
const CopyContext = createContext<Copy | null>(null);

export function CopyProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <CopyContext.Provider value={copyFor(locale)}>{children}</CopyContext.Provider>;
}

/** `const copy = useCopy();` at the top of a client component. */
export function useCopy(): Copy {
  const copy = useContext(CopyContext);
  if (!copy) throw new Error("useCopy() outside <CopyProvider> — the root layout mounts it.");
  return copy;
}
