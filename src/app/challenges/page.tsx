import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ChallengeList } from "@/components/challenges/ChallengeList";
import { CreateChallengeDialog, type InviteTarget } from "@/components/challenges/CreateChallengeDialog";
import { Card, EmptyState, PageHead } from "@/components/ui/kit";
import { coachApi, type CoachChallengePage, type RosterClient } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";

/**
 * /challenges — EV-321b, the coach's step challenges.
 *
 * `force-dynamic` like every screen here (ADR-0012 D3: an authorization outcome is never
 * cached). Three reads in parallel, and a failure in one does not take the others down:
 *   · the page of challenges — its failure is the load-error card;
 *   · the roster, for the create dialog's invite list — every ACTIVE row. A STEPS
 *     invitation reads no trainee data, so it needs the LINK and no data scope (the api's
 *     `requireManagedLink`); the trainee's own acceptance is the consent to share steps.
 *     A roster failure leaves the list up and the dialog saying there is nobody to invite.
 *
 * Three states, all explicit: load error · no challenges · the list.
 */
export const dynamic = "force-dynamic";

export default async function ChallengesPage({ searchParams }: { searchParams: { page?: string } }) {
  const copy = getCopy();
  const requested = Number.parseInt(searchParams.page ?? "0", 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 0;
  const [me, list, roster] = await Promise.all([
    readCoachMe(),
    coachApi
      .listChallenges(page)
      .then((value): CoachChallengePage | null => value)
      .catch(() => null),
    coachApi
      .listClients()
      .then((p) => p.items)
      .catch((): RosterClient[] => []),
  ]);
  const clients: InviteTarget[] = roster
    .filter((row) => row.status === "ACTIVE")
    .map((row) => ({ id: row.id, traineeDisplayName: row.traineeDisplayName }));

  return (
    <CoachShell coachName={me?.displayName} section="challenges">
      <PageHead
        title={copy.challenges.title}
        sub={copy.challenges.subtitle}
        actions={list === null ? undefined : <CreateChallengeDialog clients={clients} />}
      />
      {list === null ? (
        <ClientNotice message={copy.challenges.loadError} />
      ) : list.items.length === 0 && page === 0 ? (
        <Card>
          <EmptyState icon="trophy" title={copy.challenges.emptyTitle} sub={copy.challenges.emptyBody} />
        </Card>
      ) : (
        <>
          <ChallengeList items={list.items} copy={copy} />
          {list.totalPages > 1 && (
            <nav
              aria-label={copy.challenges.pageOf(page + 1, list.totalPages)}
              style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, fontSize: 13 }}
            >
              {page > 0 && <Link href={`/challenges?page=${page - 1}`}>{copy.challenges.previous}</Link>}
              <span style={{ color: "var(--ink-3)" }}>{copy.challenges.pageOf(page + 1, list.totalPages)}</span>
              {page + 1 < list.totalPages && <Link href={`/challenges?page=${page + 1}`}>{copy.challenges.next}</Link>}
            </nav>
          )}
        </>
      )}
    </CoachShell>
  );
}
