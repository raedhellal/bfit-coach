import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import type { Copy } from "../copy";
import { copyFor } from "./dictionaries";
import { localeFromAcceptLanguage, type Locale } from "./locale";

/**
 * EV-324 — the language of THIS request, for server components, route handlers and
 * server actions. Read from `Accept-Language` (R1: the first entry decides, see
 * `localeFromAcceptLanguage`).
 *
 * `cache` makes it one decision per request however many components ask. Calling it
 * outside a request (module scope, build-time prerender) throws in `headers()`, which is
 * the right failure: a dictionary chosen at build time would be one language for everyone.
 */
export const getLocale = cache((): Locale => localeFromAcceptLanguage(headers().get("accept-language")));

/** The dictionary for this request. `const copy = getCopy();` at the top of a server component. */
export function getCopy(): Copy {
  return copyFor(getLocale());
}
