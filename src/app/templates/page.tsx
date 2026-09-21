import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { TemplateLibrary } from "@/components/templates/TemplateLibrary";
import { PageHead } from "@/components/ui/kit";
import { coachApi, hasScope, type CoachTemplateList, type RosterClient } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { copy } from "@/lib/copy";

/**
 * /templates — EV-188b AC1/AC2, the coach's own library.
 *
 * `force-dynamic` for the same reason as every other screen here: ADR-0012 D3 forbids
 * caching an authorization outcome, and a cached library would survive a sign-out.
 *
 * Two reads, in parallel, and NEITHER of them is optional:
 *   · the library itself;
 *   · the roster, filtered to the trainees the coach may write to. AC3 says the picker
 *     "excludes revoked and non-WORKOUTS links entirely — a trainee the coach may not
 *     write to is not offered and then refused", and the only place that can be decided
 *     is the server, from `RosterClient.scopes`. Deciding it in the client island would
 *     mean shipping the full roster to the browser to filter it there.
 *
 * Three states, all explicit: load error · empty library · the list. Never a blank page.
 */
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [me, library, trainees] = await Promise.all([
    readCoachMe(),
    coachApi
      .listTemplates()
      .then((value): CoachTemplateList | null => value)
      .catch(() => null),
    /**
     * A roster failure must NOT take down the library. The list, the rename, the
     * duplicate and the delete all work without it; only "Use on a trainee" needs a
     * trainee, and an empty list renders AC3's own "no trainees" sentence — which is
     * also the true answer for a coach who has none.
     */
    coachApi
      .listClients()
      .then((page) => page.items)
      .catch((): RosterClient[] => []),
  ]);

  /**
   * `hasScope` FAILS CLOSED: an api that sends no `scopes` offers nobody. That is the
   * safe direction here — the cost is a coach who cannot apply a template until the api
   * is fixed, and the alternative cost is the portal offering a trainee whose consent
   * it could not establish and then being refused by the server in front of the coach.
   */
  const targets = trainees
    .filter((client) => client.status === "ACTIVE" && hasScope(client.scopes, "WORKOUTS"))
    .map((client) => ({ id: client.id, traineeDisplayName: client.traineeDisplayName }));

  return (
    <CoachShell coachName={me?.displayName} section="templates">
      <PageHead title={copy.templates.title} sub={copy.templates.subtitle} />
      {library === null ? (
        <ClientNotice message={copy.templates.loadError} />
      ) : (
        <TemplateLibrary library={library} trainees={targets} />
      )}
    </CoachShell>
  );
}
