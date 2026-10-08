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
 * EV-350 — called by the root layout: on a DOCUMENT request, the HTML carries
 * `<link rel="preload" as="script">` for this language's dictionary chunk, so the browser
 * requests it in the first wave, with the route's own scripts, instead of one round trip
 * later when `client.tsx`'s `import()` runs. That `import()` then reuses the response.
 *
 * Never on an RSC request (`RSC`: a client navigation, a prefetch, a refresh) or a server
 * action (`Next-Action`: the language switch is one). There the hint travels in the RSC
 * payload and React turns it into a `<link rel="preload">` in `<head>` — for the switch,
 * the OTHER language's chunk, which is out of scope, and harmful: WebKit answers a later
 * `import()` of a URL from a preload still in the document, so a chunk that 404'd once
 * would fail every retry and the coach could never switch again (EV-342m's M.6 and
 * BUG-703, found by `locale-bundle.spec.ts`'s WebKit tests). Navigations do not need it
 * either: the dictionary is already in memory (`client.tsx`'s `loaded`).
 */
export function preloadCopyChunk(locale: Locale): void {
  const request = headers();
  if (request.has("rsc") || request.has("next-action")) return;
  preload(copyChunkHref(locale), { as: "script" });
}
