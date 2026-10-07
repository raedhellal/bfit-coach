"use client";

/**
 * EV-342g (audit A11) — « Aller au contenu » / "Skip to content": the first Tab stop of every
 * signed-in page, shown only while it has focus (`.skip-link`, globals.css), a 44 px target.
 *
 * At 1024 px and up a keyboard user otherwise crosses the logo, five navigation links, the
 * FR/EN switch and the account block before the page's first control, on every page.
 *
 * The click moves focus to `<main id="main" tabIndex={-1}>` itself rather than following
 * `#main`: a fragment navigation adds a history entry and fires `popstate`, which the
 * unsaved-changes guard reads as Back (it would offer to discard an editor's work) and which
 * would put a same-page entry between the coach and the previous page. Before hydration
 * the plain `href="#main"` still works, as a fragment link.
 */
export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#main"
      className="skip-link"
      onClick={(event) => {
        const main = document.getElementById("main");
        if (!main) return;
        event.preventDefault();
        main.focus();
      }}
    >
      {label}
    </a>
  );
}
