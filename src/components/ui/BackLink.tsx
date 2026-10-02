import Link from "next/link";
import { UiIcon } from "./icons";

/**
 * Evoli Pro redesign §4 — `BackLink`: the one "back to …" link every detail page draws.
 *
 * BUG-660: before this component each page drew its own `<Link style={{ fontSize: 13 }}>`,
 * a line of text 16 px tall (« Retour aux clients » measured 129.6 × 16 at 390 px), on ten
 * routes. It is a standalone control, not a link inside a sentence, so WCAG 2.5.8's inline
 * exception does not cover it and the portal's 44 px floor (`MIN_TOUCH_TARGET`, BUG-146)
 * applies. The size, the hover fill and the keyboard ring live in `.back-link`
 * (globals.css): a class, never inline, so a media query can still reach it (BUG-380).
 *
 * The text and the destination are the caller's and do not change (BUG-660's expected
 * result). The arrow is decoration: the accessible name is the label alone, so a locator
 * by "Back to roster" keeps finding it.
 *
 * `flush` pulls the link left by its own padding so its arrow lines up with the content
 * edge, for a link that sits above a page title rather than beside it.
 *
 * Server-safe: no hooks, no client JavaScript.
 */
export function BackLink({ href, label, flush }: { href: string; label: string; flush?: boolean }) {
  return (
    <Link href={href} className="back-link" data-flush={flush ? "" : undefined}>
      <span aria-hidden="true" className="back-link-icon">
        <UiIcon name="arrowL" size={16} />
      </span>
      <span>{label}</span>
    </Link>
  );
}
