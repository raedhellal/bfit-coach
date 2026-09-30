import type { Copy } from "@/lib/copy";

/**
 * EV-324 AC5b — the legal line, once, on every page (Raed's ruling 2026-09-29).
 *
 * Nutrition in this product is for healthy people; therapeutic nutrition is a
 * dietitian's (scope §10.2, L4371-1 CSP). The sentence is the story's, verbatim, in the
 * page's language.
 *
 * WHERE: the root layout, so no page can forget it — including /login, /activate and the
 * invite landing. HOW IT STAYS VISIBLE: on a wide screen it is `position: sticky` at the
 * bottom (AC5b: "visible without scrolling on a 1280 × 800 viewport, or sticky"), and the
 * page frame is shortened by its height (`--legal-footer-h`) so a page that fits the
 * viewport is never covered by it. Below 768 px it is a plain footer at the end of the
 * page: wrapped onto three or four lines it would be a sticky band over a quarter of a
 * phone screen, and AC5b's viewport is 1280 × 800.
 *
 * Server component; the root layout passes the dictionary it already resolved.
 */
export function LegalFooter({ copy }: { copy: Copy }) {
  return (
    <footer className="legal-footer" aria-label={copy.legalFooterLabel}>
      <p>{copy.legalFooter}</p>
    </footer>
  );
}
