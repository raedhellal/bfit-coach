import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import type { Copy } from "../copy";
import { copyFor } from "./dictionaries";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./locale";

/**
 * The language of THIS request, for server components, route handlers and server actions:
 * the language switch's cookie, then `Accept-Language`, then French (`resolveLocale`).
 *
 * `cache` makes it one decision per request however many components ask. Calling it
 * outside a request (module scope, build-time prerender) throws in `headers()`, which is
 * the right failure: a dictionary chosen at build time would be one language for everyone.
 */
export const getLocale = cache(
  (): Locale => resolveLocale(cookies().get(LOCALE_COOKIE)?.value, headers().get("accept-language"))
);

/** The dictionary for this request. `const copy = getCopy();` at the top of a server component. */
export function getCopy(): Copy {
  return copyFor(getLocale());
}
