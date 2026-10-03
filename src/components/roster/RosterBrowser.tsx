"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { UiIcon } from "@/components/ui/icons";
import { useCopy } from "@/lib/i18n/client";
import {
  ROSTER_FILTERS,
  ROSTER_GROUPS,
  matchesSearch,
  passesFilter,
  type RosterFilter,
  type RosterGroup,
} from "@/lib/rosterView";
import { useAdoptPrehydrationInput } from "@/lib/useAdoptPrehydrationInput";

/**
 * EV-337d — search, filters and the four groups over the roster the SERVER read.
 *
 * Filtering in the browser is legitimate here and sorting is not (plan §5.1): the roster is
 * one page of up to 100, which is the whole roster for every tier, while the api's sort key
 * spans the whole roster. So this island never reorders: each group lists its rows in the
 * order the api returned them (EV-187 AC2's sort toggle still decides it).
 *
 * The rows themselves are SERVER-rendered (`RosterRow`) and arrive here as nodes with the
 * facts the filters need beside them. The island owns the query and the filter, nothing
 * else: no fetch, no data of its own.
 */
export interface RosterEntry {
  id: string;
  group: RosterGroup;
  flagged: boolean;
  inactive: boolean;
  /** `searchKey(name + " " + plan)`, computed on the server. */
  search: string;
  node: ReactNode;
}

export function RosterBrowser({ entries }: { entries: RosterEntry[] }) {
  const copy = useCopy();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("all");
  // BUG-686 follow-up: what was typed into the server HTML before hydration reaches state.
  const scope = useAdoptPrehydrationInput<HTMLDivElement>();
  const searchId = useId();

  const counts = useMemo(() => {
    const out: Record<RosterFilter, number> = { all: 0, flagged: 0, inactive: 0 };
    for (const f of ROSTER_FILTERS) out[f] = entries.filter((e) => passesFilter(e, f)).length;
    return out;
  }, [entries]);

  const visible = entries.filter((e) => passesFilter(e, filter) && matchesSearch(e.search, query));
  const narrowed = filter !== "all" || query.trim() !== "";

  return (
    <div className="roster-browser" ref={scope}>
      <div className="roster-toolbar">
        <label className="roster-search" htmlFor={searchId}>
          <span aria-hidden="true" style={{ display: "inline-flex", color: "var(--ink-3)" }}>
            <UiIcon name="search" size={17} />
          </span>
          <span className="sr-only">{copy.roster.searchLabel}</span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.roster.searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        {/* Only the filters with data behind them (EV-337 D5): the design's adherence and
            invitations chips have no api field (plan §7 G1, G2). Hidden when the count is
            zero would make the chip row jump; a zero count is a true statement here. */}
        <div className="roster-filters" role="group" aria-label={copy.roster.filtersLabel}>
          {ROSTER_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className="roster-chip"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === "flagged" && (
                <span aria-hidden="true" style={{ display: "inline-flex" }}>
                  <UiIcon name="flag" size={13} />
                </span>
              )}
              {copy.roster.filters[f](counts[f])}
            </button>
          ))}
        </div>
      </div>

      {/* Announces what a search or a filter left, and nothing on first paint. */}
      <p className="sr-only" role="status" aria-live="polite">
        {narrowed ? copy.roster.shown(visible.length) : ""}
      </p>

      {visible.length === 0 ? (
        <div className="roster-nomatch">
          <p style={{ margin: 0, fontSize: "var(--fs-body)", color: "var(--ink-2)" }}>{copy.roster.noMatch}</p>
          <button
            type="button"
            className="roster-chip"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            {copy.roster.clearFilters}
          </button>
        </div>
      ) : (
        ROSTER_GROUPS.map((group) => {
          const rows = visible.filter((e) => e.group === group);
          if (rows.length === 0) return null;
          const headingId = `roster-group-${group}`;
          return (
            <section key={group} className="roster-group" aria-labelledby={headingId} data-roster-group={group}>
              <div className="roster-group-head">
                <h2 id={headingId} className="roster-group-title">
                  {copy.roster.groups[group]}
                </h2>
                <span className="roster-group-count" data-tone={group === "attention" ? "red" : undefined}>
                  <span aria-hidden="true">{rows.length}</span>
                  <span className="sr-only">{copy.roster.groupCount(rows.length)}</span>
                </span>
              </div>
              <ul className="roster-list">
                {rows.map((e) => (
                  <li key={e.id} className="roster-item">
                    {e.node}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
