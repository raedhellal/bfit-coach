"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * EV-342f (audit A6) — below 1280 px the trainee's profile is ONE line above the editor,
 * « Blessures : … · Matériel : n », with « Détails » opening the full card in place.
 *
 * Before it, below 1280 px the profile card and « Enregistrer comme modèle » stacked above
 * the editor: at 1024×800 the plan-name field started at y≈630 and no exercise was on the
 * first screen. The injuries stay readable without a click (the one thing a coach must not
 * miss while editing, PO ruling); the rest of the card is behind « Détails ».
 *
 * ONE card in the document, never two copies: CSS hides it below 1280 px while the line is
 * closed, and from 1280 px hides the line and always shows the card (the two-column layout,
 * unchanged, F.4). So the viewport is decided by CSS, never by a hook (plan §3 rule 5), and
 * a text locator still finds the card once. Before hydration the line shows and the button
 * does nothing yet; the card is one click away, as after.
 */
export function ProfileLine({ line, details, children }: { line: string; details: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const cardId = useId();
  return (
    <div className="prog-profile-box" data-open={open ? "" : undefined}>
      <div className="prog-profile-line">
        <span className="prog-profile-text">{line}</span>
        <button
          type="button"
          className="prog-profile-toggle"
          aria-expanded={open}
          aria-controls={cardId}
          onClick={() => setOpen((v) => !v)}
        >
          {details}
        </button>
      </div>
      <div id={cardId} className="prog-profile-card">
        {children}
      </div>
    </div>
  );
}
