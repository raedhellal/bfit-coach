import Link from "next/link";
import { Badge, Card, type Tone } from "@/components/ui/kit";
import type { ChallengePhase, CoachChallengeSummary } from "@/lib/coachApi";
import type { Copy } from "@/lib/copy";
import { formatDate, formatSteps } from "@/lib/format";

/** The phase as a badge: a word first, the colour second. */
export const PHASE_TONE: Record<ChallengePhase, Tone> = {
  UPCOMING: "blue",
  ACTIVE: "green",
  ENDED: "neutral",
};

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
 * EV-321b — the coach's challenges, one card each, in the api's order (`endsOn` desc).
 * Server-rendered: nothing on a card is interactive except the link to its page.
 */
export function ChallengeList({ items, copy }: { items: CoachChallengeSummary[]; copy: Copy }) {
  return (
    <ul
      aria-label={copy.challenges.title}
      style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}
    >
      {items.map((c) => (
        <li key={c.id} data-challenge-id={c.id}>
          <Card pad={18}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                <h2 className="dt" style={{ margin: 0, fontSize: 16.5, fontWeight: 650, letterSpacing: -0.2, overflowWrap: "anywhere" }}>
                  <Link href={`/challenges/${encodeURIComponent(c.id)}`} style={{ color: "var(--ink)" }}>
                    {c.title}
                  </Link>
                </h2>
                <div style={{ marginTop: 6, fontSize: 13.5, color: "var(--ink-2)" }}>{goalLine(c, copy)}</div>
                <div style={{ marginTop: 3, fontSize: 12.5, color: "var(--ink-3)" }}>{windowLine(c, copy)}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <Badge tone={PHASE_TONE[c.phase]} dot>
                  {copy.challenges.phase[c.phase]}
                </Badge>
                <span style={{ fontSize: 12.5, color: "var(--ink-3)", whiteSpace: "nowrap" }}>
                  {copy.challenges.counts(c.participantCount, c.acceptedCount)}
                </span>
              </div>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
