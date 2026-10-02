import { StatTile } from "@/components/client/StatTile";
import type { CoachChallengeDetail } from "@/lib/coachApi";
import type { Copy } from "@/lib/copy";
import { formatShortDate, formatSteps } from "@/lib/format";
import { todayStats, windowPosition } from "@/lib/challengeView";

/**
 * EV-337h (plan §5.6) — the stat cards above a challenge's participants. Four on an active
 * STEPS challenge with someone who joined, two otherwise; 4-up from 900 px, 2-up below
 * (plan §3, `.challenge-stats`).
 *
 *   · Participants — the api's `acceptedCount` of `participantCount`; the foot counts the
 *     invitations not accepted yet. No « déclin » count: the api has no DECLINED state.
 *   · Goal met today — participants whose own today the api marked MET, over those who
 *     joined; the foot NAMES how many sent nothing today (never folded into a miss).
 *   · Group average · today — over the participants WITH a number today, and the foot says
 *     how many that is. Nobody with a number → « Aucune donnée aujourd'hui », not 0.
 *   · Day — the window position, from the dates (`windowPosition`).
 *
 * The two "today" cards exist only while the challenge is ACTIVE, its metric is STEPS, and
 * at least one participant's OWN today is inside the window (`todayInWindow`): the phase
 * is the api's UTC verdict, a trainee's today is in their zone, and on the last evening or
 * the first morning the two disagree. A WORKOUTS challenge has no daily goal to meet.
 */
export function ChallengeStats({ detail, copy, now }: { detail: CoachChallengeDetail; copy: Copy; now: number }) {
  const c = copy.challenges;
  const { challenge } = detail;
  const pending = Math.max(0, challenge.participantCount - challenge.acceptedCount);
  const stats = todayStats(detail);
  const at = windowPosition(challenge, now);
  // `stats.accepted` counts only participants whose own today is inside the window.
  const today = challenge.phase === "ACTIVE" && challenge.metric === "STEPS" && stats.accepted > 0;
  const short = (iso: string) => formatShortDate(iso, copy.locale);

  return (
    <div className="stat-grid challenge-stats" data-stat-count={1 + (today ? 2 : 0) + (at ? 1 : 0)}>
      <StatTile
        label={c.participantsTitle}
        value={c.stats.participantsValue(challenge.acceptedCount, challenge.participantCount)}
        foot={challenge.participantCount > 0 ? c.stats.pending(pending) : undefined}
      />
      {today && (
        <StatTile
          label={c.stats.metToday}
          value={c.ratio(stats.metToday, stats.accepted)}
          foot={stats.withoutData > 0 ? c.stats.withoutData(stats.withoutData) : undefined}
        />
      )}
      {today && (
        <StatTile
          label={c.stats.groupAverage}
          value={stats.average === null ? c.noDataToday : c.totalSteps(formatSteps(stats.average, copy.locale))}
          foot={stats.withData > 0 ? c.stats.withData(stats.withData) : undefined}
        />
      )}
      {at?.phase === "ACTIVE" && (
        <StatTile label={c.stats.day} value={c.ratio(at.day, at.days)} foot={sentenceCase(c.endsOn(short(at.endsOn)))} />
      )}
      {at?.phase === "UPCOMING" && (
        <StatTile label={c.stats.start} value={short(at.startsOn)} foot={c.startsIn(at.startsIn)} />
      )}
      {at?.phase === "ENDED" && <StatTile label={c.stats.end} value={short(at.endsOn)} foot={c.days(at.days)} />}
    </div>
  );
}


/** "ends on 4 Oct" is written to follow « Jour 5 sur 7 · »; alone on a card it starts a line. */
function sentenceCase(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
