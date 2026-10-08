/// <reference types="react/canary" />
"use client";

import { createContext, use, useContext } from "react";
import type { Copy } from "../copy";
import { isLocale, type Locale } from "./locale";
import { setLocaleAction } from "./actions";
import { hasUnsavedWork } from "../useUnsavedChanges";

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
 *   · EV-350: by then the chunk is usually already arriving. The root layout's document
 *     carries a `preload` hint for this language's chunk (`chunk.ts`), so its request leaves
 *     in the first wave instead of one round trip after it, and this `import()` reuses that
 *     response. The `webpackChunkName`s below are load-bearing: next.config.mjs names the
 *     files after them and fails a production build that does not emit both. A browser
 *     that ignores the hint still gets the chunk from here, one round trip later.
 *   · The server never waits after the first request: the promise is resolved once per
 *     process and the object is read synchronously from `loaded` after that.
 *   · The FR/EN switch (`setLocaleAction`) re-renders the layout with the other locale
 *     inside a transition: the provider suspends on the other chunk and React keeps the
 *     current page until it arrives, then swaps every string at once.
 *   · A chunk that fails to load reloads the page ONCE (`reloadOnce`). The likely cause
 *     is a deploy between the tab's load and this fetch: the old hashed chunk is gone
 *     (404, unless the host keeps old deployments' assets), and a reload gets the new
 *     deployment's HTML and chunks, in the locale the server decides. A sessionStorage
 *     flag stops a loop; it is cleared by the next dictionary that loads.
 *   · BUG-703: never over unsaved work. A reload would raise the editor's `beforeunload`
 *     prompt, and a coach who answered "stay" was left on a render suspended for good —
 *     every later navigation waited behind it. So when a guard is armed
 *     (`hasUnsavedWork`) and the failed chunk is the TARGET of a language switch, the
 *     switch is abandoned instead: the provider is answered with the language already on
 *     screen, the locale cookie is put back (`setLocaleAction`), and the switch says it
 *     could not change the language (`LOCALE_SWITCH_ABANDONED`). No prompt, no reload,
 *     and the tab keeps working in the language it had.
 *   · If the reload already happened and it fails again, the error is THROWN, and no
 *     boundary of ours catches it: this provider sits in the ROOT layout, above
 *     `app/error.tsx`, and there is no `app/global-error.tsx`. What QA observed (EV-342m
 *     gate on `48077bb`, FR → EN with the English chunk 404ing on every request): one
 *     reload, the English server-rendered HTML on screen, and the page error "Minified
 *     React error #329". Not Next's "Application error" page. Whether that HTML is still
 *     interactive was not tested.
 *
 * `dictionaries.ts` (both, statically) stays the SERVER's accessor: a server bundle's
 * size costs the browser nothing.
 */
const CopyContext = createContext<Copy | null>(null);
const LocaleContext = createContext<Locale | null>(null);

const loaded: Partial<Record<Locale, Copy>> = {};
const pending: Partial<Record<Locale, Promise<Copy>>> = {};

/** Set when this tab reloaded because a dictionary chunk failed; read by `reloadOnce`. */
export const COPY_RELOAD_FLAG = "evoli.copy.reloaded";

/**
 * Reload the page unless this tab already did for the same reason. True when a reload was
 * started. Storage that throws (a locked-down browser) means no reload: the error is
 * thrown instead, which is the honest answer when a loop cannot be ruled out.
 */
function reloadOnce(): boolean {
  try {
    if (window.sessionStorage.getItem(COPY_RELOAD_FLAG)) return false;
    window.sessionStorage.setItem(COPY_RELOAD_FLAG, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** BUG-703 — dispatched on `window` when a switch is abandoned; `LanguageSwitch` listens. */
export const LOCALE_SWITCH_ABANDONED = "evoli:locale-switch-abandoned";

/**
 * BUG-703 — the dictionary for `locale` failed while unsaved work forbids a reload. Answer
 * with the language on screen (`from`), put the cookie back, and only then forget the
 * stand-in, so a later switch asks for the chunk again. Null when there is no language on
 * screen to keep (a cold load): the caller throws as before.
 */
function abandonSwitch(locale: Locale): Promise<Copy> | null {
  const from: Locale = locale === "fr" ? "en" : "fr";
  const onScreen = loaded[from];
  if (!onScreen) return null;
  void setLocaleAction(from)
    .catch(() => undefined)
    .finally(() => {
      delete pending[locale];
      window.dispatchEvent(new Event(LOCALE_SWITCH_ABANDONED));
    });
  return Promise.resolve(onScreen);
}

function load(locale: Locale): Promise<Copy> {
  const inFlight = pending[locale];
  if (inFlight) return inFlight;
  const request = (
    locale === "fr"
      ? import(/* webpackChunkName: "evoli-copy-fr" */ "../copy.fr").then((m): Copy => m.fr)
      : import(/* webpackChunkName: "evoli-copy-en" */ "../copy").then((m): Copy => m.en)
  ).then(
    (copy) => {
      loaded[locale] = copy;
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(COPY_RELOAD_FLAG);
        } catch {
          // Nothing to clear where storage is unavailable.
        }
      }
      return copy;
    },
    (err: unknown) => {
      if (typeof window !== "undefined") {
        // Unsaved work: abandon the switch rather than prompt (BUG-703).
        const kept = hasUnsavedWork() ? abandonSwitch(locale) : null;
        if (kept) return kept;
        // Reloading: stay pending (the provider stays suspended, the server HTML stays on
        // screen) and keep this promise, so no render asks for the chunk again meanwhile.
        if (!hasUnsavedWork() && reloadOnce()) return new Promise<Copy>(() => undefined);
      }
      delete pending[locale];
      throw err;
    }
  );
  pending[locale] = request;
  return request;
}

if (typeof document !== "undefined") {
  const lang = document.documentElement.lang;
  // Started now, read in render below; a failure here reloads once (see `load`).
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
