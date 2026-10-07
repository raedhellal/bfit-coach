/// <reference types="react/canary" />
"use client";

import { createContext, use, useContext } from "react";
import type { Copy } from "../copy";
import { isLocale, type Locale } from "./locale";

/**
 * EV-324 — the dictionary for client components.
 *
 * The root layout decides the locale on the server (`getLocale`) and hands it to this
 * provider as a STRING. The dictionary itself cannot cross the server/client boundary —
 * it holds functions — so each side resolves the same string to the same object, and the
 * server render and the hydration agree by construction.
 *
 * There is no default value: a client component rendered outside the provider throws,
 * rather than quietly speaking English to a French coach.
 *
 * EV-342m (audit A19) — ONLY the coach's language reaches the browser. This module used
 * to import `copyFor` from `dictionaries.ts`, which imports both dictionaries statically,
 * and because the root layout mounts this provider, every client chunk group carried
 * both: ~122 KB raw / ~36 KB gzip in one chunk on every signed-in route, half of it in a
 * language the page never shows. Now each dictionary is a separate dynamic `import()`,
 * so webpack emits it as its own chunk outside every route's first-load set, and the
 * browser fetches the one the page is in.
 *
 *   · The fetch is started as soon as this module is evaluated, from `<html lang>` (which
 *     the root layout sets from the same `getLocale`), so it does not wait for React to
 *     render the provider. The provider then `use()`s the same promise: during hydration
 *     it waits for that one chunk, with the server's HTML on screen the whole time.
 *   · The server never waits after the first request: the promise is resolved once per
 *     process and the object is read synchronously from `loaded` after that.
 *   · The FR/EN switch (`setLocaleAction`) re-renders the layout with the other locale
 *     inside a transition: the provider suspends on the other chunk and React keeps the
 *     current page until it arrives, then swaps every string at once.
 *   · A chunk that fails to load is forgotten, so the next render asks again; the error
 *     itself goes to the nearest error boundary, never to an English fallback.
 *
 * `dictionaries.ts` (both, statically) stays the SERVER's accessor: a server bundle's
 * size costs the browser nothing.
 */
const CopyContext = createContext<Copy | null>(null);
const LocaleContext = createContext<Locale | null>(null);

const loaded: Partial<Record<Locale, Copy>> = {};
const pending: Partial<Record<Locale, Promise<Copy>>> = {};

function load(locale: Locale): Promise<Copy> {
  const inFlight = pending[locale];
  if (inFlight) return inFlight;
  const request = (
    locale === "fr"
      ? import("../copy.fr").then((m): Copy => m.fr)
      : import("../copy").then((m): Copy => m.en)
  ).then(
    (copy) => (loaded[locale] = copy),
    (err: unknown) => {
      delete pending[locale];
      throw err;
    }
  );
  pending[locale] = request;
  return request;
}

if (typeof document !== "undefined") {
  const lang = document.documentElement.lang;
  // Started now, read in render below; a failure here is reported by that render.
  if (isLocale(lang)) load(lang).catch(() => undefined);
}

export function CopyProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const copy = loaded[locale] ?? use(load(locale));
  return (
    <LocaleContext.Provider value={locale}>
      <CopyContext.Provider value={copy}>{children}</CopyContext.Provider>
    </LocaleContext.Provider>
  );
}

/**
 * BUG-689 — the locale string, for a client component that must draw what a server one
 * draws with `getLocale()` (the error boundary's shell: its language switch shows it).
 */
export function useLocale(): Locale {
  const locale = useContext(LocaleContext);
  if (!locale) throw new Error("useLocale() outside <CopyProvider> — the root layout mounts it.");
  return locale;
}

/** `const copy = useCopy();` at the top of a client component. */
export function useCopy(): Copy {
  const copy = useContext(CopyContext);
  if (!copy) throw new Error("useCopy() outside <CopyProvider> — the root layout mounts it.");
  return copy;
}
