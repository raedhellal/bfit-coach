/**
 * Which language the portal speaks.
 *
 * The rule (Evoli Pro redesign, 2026-10-02 — Raed: "a FR/EN switch, French by default";
 * the coordinator's restatement, which REPLACES EV-324's ruling R1):
 *
 *   1. the coach's own choice, from the language switch (the `evoli_pro_locale` cookie);
 *   2. otherwise `Accept-Language`: of the entries that are French or English, the one
 *      with the highest `q` (the earlier one on a tie; `q=0` means "not acceptable");
 *   3. otherwise French — no header, `*`, or no French or English entry at all.
 *
 * Pinned both ways in `qa/coach-i18n.spec.ts`:
 *   · `fr-CA,en;q=0.8`  → fr      · `en-US`            → en
 *   · `de-DE,fr;q=0.9`  → fr  (R1 said en: only the first entry decided)
 *   · `de-DE`           → fr  (R1 said en)
 *   · no header         → fr  (R1 said en)
 *
 * Read on the server, so the first paint is already in the right language — no hydration
 * swap. Pure and framework-free so it can be unit-tested without a server.
 */
export type Locale = "en" | "fr";

export const LOCALES: readonly Locale[] = ["en", "fr"];

/** When neither the switch nor the browser names French or English. */
export const DEFAULT_LOCALE: Locale = "fr";

/** The language switch's cookie. A preference, not a credential. */
export const LOCALE_COOKIE = "evoli_pro_locale";

/**
 * Each language's own name, the same in both dictionaries on purpose (a French coach looks
 * for « English », an English one for « Français »), so it is a constant and not copy.
 * The switch shows the short code and reads the name to a screen reader.
 */
export const LANGUAGE_NAMES: Record<Locale, { short: string; name: string }> = {
  fr: { short: "FR", name: "Français" },
  en: { short: "EN", name: "English" },
};

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "fr";
}

/** `fr`, `fr-FR`, `fr_BE` → fr; `en`, `en-US` → en; `frr`, `fy-NL`, `de` → null. */
function supported(tag: string): Locale | null {
  if (/^fr(?:$|[-_])/.test(tag)) return "fr";
  if (/^en(?:$|[-_])/.test(tag)) return "en";
  return null;
}

export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (typeof header !== "string") return DEFAULT_LOCALE;
  let best: { locale: Locale; q: number } | null = null;
  for (const entry of header.split(",")) {
    const [rawTag, ...params] = entry.split(";");
    const locale = supported((rawTag ?? "").trim().toLowerCase());
    if (!locale) continue;
    let q = 1;
    for (const param of params) {
      const m = /^\s*q\s*=\s*([0-9]*\.?[0-9]+)\s*$/i.exec(param);
      if (m) q = Number(m[1]);
    }
    if (!(q > 0)) continue;
    // Strictly greater: on a tie the earlier entry keeps it (the browser's own order).
    if (!best || q > best.q) best = { locale, q };
  }
  return best?.locale ?? DEFAULT_LOCALE;
}

/** The whole rule: the switch's cookie first, then the browser, then French. */
export function resolveLocale(cookie: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  return isLocale(cookie) ? cookie : localeFromAcceptLanguage(acceptLanguage);
}

/** The BCP 47 tag `Intl` formats with. French is France's French (fr-FR, AC3). */
export function intlLocale(locale: Locale): string {
  return locale === "fr" ? "fr-FR" : "en-GB";
}
