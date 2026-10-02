import { BackLink } from "@/components/ui/BackLink";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ChallengeControls } from "@/components/challenges/ChallengeControls";
import { PhasePill, goalLine, windowLine } from "@/components/challenges/ChallengeList";
import { ChallengeStats } from "@/components/challenges/ChallengeStats";
import { LoadedAt } from "@/components/challenges/LoadedAt";
import { ProgressTable } from "@/components/challenges/ProgressTable";
import { Card, PageHead } from "@/components/ui/kit";
import { coachApi, isForbidden, type CoachChallengeDetail } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";

/**
 * /challenges/[id] — EV-321b, one challenge and its participants' progress, ranked.
 * EV-337h redrew it (plan §5.6): a head whose h1 is the name alone, the stat cards, and
 * participant rows that become cards below 768 px. Still server-rendered (ADR-0033), still
 * no `loading.tsx` (EV-337l), and `ChallengeControls` still runs the 45 s visible-only poll.
 *
 * Two failure states, and they are not the same sentence (the templates page's rule):
 *   · 403 → `notYours`. The api answers ONE body for another coach's challenge, an id
 *     that never existed and one deleted in another tab, so the portal renders one.
 *   · anything else → the load error. The api being down says nothing about ownership.
 * Never a `notFound()`: a 404 would state the fact the 403 exists to withhold.
 */
export const dynamic = "force-dynamic";

export default async function ChallengePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { created?: string };
}) {
  const copy = getCopy();
  const c = copy.challenges;
  const [me, loaded] = await Promise.all([
    readCoachMe(),
    coachApi
      .getChallenge(params.id)
      .then((detail): { detail: CoachChallengeDetail | null; forbidden: boolean } => ({ detail, forbidden: false }))
      .catch((err: unknown) => ({ detail: null, forbidden: isForbidden(err) })),
  ]);
  const now = Date.now();
  const back = <BackLink href="/challenges" label={c.backToList} />;

  if (!loaded.detail) {
    return (
      <CoachShell coachName={me?.displayName} section="challenges">
        <PageHead title={c.title} actions={back} />
        <ClientNotice
          message={loaded.forbidden ? c.notYours : c.loadError}
          back={{ href: "/challenges", label: c.backToList }}
        />
      </CoachShell>
    );
  }

  const { challenge, participants } = loaded.detail;
  const consentLine =
    challenge.metric === "STEPS" ? c.consent : challenge.metric === "WORKOUTS" ? c.consentWorkouts : null;
  return (
    <CoachShell coachName={me?.displayName} section="challenges">
      <div style={{ marginBottom: 6 }}>
        <BackLink href="/challenges" label={c.backToList} flush />
      </div>
      {/*
        The h1 is the challenge's NAME and nothing else. Its phase sits beside it, outside the
        heading: with the badge inside, the heading's accessible name read « 10 000 pas par
        jourEn cours » (QA, 2026-10-02). `PageHead` takes the title as the h1's whole content,
        so this head is drawn here (EV-337h, plan §5.6).
      */}
      <div className="challenge-head">
        <div className="challenge-head-text">
          <div className="challenge-head-title">
            <h1 className="dt">{challenge.title}</h1>
            <PhasePill phase={challenge.phase} copy={copy} />
          </div>
          <p className="challenge-head-sub">{`${goalLine(challenge, copy)} · ${windowLine(challenge, copy)}`}</p>
        </div>
        <ChallengeControls id={challenge.id} title={challenge.title} metric={challenge.metric} />
      </div>

      {searchParams.created === "1" && (
        <p role="status" style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ok-ink)" }}>
          {c.created}
        </p>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "4px 16px",
          flexWrap: "wrap",
          fontSize: 12.5,
          color: "var(--ink-3)",
          marginBottom: 12,
        }}
      >
        <span>{c.counts(challenge.participantCount, challenge.acceptedCount)}</span>
        <LoadedAt iso={new Date(now).toISOString()} />
      </div>

      <ChallengeStats detail={loaded.detail} copy={copy} now={now} />

      {participants.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>{c.noParticipants}</p>
        </Card>
      ) : (
        <ProgressTable detail={loaded.detail} copy={copy} now={now} />
      )}

      {/* What accepting shares depends on the metric (the api's accept endpoint). An
          unknown metric says nothing rather than claim steps it may not be. */}
      {consentLine && (
        <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>{consentLine}</p>
      )}
    </CoachShell>
  );
}
