"use client";

import { useTransition } from "react";
import { setRosterSortAction } from "@/lib/actions";
import { settled } from "@/lib/settled";
import { copy } from "@/lib/copy";
import { MIN_TOUCH_TARGET } from "@/components/ui/kit";
import type { RosterSort } from "@/lib/coachApi";

/**
 * EV-187 AC2 — "the coach can flip the order to 'Recently active' with ONE control".
 *
 * One control, two options, rendered as a radio group rather than a pair of buttons:
 * the two orders are mutually exclusive and exactly one is in force, which is what
 * `role="radiogroup"` says to a screen reader and what two buttons do not.
 *
 * It is a client component because it is the only interactive element AC6's closed
 * list allows on this screen besides navigation — and it writes nothing about a
 * trainee. The action sets a session cookie and revalidates `/`; the SERVER then asks
 * the api for that order, because the sort key spans the whole roster and this surface
 * holds one page of it.
 *
 * `settled` for the reason every call site here uses it: a failed server action
 * resolves with `undefined`, and an unwrapped `await` would throw into the route's
 * error boundary and replace the roster with "Something went wrong."
 */
export function RosterSortToggle({ sort }: { sort: RosterSort }) {
  const [pending, startTransition] = useTransition();

  const options: { value: RosterSort; label: string }[] = [
    { value: "needs_attention", label: copy.roster.sortNeedsAttention },
    { value: "recent_activity", label: copy.roster.sortRecentActivity },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-3)" }} id="roster-sort-label">
        {copy.roster.sortLabel}
      </span>
      <div
        role="radiogroup"
        aria-labelledby="roster-sort-label"
        style={{
          display: "inline-flex",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: 3,
          gap: 3,
        }}
      >
        {options.map((option) => {
          const on = option.value === sort;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={pending}
              onClick={() => {
                if (on) return;
                startTransition(async () => {
                  await settled(setRosterSortAction(option.value), { ok: false });
                });
              }}
              style={{
                // The 44 px thumb-target floor (BUG-146) — this control is used at the
                // 390 px viewport the roster is demoed at.
                minHeight: MIN_TOUCH_TARGET,
                padding: "0 14px",
                border: "none",
                borderRadius: "calc(var(--r-lg) - 3px)",
                cursor: pending ? "progress" : on ? "default" : "pointer",
                fontSize: 13.5,
                fontWeight: 600,
                whiteSpace: "nowrap",
                background: on ? "var(--surface)" : "transparent",
                boxShadow: on ? "var(--e-card)" : "none",
                color: on ? "var(--ink)" : "var(--ink-3)",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
