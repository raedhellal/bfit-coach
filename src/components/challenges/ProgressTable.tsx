import type { ReactNode } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/ui/StatusPill";
import { UiIcon } from "@/components/ui/icons";
import type { ActivitySource, ChallengeMetric, CoachChallengeDetail, CoachChallengeParticipant } from "@/lib/coachApi";
import type { Copy } from "@/lib/copy";
import { formatSince, formatSteps } from "@/lib/format";
import { initialsOf, participantRowView } from "@/lib/challengeView";
import { DayLegend, DayStrip } from "./DayStrip";

/**
 * EV-337h (plan §5.6, §4 `ParticipantRow` / `ParticipantCard`) — the challenge's
 * participants, ranked. It replaced EV-321b's table.
 *
 * ONE markup, two layouts, CSS decides (`globals.css`, "challenge participants"): a row per
 * participant from 768 px, a card per participant below it. One copy of each participant
 * in the DOM, right on first paint, no viewport hook.
 *
 * Rows are rendered in the order the api SERVES them: it ranks (daysMet, then total, with
 * shared ranks) and puts INVITED after ACCEPTED. A client-side sort here would be a
 * second, disagreeing implementation of the one rule the page is about.
 *
 * 🔴 `null` is never `0` here. `todayValue: null` reads « Aucune donnée aujourd'hui » with
 * no bar (an empty bar is a picture of zero), a day with no data is an outlined square
 * named "no data", and an INVITED participant — who has not consented to share anything —
 * gets no number at all, just the status and one sentence saying why.
 *
 * The name is a link to the client's page with a 44 × 44 px box (BUG-661: it was a 16 px
 * line of text in a table cell). The rest of the row is not a link: it holds the day
 * strip's named squares and the progress bar, which a link's name would swallow.
 *
 * Not drawn, from the design (plan §5.6, §7 G20): « Relancer » and « Inviter des clients »
 * (no endpoint), « A décliné » (a decline deletes the participation), a per-participant
 * goal (one goal per challenge), and an injury line — challenge participation is not a
 * WORKOUTS-scope read, so health data has no place on this row.
 */
export function ProgressTable({ detail, copy, now }: { detail: CoachChallengeDetail; copy: Copy; now: number }) {
  const c = copy.challenges;
  const metric = detail.challenge.metric;
  const steps = metric === "STEPS";
  return (
    <section aria-label={c.progressLabel} className="participants">
      <h2 className="participants-title dt">{c.participantsTitle}</h2>
      <ul className="participant-list">
        {detail.participants.map((p) =>
          p.progress === null ? (
            <InvitedItem key={p.clientId} p={p} copy={copy} metric={metric} />
          ) : (
            <AcceptedItem
              key={p.clientId}
              p={p}
              copy={copy}
              now={now}
              steps={steps}
              challenge={detail.challenge}
            />
          )
        )}
      </ul>
      {steps && (
        <div className="participants-foot">
          <DayLegend copy={copy} />
          <p className="participants-note">{c.noDataNotZero}</p>
        </div>
      )}
    </section>
  );
}

function nameOf(p: CoachChallengeParticipant, copy: Copy): string {
  return p.displayName?.trim() ? p.displayName : copy.challenges.unnamed;
}

/** Initials from the api's name; an unnamed client gets a person glyph, never invented letters. */
function ParticipantAvatar({ p }: { p: CoachChallengeParticipant }) {
  const initials = initialsOf(p.displayName);
  return (
    <span className="participant-avatar" aria-hidden="true">
      {initials || <UiIcon name="user" size={16} />}
    </span>
  );
}

function Identity({
  p,
  copy,
  showRank = true,
  children,
}: {
  p: CoachChallengeParticipant;
  copy: Copy;
  /** False on an UPCOMING challenge (`participantRowView`): the api's rank counts no day the head allows. */
  showRank?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="participant-id">
      {/* An empty slot keeps invited and not-yet-ranked rows' avatars in line with the ranked ones. */}
      {showRank && p.rank !== null ? (
        <span className="participant-rank tnum" data-rank-label="">
          {copy.challenges.rank(p.rank)}
        </span>
      ) : (
        <span className="participant-rank" aria-hidden="true" />
      )}
      <ParticipantAvatar p={p} />
      <div className="participant-who">
        <Link href={`/clients/${encodeURIComponent(p.clientId)}`} className="participant-name" data-participant-link="">
          {nameOf(p, copy)}
        </Link>
        {children}
      </div>
    </div>
  );
}

function InvitedItem({ p, copy, metric }: { p: CoachChallengeParticipant; copy: Copy; metric: ChallengeMetric }) {
  const c = copy.challenges;
  // By metric, like the consent line: an unknown metric says nothing rather than claim steps.
  const note = metric === "STEPS" ? c.invitedNote : metric === "WORKOUTS" ? c.invitedNoteWorkouts : null;
  return (
    <li className="participant" data-participant={p.clientId} data-status="INVITED">
      <Identity p={p} copy={copy} />
      <p className="participant-invited-note">{note}</p>
      <div className="participant-status">
        <StatusPill tone="blue" icon="mail" label={c.status.INVITED} />
      </div>
    </li>
  );
}

/**
 * Where TODAY's number came from — the day the row shows — and nothing else.
 *
 * BUG-473: this used to fall back to the latest earlier day with a source when today had
 * none, so a client who typed Tuesday by hand and sent nothing today read "Manual entry"
 * beside today's dash — the label named a day the row does not show. No row today means
 * no source label at all (the strip's squares carry no source either).
 */
