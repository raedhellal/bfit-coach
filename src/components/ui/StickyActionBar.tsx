import type { ReactNode } from "react";

/**
 * Evoli Pro redesign §4 — `StickyActionBar`: an editor's Cancel / Save row, kept on screen
 * while the coach scrolls a long document (programme, editors). First consumer: the
 * training-template editor (EV-337i).
 *
 * It is `position: sticky` (`.action-bar`, globals.css), never `fixed`: it rides the
 * viewport's bottom edge ABOVE the bottom tab bar below 1024 px and above the sticky legal
 * footer from 1024 px, and settles at the end of its editor when the page ends — so it can
 * never cover the footer or the tab bar, and they never cover it (EV-337 X5, plan §3).
 * `FocusClearOfBars` counts it as a bar, so keyboard focus is kept out from under it.
 *
 * A named region, so a screen reader can jump to the save controls.
 *
 * Server-safe: no hooks, no client JavaScript.
 */
export function StickyActionBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="action-bar" role="region" aria-label={label}>
      {children}
    </div>
  );
}
