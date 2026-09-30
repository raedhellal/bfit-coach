import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ChallengeControls } from "@/components/challenges/ChallengeControls";
import { PHASE_TONE, goalLine, windowLine } from "@/components/challenges/ChallengeList";
import { LoadedAt } from "@/components/challenges/LoadedAt";
import { ProgressTable } from "@/components/challenges/ProgressTable";
import { Badge, Card, PageHead } from "@/components/ui/kit";
import { coachApi, isForbidden, type CoachChallengeDetail } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";

/**
 * /challenges/[id] — EV-321b, one challenge and its participants' progress, ranked.
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
  const back = (
    <Link href="/challenges" style={{ fontSize: 13, color: "var(--ink-2)" }}>
      {c.backToList}
    </Link>
  );

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
  return (
    <CoachShell coachName={me?.displayName} section="challenges">
      <div style={{ marginBottom: 10 }}>{back}</div>
      <PageHead
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ overflowWrap: "anywhere" }}>{challenge.title}</span>
            <Badge tone={PHASE_TONE[challenge.phase]} dot>
              {c.phase[challenge.phase]}
            </Badge>
          </span>
        }
        sub={`${goalLine(challenge, copy)} · ${windowLine(challenge, copy)}`}
        actions={<ChallengeControls id={challenge.id} title={challenge.title} />}
      />

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

      {participants.length === 0 ? (
        <Card>
          <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>{c.noParticipants}</p>
        </Card>
      ) : (
        <ProgressTable detail={loaded.detail} copy={copy} now={now} />
      )}

      <p style={{ margin: "14px 0 0", fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>{c.consent}</p>
    </CoachShell>
  );
}
