import "server-only";
import { headers } from "next/headers";
import { preload } from "react-dom";
import type { Locale } from "./locale";

/** Inlined by next.config.mjs in the server compilations (EV-350); see `preloadableCopyChunks`. */
declare const __EVOLI_COPY_CHUNK_URLS__: Record<Locale, string>;

/**
 * EV-350 — the URL of `locale`'s dictionary chunk, exactly as the browser's `import()` in
 * `client.tsx` will ask for it.
 *
 * Exactly, because a hint that differs from the request by one character is worse than
 * none: the browser downloads the chunk twice and warns that the preload went unused.
 * Next's client runtime appends `?dpl=<deployment id>` to every chunk URL when
 * `NEXT_DEPLOYMENT_ID` is set (Vercel's skew protection; `next/dist/client/app-webpack.js`)
 * and `encodeURI`s it, so this does the same. Next inlines that variable into the server
 * bundle as well, so both sides read the same build-time value.
 */
export function copyChunkHref(locale: Locale): string {
  const deployment = process.env.NEXT_DEPLOYMENT_ID;
  return encodeURI(__EVOLI_COPY_CHUNK_URLS__[locale] + (deployment ? `?dpl=${deployment}` : ""));
}

/**
 * EV-350 — called by the root layout: on a document request, the HTML carries
 * `<link rel="preload" as="script">` for this language's dictionary chunk, so the browser
 * requests it in the first wave, with the route's own scripts, instead of one round trip
 * later when `client.tsx`'s `import()` runs. That `import()` then reuses the response.
 *
 * Only on a document request. Everything else Next asks the server for is an RSC fetch
 * (a server action, a refresh, a navigation that re-renders this layout), and there the
 * hint travels in the payload and React turns it into a `<link rel="preload">` in
 * `<head>`. That `<link>` can name the OTHER language, which is out of scope and harmful:
 *   · a server action (`Next-Action`): the language switch is one, and it renders the
 *     switch's TARGET language;
 *   · a refresh after ANOTHER tab changed the locale cookie: this tab re-renders in that
 *     tab's language (a `router.refresh()`: ChallengeControls' 45 s poll, error.tsx's
 *     retry, CatalogPicker, SwapSheet).
 * WebKit answers a later `import()` of a URL from a preload still in the document, so a
 * chunk that 404'd once fails every retry with no network request: after BUG-703's
 * abandoned switch, « EN » again over the still-unsaved work is abandoned again instead of
 * switching in place (EV-342m's M.6, BUG-703 / 349.3 (4),
 * `locale-bundle.spec.ts` and `locale-chunk-preload.spec.ts`'s WebKit tests).
 *
 * How a document request is told apart. NOT by `RSC`: Next 14.2 strips `RSC`,
 * `Next-Router-State-Tree` and `Next-Router-Prefetch` from `headers()`
 * (`request-async-storage-wrapper`'s `getHeaders`), so a server component never sees
 * them. By `Sec-Fetch-Dest`, which the browser sets and Next leaves alone: `document` on a
 * page load (including `location.reload()`), `empty` on every `fetch()` Next makes. When
 * the header is ABSENT, the hint is sent, as it was before this check, and only
 * `Next-Action` is skipped; a same-language refresh then costs nothing (React dedupes the
 * hint against the document's `<link>`).
 *
 * Where the header is absent, and what follows (EV-353 353.1):
 *   · Safari before 16.4 and iOS Safari before 16.4 send no `Sec-Fetch-Dest` at all (and so
 *     does every iOS browser on iOS before 16.4: they are all WebKit). Source, MDN's
 *     compatibility table (browser-compat-data `http.headers.Sec-Fetch-Dest`: Safari
 *     `version_added` 16.4, iOS Safari and the iOS WebView both mirror it):
 *     https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Sec-Fetch-Dest#browser_compatibility
 *   · those browsers therefore get the hint on RSC requests too (a refresh, a navigation),
 *     so the cross-tab WebKit failed-preload case above (EV-350, ruling 350-R1) CAN STILL
 *     HAPPEN there: a refresh after another tab switched the language hints the other
 *     dictionary, and if that preload fails, WebKit answers every later `import()` of it
 *     from the failed preload (the replay is witnessed in Playwright's current WebKit, not
 *     on a pre-16.4 Safari);
 *   · a proxy that strips the header behaves the same, for every browser behind it;
 *   · Chrome before 80 and Firefox before 90 send none either (same table) and get the same
 *     stray hint; whether they then replay a failed preload as WebKit does was not tested.
 * Not closed by a user-agent branch: rejected in 350-R1. `qa/locale-chunk-hint-request.spec.ts`
 * pins all three cases (`document`, `empty`, absent) at the request level.
 */
export function preloadCopyChunk(locale: Locale): void {
  const request = headers();
  const dest = request.get("sec-fetch-dest");
  if (request.has("next-action") || (dest !== null && dest !== "document")) return;
  preload(copyChunkHref(locale), { as: "script" });
}
