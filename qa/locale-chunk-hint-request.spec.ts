import { expect, type APIRequestContext } from "@playwright/test";
import { test } from "./fixture-test";

/**
 * EV-353 353.2 (staff's EV-350 N2) — WHEN the root layout hints the dictionary chunk, pinned
 * at the request level: three HTTP requests to `/login`, signed out, no browser page.
 *
 * `preloadCopyChunk` (`src/lib/i18n/chunk.ts`) puts `<link rel="preload" as="script">` for
 * the page language's dictionary in the HTML of a DOCUMENT request only. It tells a document
 * from an RSC fetch by `Sec-Fetch-Dest`, and when the header is ABSENT (Safari / iOS Safari
 * before 16.4, or a proxy that strips it) it falls back to hinting. Until this spec that
 * fallback was witnessed only by `curl` (QA's `curl-matrix.txt`, EV-350's production check),
 * so nothing went red if it changed. Per language:
 *   (a) `Sec-Fetch-Dest: document` → exactly one dictionary hint, naming
 *       `evoli-copy-<page language>`;
 *   (b) `Sec-Fetch-Dest: empty`    → none;
 *   (c) no `Sec-Fetch-Dest`        → exactly one, as in (a).
 *
 * Why no browser: a browser always sends the header (Chromium and WebKit here are both new
 * enough), so (c) cannot be reached through `page`. Playwright's `request` fixture is a plain
 * HTTP client that sends no `Sec-Fetch-*` header unless told to, which is what makes (c) a
 * real absent-header request. M1 below is the witness of that: if the request carried the
 * header after all, M1 would stay green.
 *
 * How the language is set: each request carries its own `Accept-Language` (`fr-FR` or
 * `en-US`) and no cookie (the `request` fixture's context holds none, so there is no
 * `evoli_pro_locale` and no session), which by the portal's locale rule
 * (`src/lib/i18n/locale.ts`) serves French or English. Every case first checks that
 * `<html lang>` IS that language, so (b) is a real login page with no hint, not an error page
 * or a redirect that would have none either.
 *
 * A hint is recognised by its tag, not by a substring of the HTML: the page's inline RSC
 * payload names the chunk too (React's preload hint), so only `<link>` tags with
 * `rel="preload"` and `as="script"` count, and among them those whose `href` names
 * `evoli-copy-`. Next's own route preloads are `<link rel="preload" as="script">` as well,
 * which is why the `href` filter is needed and why the count is of dictionary hints only.
 *
 * Mutants (applied to `preloadCopyChunk`'s condition, red then reverted; QA records both):
 *   · M1, skip when the header is absent (`dest !== "document"` in place of
 *     `dest !== null && dest !== "document"`): (c) red in FR and EN, (a) and (b) green;
 *   · M2, the `empty` arm removed (only `next-action` skips): (b) red in FR and EN.
 */

const LANGS = { fr: "fr-FR", en: "en-US" } as const;
type Lang = keyof typeof LANGS;

/** A dictionary value found in that language's chunk only (as in `locale-chunk-preload.spec.ts`). */
const PROBE: Record<Lang, string> = { en: "Add a client", fr: "Ouvrir le plan" };

/** The value of `name` on one HTML start tag, or null. */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1].replace(/&amp;/g, "&") : null;
}

/** The `href` of every `<link rel="preload" as="script">` that names a dictionary chunk. */
function dictionaryHints(html: string): string[] {
  return [...html.matchAll(/<link\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => attr(tag, "rel") === "preload" && attr(tag, "as") === "script")
    .map((tag) => attr(tag, "href") ?? "")
    .filter((href) => href.includes("evoli-copy-"));
}

/** GET /login, signed out, in `lang`, with `Sec-Fetch-Dest` set to `dest` or not sent at all. */
async function login(request: APIRequestContext, lang: Lang, dest: "document" | "empty" | null) {
  const headers: Record<string, string> = { "Accept-Language": LANGS[lang] };
  if (dest !== null) headers["Sec-Fetch-Dest"] = dest;
  const response = await request.get("/login", { headers, maxRedirects: 0 });
  expect(response.status(), `/login (${lang}, Sec-Fetch-Dest ${dest ?? "absent"}) answered`).toBe(200);
  const html = await response.text();
  expect(/<html\b[^>]*>/.exec(html)?.[0] ?? "<no html tag>", "the page is in the requested language").toMatch(
    new RegExp(`\\slang="${lang}"`)
  );
  return dictionaryHints(html);
}

for (const lang of ["fr", "en"] as const) {
  test.describe(`the dictionary hint on /login, ${lang.toUpperCase()} (353.2)`, () => {
    test(`(a) Sec-Fetch-Dest: document → one hint, evoli-copy-${lang}`, async ({ request }) => {
      const hints = await login(request, lang, "document");
      expect(hints, `exactly one dictionary hint, and it names evoli-copy-${lang}`).toHaveLength(1);
      expect(hints[0]).toContain(`evoli-copy-${lang}.`);
      // The hint is a real file, and it is this language's dictionary.
      const chunk = await request.get(hints[0]);
      expect(chunk.status(), `${hints[0]} is served`).toBe(200);
      expect(await chunk.text(), `${hints[0]} is the ${lang} dictionary`).toContain(PROBE[lang]);
    });

    test("(b) Sec-Fetch-Dest: empty → no hint", async ({ request }) => {
      expect(await login(request, lang, "empty"), "an RSC-style request carries no dictionary hint").toEqual([]);
    });

    test(`(c) no Sec-Fetch-Dest → one hint, evoli-copy-${lang} (the fallback)`, async ({ request }) => {
      const hints = await login(request, lang, null);
      expect(hints, `exactly one dictionary hint, and it names evoli-copy-${lang}`).toHaveLength(1);
      expect(hints[0]).toContain(`evoli-copy-${lang}.`);
    });
  });
}
