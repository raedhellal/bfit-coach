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
 * Never on a server action (`Next-Action`: the language switch is one). An action's
 * response re-renders the root layout, and the hint would travel in its RSC payload for
 * the switch's TARGET language, the other one, which is out of scope and harmful: React
 * turns a payload hint into a `<link rel="preload">` in `<head>`, WebKit answers a later
 * `import()` of that URL from a preload still in the document, so a chunk that 404'd once
 * would fail every retry and the coach could never switch again (EV-342m's M.6 and
 * BUG-703, found by `locale-bundle.spec.ts`'s WebKit tests).
 *
 * Other RSC requests (a refresh, a navigation that re-renders this layout) DO carry the
 * hint: Next 14.2 strips `RSC`, `Next-Router-State-Tree` and `Next-Router-Prefetch` from
 * `headers()` (`request-async-storage-wrapper`'s `getHeaders`), so a server component
 * cannot tell them from a document request. In the document's own language that costs
 * nothing: React dedupes the hint against the `<link>` the document already has (observed
 * on a `router.refresh()`: still one `<link>`, one dictionary request, no console
 * message). After ANOTHER tab changed the locale cookie, a refresh here renders the other
 * language and its hint lands in `<head>` beside the document's (observed, Chromium and
 * WebKit, EV-350 staff round 1; open, see the merge record).
 */
export function preloadCopyChunk(locale: Locale): void {
  const request = headers();
  if (request.has("next-action")) return;
  preload(copyChunkHref(locale), { as: "script" });
}