function todaySource(p: CoachChallengeParticipant): ActivitySource | null {
  const progress = p.progress;
  if (!progress || progress.todayValue === null) return null;
  return progress.todaySource ?? null;
}

function AcceptedItem({
  p,
  copy,
  now,
  steps,
  challenge,
}: {
  p: CoachChallengeParticipant;
  copy: Copy;
  now: number;
  steps: boolean;
  challenge: CoachChallengeDetail["challenge"];
}) {
  const c = copy.challenges;
  const progress = p.progress!;
  const name = nameOf(p, copy);
  const n = (value: number) => formatSteps(value, copy.locale);
  const source = todaySource(p);
  const today = progress.todayValue;
  /**
   * The bar's width FLOORS and its colour follows the goal, not the width. With
   * `Math.round`, 9,950–9,999 of 10,000 drew a full green bar on a day the api still
   * calls IN_PROGRESS: the picture said "done" before the number did. Floor keeps
   * anything short of the goal visibly short (99 %), and green means `today >= target`,
   * the same comparison the api's calculator makes for MET.
   */
  const met = today !== null && progress.target > 0 && today >= progress.target;
  const pct = today === null || progress.target <= 0 ? 0 : Math.min(100, Math.floor((today / progress.target) * 100));
  /**
   * What this row may draw, decided in `challengeView` (`participantRowView`) so the row,
   * the stat cards and the page head answer one question. The api nulls `todayValue` both
   * for "nothing sent today" and for a today OUTSIDE the window; only the first is « Aucune
   * donnée aujourd'hui ». And the head follows the api's UTC phase: on an UPCOMING or ENDED
   * challenge no row has a today cell, whatever the trainee's own calendar says, and on an
   * UPCOMING one nothing is counted or ranked yet (QA PB-1 on 6269343).
   */
  const view = participantRowView(progress, challenge);

  return (
    <li className="participant" data-participant={p.clientId} data-status="ACCEPTED" data-rank={view.rank ? (p.rank ?? "") : ""}>
      <Identity p={p} copy={copy} showRank={view.rank}>
        {/* When the phone last sent a counted day. STEPS only: a WORKOUTS challenge syncs
            nothing. Not before day 1 (`view.counts`): `syncedAt` is the latest write among the
            window's days up to today, so before the start it is null for everyone, which says
            nothing about the phone. */}
        {steps && view.counts && (
          <span className="participant-sync">
            {progress.syncedAt === null ? (
              <span data-synced="">{c.neverSynced}</span>
            ) : (
              <>
                {c.colSynced}{" "}
                <span data-synced={progress.syncedAt}>{formatSince(progress.syncedAt, now, copy.locale)}</span>
              </>
            )}
          </span>
        )}
      </Identity>

      {view.today && (
        <div className="participant-today">
          <span className="participant-label">{c.colToday}</span>
          {steps ? (
            <div data-today={today === null ? "" : String(today)}>
              <div className="participant-value tnum">
                {today === null ? c.noDataToday : c.todaySteps(n(today), n(progress.target))}
              </div>
              {today !== null && (
                <div
                  role="progressbar"
                  aria-label={c.todayBar(name)}
                  aria-valuemin={0}
                  aria-valuemax={progress.target}
                  aria-valuenow={today}
                  aria-valuetext={c.todaySteps(n(today), n(progress.target))}
                  data-pct={pct}
                  data-met={met ? "true" : "false"}
                  className="participant-bar"
                >
                  <div style={{ width: `${pct}%`, background: met ? "var(--ok)" : "var(--blue-500)" }} />
                </div>
              )}
              {source && (
                <div className="participant-source" data-source={source}>
                  <span aria-hidden="true" style={{ display: "inline-flex" }}>
                    <UiIcon name={source === "MANUAL" ? "edit" : "pulse"} size={13} />
                  </span>
                  {c.source[source]}
                </div>
              )}
            </div>
          ) : (
            <div className="participant-value tnum">{c.todayWorkouts(today === null ? copy.common.dash : n(today))}</div>
          )}
        </div>
      )}

      <div className="participant-days">
        {steps && progress.days && <DayStrip days={progress.days} name={name} copy={copy} />}
        {/* Before the first day nothing has been counted: no "0 / 0", no "0 steps" total. */}
        {view.counts && (
          <div className="participant-totals">
            {progress.daysMet !== null && (
              <span>
                <span className="participant-label">{c.colDaysMet}</span>{" "}
                <span
                  className="tnum"
                  data-days-met=""
                  aria-label={c.daysMetLabel(progress.daysMet, progress.daysElapsed)}
                  title={c.daysMetLabel(progress.daysMet, progress.daysElapsed)}
                >
                  {c.daysMet(progress.daysMet, progress.daysElapsed)}
                </span>
              </span>
            )}
            <span>
              <span className="participant-label">{c.colTotal}</span>{" "}
              <span className="tnum" data-total="">
                {steps ? c.totalSteps(n(progress.total)) : c.totalWorkouts(n(progress.total), n(progress.target))}
              </span>
            </span>
          </div>
        )}
      </div>

      <div className="participant-status">
        <StatusPill tone="green" icon="check" label={c.status.ACCEPTED} />
      </div>
    </li>
  );
}
