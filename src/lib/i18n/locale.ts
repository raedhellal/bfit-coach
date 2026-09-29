/**
 * EV-324 — which language the portal speaks, decided by the browser.
 *
 * Ruling R1 (D-DEMO-6, option A): the FIRST `Accept-Language` entry decides. If it starts
 * with `fr` the portal is French; anything else, and no header at all, is English, which
 * is the portal as it was before this row.
 *
 * "First" is literal, and the story's edge cases pin it both ways:
 *   · `fr-CA,en;q=0.8`   → fr (a prefix match on the first entry)
 *   · `de-DE,fr;q=0.9`   → en (French is listed, but not first)
 *
 * The header is what a browser builds from `navigator.languages`, in the user's order,
 * so reading it on the server is reading `navigator.language` without a client round
 * trip — and without a first paint in the wrong language followed by a hydration swap.
 *
 * There is no switch in the UI and no stored preference (both out of scope, R1). Pure and
 * framework-free so it can be unit-tested without a server.
 */
export type Locale = "en" | "fr";

export const LOCALES: readonly Locale[] = ["en", "fr"];

export const DEFAULT_LOCALE: Locale = "en";

export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (typeof header !== "string") return DEFAULT_LOCALE;
  // The first comma-separated entry, without its `;q=` weight.
  const first = header.split(",")[0]?.split(";")[0]?.trim().toLowerCase() ?? "";
  // `fr`, `fr-FR`, `fr-CA`, `fr_BE` — but never `fra…` or `frisian`-style tags.
  return /^fr(?:$|[-_])/.test(first) ? "fr" : DEFAULT_LOCALE;
}

/** The BCP 47 tag `Intl` formats with. French is France's French (fr-FR, AC3). */
export function intlLocale(locale: Locale): string {
  return locale === "fr" ? "fr-FR" : "en-GB";
}
