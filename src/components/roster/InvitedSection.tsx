"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/kit";
import { StatusPill } from "@/components/ui/StatusPill";
import { useCopy } from "@/lib/i18n/client";
import { formatExpiryUtc, formatInstant } from "@/lib/format";
import { InvitedActions, type InvitedOutcome } from "./InvitedActions";
import { wasResent } from "@/lib/addClient";

/**
 * EV-204b, AC-P7 — « Invitations en attente » / "Invited": the accounts this coach set up
 * that have not been finished, read from `GET /coach-portal/trainees` (Ruling 2: NOT a third
 * link status, so NOT a roster group — none of these people is a client yet, the capacity
 * meter does not count them, and the nav count, the search and the filters never see them).
 *
 * Each row: the name the coach typed, the address (shown to this coach only, Ruling 3), the
 * day the invitation went out (and the last Resend), the instant access expires, and Resend /
 * Withdraw. The name opens the person's own page, where the body-data control is (AC-P11).
 *
 * A client island only for the live region: a Withdraw removes the row it was pressed in,
 * and its sentence has to outlive the row. Rows arrive as plain data from the server read.
 *
 * `loadFailed`: the Invited read failed while the roster did not. Said, never drawn as an
 * empty list — "nobody is invited" is a claim the portal could not check.
 */
export interface InvitedRowData {
  userId: string;
  fullName: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  passwordIssuedAt: string;
}



export function InvitedSection({ rows, loadFailed }: { rows: InvitedRowData[]; loadFailed: boolean }) {
  const copy = useCopy();
  const c = copy.invited;
  const [outcome, setOutcome] = useState<InvitedOutcome | null>(null);

  if (!loadFailed && rows.length === 0 && !outcome) return null;

  return (
    <section className="roster-group invited-section" aria-labelledby="invited-heading" data-invited-section="">
      <div className="roster-group-head">
        <h2 id="invited-heading" className="roster-group-title">
          {c.title}
        </h2>
        {!loadFailed && rows.length > 0 && (
          <span className="roster-group-count" data-tone="blue">
            <span aria-hidden="true">{rows.length}</span>
            <span className="sr-only">{c.count(rows.length)}</span>
          </span>
        )}
      </div>

      {/* Always in the DOM, so the sentence is announced when it appears. */}
      <p
        role="status"
        className="invited-notice"
        data-tone={outcome?.kind === "refused" ? "err" : outcome ? "ok" : undefined}
        hidden={!outcome}
      >
        {outcome?.message ?? ""}
      </p>

      {loadFailed ? (
        <p className="invited-intro" data-invited-load-error="">
          {c.loadError}{" "}
          <a href="/" className="invited-reload">
            {c.reload}
          </a>
        </p>
      ) : (
        rows.length > 0 && (
          <>
            <p className="invited-intro">{c.intro}</p>
            <ul className="roster-list invited-list">
              {rows.map((row, idx) => {
                const base = `invited-${row.userId}`;
                return (
                  <li key={row.userId} className="roster-item" data-invited={row.userId}>
                    <div className="invited-row" aria-labelledby={`${base}-name`} role="group">
                      {/* The identity block is the link to the person's page: one target of
                          at least 44 px (X3), named by the name, described by the address. */}
                      <Link
                        href={`/invited/${encodeURIComponent(row.userId)}`}
                        className="roster-id invited-open"
                        aria-labelledby={`${base}-name`}
                        aria-describedby={`${base}-email`}
                      >
                        <Avatar name={row.fullName} size={40} idx={idx} />
                        <span style={{ minWidth: 0, display: "block" }}>
                          <span id={`${base}-name`} className="roster-name" title={row.fullName}>
                            {row.fullName}
                          </span>
                          <span id={`${base}-email`} className="roster-plan" title={row.email}>
                            {row.email}
                          </span>
                        </span>
                      </Link>

                      <span className="roster-cell invited-sent">
                        <span className="roster-cell-label">{c.colSent}</span>
                        <span className="roster-cell-value">
                          <time dateTime={row.createdAt}>{c.sent(formatInstant(row.createdAt, copy.locale))}</time>
                        </span>
                        {wasResent(row) && (
                          <span className="invited-resent">
                            <time dateTime={row.passwordIssuedAt}>
                              {c.resentOn(formatInstant(row.passwordIssuedAt, copy.locale))}
                            </time>
                          </span>
                        )}
                      </span>

                      <span className="roster-cell invited-expires">
                        <span className="roster-cell-label">{c.colExpires}</span>
                        <span className="roster-cell-value">
                          <time dateTime={row.expiresAt} data-invited-expires="">
                            {formatExpiryUtc(row.expiresAt, copy.locale)}
                          </time>
                        </span>
                      </span>

                      <span className="invited-status">
                        <StatusPill tone="blue" icon="mail" label={c.status} />
                      </span>

                      <InvitedActions
                        compact
                        target={{ userId: row.userId, fullName: row.fullName, email: row.email, expiresAt: row.expiresAt }}
                        onResult={setOutcome}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )
      )}
    </section>
  );
}
