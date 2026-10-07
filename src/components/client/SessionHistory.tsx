"use client";

import { useEffect, useId, useRef, useState } from "react";

/** How many sessions « Activité récente » lists before « Voir les 10 dernières » (EV-342j). */
export const SESSIONS_SHOWN = 5;

/** One session, already worded on the server: the three fields of an EV-187 AC5 row. */
export interface SessionRow {
  key: string;
  date: string;
  title: string;
  meta: string;
}

/**
 * EV-342j — the overview's one session list: the latest five, and a control that opens
 * the rest IN PLACE (at most ten: the cap is the api's, and this component never asks for
 * more — there is nothing to ask with). One `<ul>`, so a screen reader hears one list of
 * N items once it is open, not two lists.
 *
 * The label carries the real count (`showAll`, « Voir les 7 dernières » for seven), for
 * the reason AC5's summary line does: "the last 10" over seven rows would be false.
 *
 * Opening moves focus to the first row it revealed (the control itself goes away, so
 * focus must land somewhere, and the new rows are what the coach asked to read). There
 * is no "show fewer": the ruling's control opens, and a reload starts at five again.
 */
export function SessionHistory({ rows, showAll }: { rows: SessionRow[]; showAll: string }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const firstRevealed = useRef<HTMLLIElement>(null);
  const hidden = rows.length - SESSIONS_SHOWN;
  const shown = open ? rows : rows.slice(0, SESSIONS_SHOWN);

  useEffect(() => {
    if (open) firstRevealed.current?.focus();
  }, [open]);

  return (
    <>
      <ul id={listId} className="activity-list">
        {shown.map((row, i) => (
          <li
            key={row.key}
            className="activity-row"
            ref={i === SESSIONS_SHOWN ? firstRevealed : undefined}
            tabIndex={i === SESSIONS_SHOWN ? -1 : undefined}
          >
            <span className="activity-date">{row.date}</span>
            <span className="activity-title">{row.title}</span>
            <span className="activity-meta">{row.meta}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 && !open && (
        <div className="activity-more">
          {/* The shared link-button look on a real button: 44 px, the secondary variant. */}
          <button
            type="button"
            className="link-button"
            data-variant="secondary"
            aria-controls={listId}
            onClick={() => setOpen(true)}
          >
            {showAll}
          </button>
        </div>
      )}
    </>
  );
}
