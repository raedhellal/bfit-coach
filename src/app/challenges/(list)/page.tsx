import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { ChallengeList } from "@/components/challenges/ChallengeList";
import { CreateChallengeDialog, type InviteTarget } from "@/components/challenges/CreateChallengeDialog";
import { Card, EmptyState, PageHead } from "@/components/ui/kit";
import { coachApi, DEFAULT_ROSTER_SORT, type CoachChallengePage, type RosterClient } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { readWholeRoster } from "@/lib/rosterAll";
import { getCopy } from "@/lib/i18n/server";

/**
 * /challenges — EV-321b, the coach's step challenges.
 *
 * `force-dynamic` like every screen here (ADR-0012 D3: an authorization outcome is never
 * cached). Three reads in parallel, and a failure in one does not take the others down:
 *   · the page of challenges — its failure is the load-error card;
 *   · the roster, for the create dialog's invite list — every ACTIVE row, from EVERY
 *     page (BUG-472: page 0 alone stopped at the 100th client). A STEPS
 *     invitation reads no trainee data, so it needs the LINK and no data scope (the api's
 *     `requireManagedLink`); the trainee's own acceptance is the consent to share steps.
 *     A roster failure leaves the list up and the dialog saying the clients could not be
 *     loaded — never that there are none, which would be a different fact.
 *
 * Three states, all explicit: load error · no challenges · the list (EV-337h: cards,
 * three columns from 1280 px, two from 768, one below; plan §5.5).
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
    readWholeRoster((p) => coachApi.listClients(DEFAULT_ROSTER_SORT, p))
      .then((rows): RosterClient[] | null => rows)
      .catch(() => null),
  ]);
  const clients: InviteTarget[] = (roster ?? [])
    .filter((row) => row.status === "ACTIVE")
    .map((row) => ({ id: row.id, traineeDisplayName: row.traineeDisplayName }));

  return (
    <CoachShell coachName={me?.displayName} section="challenges">
      <PageHead
        title={copy.challenges.title}
        sub={copy.challenges.subtitle}
        actions={list === null ? undefined : <CreateChallengeDialog clients={clients} rosterFailed={roster === null} />}
      />
      {list === null ? (
        <ClientNotice message={copy.challenges.loadError} />
      ) : list.items.length === 0 && page === 0 ? (
        <Card>
          <EmptyState icon="trophy" title={copy.challenges.emptyTitle} sub={copy.challenges.emptyBody} />
        </Card>
      ) : (
        <>
          <ChallengeList items={list.items} copy={copy} now={Date.now()} />
          {/* The pager's links are controls, not words in a sentence: 44 px (X3). */}
          {list.totalPages > 1 && (
            <nav
              aria-label={copy.challenges.pageOf(page + 1, list.totalPages)}
              style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, fontSize: 13, flexWrap: "wrap" }}
            >
              {page > 0 && (
                <Link href={`/challenges?page=${page - 1}`} className="link-button" data-variant="secondary">
                  {copy.challenges.previous}
                </Link>
              )}
              <span style={{ color: "var(--ink-3)" }}>{copy.challenges.pageOf(page + 1, list.totalPages)}</span>
              {page + 1 < list.totalPages && (
                <Link href={`/challenges?page=${page + 1}`} className="link-button" data-variant="secondary">
                  {copy.challenges.next}
                </Link>
              )}
            </nav>
          )}
        </>
      )}
    </CoachShell>
  );
}
