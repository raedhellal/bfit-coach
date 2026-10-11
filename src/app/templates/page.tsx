import Link from "@/components/ui/Link";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { TemplateLibrary, type ApplyTarget } from "@/components/templates/TemplateLibrary";
import { PageHead } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { coachApi, hasScope, type CoachTemplateList } from "@/lib/coachApi";
import { readCoachMe } from "@/lib/clientOverview";
import { getCopy } from "@/lib/i18n/server";

/**
 * /templates — EV-188b AC1/AC2, the coach's own library.
 *
 * `force-dynamic` for the same reason as every other screen here: ADR-0012 D3 forbids
 * caching an authorization outcome, and a cached library would survive a sign-out.
 *
 * Two reads, started together, and NEITHER of them is optional:
 *   · the library itself;
 *   · the roster, filtered to the trainees the coach may write to. AC3 says the picker
 *     "excludes revoked and non-WORKOUTS links entirely — a trainee the coach may not
 *     write to is not offered and then refused", and the only place that can be decided
 *     is the server, from `RosterClient.scopes`. Deciding it in the client island would
 *     mean shipping the full roster to the browser to filter it there.
 *
 * EV-356g: the page AWAITS only the library. The roster read is the slowest in the system and
 * only « Use on a trainee » needs it, so it goes to the island UNRESOLVED (filtered here, on
 * the server, all the same) and the picker waits inside its dialog (`useRosterRead`).
 *
 * Three states, all explicit: load error · empty library · the list. Never a blank page.
 *
 * EV-337i (plan §5.7): « Modèles d'entraînement », the design's subtitle followed by AC4's
 * sentence (verbatim, stated once, here), and « Nouveau modèle » as a LINK in the head — a
 * navigation, not an action. An EMPTY library draws it once, in the empty state, and not
 * here: AC1's "the empty state and ONE primary control".
 */
export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const copy = getCopy();
  /**
   * A roster failure must NOT take down the library. The list, the rename, the duplicate
   * and the delete all work without it; only "Use on a trainee" needs a trainee.
   *
   * BUG-738: a failure is `null`, NOT `[]`. An empty list renders AC3's "no trainees"
   * sentence, which is the true answer for a coach who has none and a false one for a
   * coach whose roster could not be read. `/nutrition-templates` and `/challenges` already
   * tell the two apart the same way.
   *
   * EV-356g: started BEFORE the awaited reads (so it runs beside them) and never awaited
   * here. The `.catch` is attached at once: the promise never rejects, on the server or in
   * the island.
   *
   * `hasScope` FAILS CLOSED: an api that sends no `scopes` offers nobody. That is the safe
   * direction here — the cost is a coach who cannot apply a template until the api is fixed,
   * and the alternative cost is the portal offering a trainee whose consent it could not
   * establish and then being refused by the server in front of the coach.
   */
  const targets: Promise<ApplyTarget[] | null> = coachApi
    .listClients()
    .then((page) =>
      page.items
        .filter((client) => client.status === "ACTIVE" && hasScope(client.scopes, "WORKOUTS"))
        .map((client) => ({ id: client.id, traineeDisplayName: client.traineeDisplayName }))
    )
    .catch(() => null);
  const [me, library] = await Promise.all([
    readCoachMe(),
    coachApi
      .listTemplates()
      .then((value): CoachTemplateList | null => value)
      .catch(() => null),
  ]);

  return (
    <CoachShell coachName={me?.displayName} section="templates">
      <PageHead
        title={copy.templates.title}
        sub={
          <>
            <span>{copy.templates.subtitle}</span> <span>{copy.templates.private}</span>
          </>
        }
        actions={
          library !== null && library.templates.length === 0 ? undefined : (
            <Link href="/templates/new" className="link-button" data-variant="primary">
              <UiIcon name="plus" size={17} />
              {copy.templates.create}
            </Link>
          )
        }
      />
      {library === null ? (
        <ClientNotice message={copy.templates.loadError} />
      ) : (
        <TemplateLibrary library={library} roster={targets} />
      )}
    </CoachShell>
  );
}
