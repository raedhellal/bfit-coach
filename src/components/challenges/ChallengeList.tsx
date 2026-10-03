import Link from "next/link";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";
import { UiIcon } from "@/components/ui/icons";
import type { ChallengePhase, CoachChallengeSummary } from "@/lib/coachApi";
import type { Copy } from "@/lib/copy";
import { formatDate, formatSteps } from "@/lib/format";
import { phaseLine, windowPosition } from "@/lib/challengeView";

/**
 * The phase as a pill: an icon and a WORD, the colour last (plan §5.5, « Actif / À venir /
 * Terminé »; WCAG 1.4.1). `StatusPill` requires the label by its type.
 */
const PHASE_PILL: Record<ChallengePhase, { tone: StatusTone; icon: string }> = {
  ACTIVE: { tone: "green", icon: "pulse" },
  UPCOMING: { tone: "blue", icon: "clock" },
  ENDED: { tone: "neutral", icon: "check" },
};

/** A served phase this portal does not know gets no pill rather than a guessed one. */
export function PhasePill({ phase, copy, id }: { phase: ChallengePhase; copy: Copy; id?: string }) {
  const pill = PHASE_PILL[phase];
  const label = copy.challenges.phase[phase];
  if (!pill || !label) return null;
  return (
    <span data-phase={phase} style={{ display: "inline-flex", flex: "none", maxWidth: "100%" }}>
      <StatusPill id={id} tone={pill.tone} icon={pill.icon} label={label} />
    </span>
  );
}

/** "10 000 pas par jour" / "5 séances au total" — the challenge's goal in one line. */
export function goalLine(c: CoachChallengeSummary, copy: Copy): string {
  if (c.metric === "STEPS" && c.dailyTarget !== null) {
    return copy.challenges.stepsGoal(formatSteps(c.dailyTarget, copy.locale));
  }
  if (c.totalTarget !== null) return copy.challenges.workoutsGoal(formatSteps(c.totalTarget, copy.locale));
  return copy.common.dash;
}

/** "Du 29 sept. 2026 au 5 oct. 2026 · 7 jours". */
export function windowLine(c: CoachChallengeSummary, copy: Copy): string {
  return `${copy.challenges.window(formatDate(c.startsOn, copy.locale), formatDate(c.endsOn, copy.locale))} · ${copy.challenges.days(c.days)}`;
}


/**
 * EV-337h (plan §5.5) — the coach's challenges, one card each, in the api's order
 * (`endsOn` desc). Server-rendered; three columns from 1280 px, two from 768, one below.
 *
 * **The whole card is the link** (BUG-661: the title link was 21 px tall). One tab stop per
 * challenge; its accessible NAME is the title (`aria-labelledby`), the lines are its
 * description, and « Voir le détail » is the card's label drawn as a button, not a second
 * control to the same page. The title stays an `h2`, so the list keeps its outline.
 *
 * What the design draws and this card does NOT (plan §5.5, §7 G20): the avatars of who
 * joined (the list read carries counts, no names), « 1 a décliné » (the api has no DECLINED
 * state: a decline deletes the participation), « Modifier » (no update endpoint), and
 * « objectif atteint 61 % des jours » on an ended card (it needs one detail read per card).
 */
export function ChallengeList({ items, copy, now }: { items: CoachChallengeSummary[]; copy: Copy; now: number }) {
  const ch = copy.challenges;
  return (
    <ul aria-label={ch.title} className="challenge-grid">
      {items.map((c) => {
        const base = `challenge-${c.id}`;
        const at = windowPosition(c, now);
        const phase = phaseLine(c, copy, now);
        return (
          <li key={c.id} data-challenge-id={c.id} className="challenge-grid-item">
            <Link
              href={`/challenges/${encodeURIComponent(c.id)}`}
              className="challenge-card"
              aria-labelledby={`${base}-title`}
              aria-describedby={`${base}-phase ${base}-lines`}
            >
              <div className="challenge-card-head">
                <h2 id={`${base}-title`} className="challenge-card-title dt">
                  {c.title}
                </h2>
                <PhasePill phase={c.phase} copy={copy} id={`${base}-phase`} />
              </div>
              <div id={`${base}-lines`} className="challenge-card-lines">
                <span className="challenge-card-line">{goalLine(c, copy)}</span>
                <span className="challenge-card-line">{windowLine(c, copy)}</span>
                {phase && (
                  <span className="challenge-card-line" data-window-position="">
                    {phase}
                  </span>
                )}
                <span className="challenge-card-line challenge-card-counts">
                  {ch.counts(c.participantCount, c.acceptedCount)}
                </span>
              </div>
              {at?.phase === "ACTIVE" && (
                // The window's progress, drawn from the dates: it repeats « Jour 5 sur 7 »
                // above, so it is decoration and carries its numbers as data.
                <span
                  className="challenge-window-bar"
                  aria-hidden="true"
                  data-day={at.day}
                  data-days={at.days}
                >
                  <span style={{ width: `${Math.floor((at.day / at.days) * 100)}%` }} />
                </span>
              )}
              <span className="challenge-card-action" aria-hidden="true">
                {ch.viewDetail}
                <UiIcon name="chevR" size={15} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
