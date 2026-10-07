import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Badge } from "@/components/ui/kit";
import { StatusPill } from "@/components/ui/StatusPill";
import { ClientTabs, type ClientTab } from "./ClientTabs";
import { RosterBackLink } from "./RosterBackLink";
import { getCopy } from "@/lib/i18n/server";
import { formatInstant, truncateName } from "@/lib/format";

/**
 * The header every trainee tab shares: back to the roster, who this is, since when,
 * and the way to the other tabs.
 *
 * Extracted from the overview when EV-184b/EV-185b added two more tabs — three copies
 * of a header is three places for the trainee's name to be rendered differently, and
 * the name is the one string on this screen that belongs to a real person.
 *
 * `action` is the overview's revoke menu. The other two tabs pass nothing: revoking
 * from inside the editor would discard work with no warning.
 *
 * EV-337e (plan §5.2): on the OVERVIEW the tab strip gives way to the design's two
 * buttons, « Programme » and « Nutrition », beside the revoke menu, and the header can
 * carry chips (the trainee's recorded injuries). The routine and nutrition tabs keep the
 * strip until their own redesign (EV-337f/g): it is still how they lead back here.
 * Every control in the header is a 44 px target; the layout is in classes (`.client-head`,
 * globals.css) so the actions wrap under the name on a phone.
 */
export function ClientHeader({
  clientId,
  traineeDisplayName,
  since,
  active,
  action,
  chips,
}: {
  clientId: string;
  traineeDisplayName: string;
  since?: string | null;
  active: ClientTab;
  action?: ReactNode;
  /** Words shown as warning chips under the name. Each is text, never a colour alone. */
  chips?: string[];
}) {
  const copy = getCopy();
  const overview = active === "overview";
  return (
    <div className="client-head-wrap">
      <div style={{ marginBottom: 6 }}>
        {/* BUG-691: Back to the roster as the coach left it, without a new history entry. */}
        <RosterBackLink label={copy.shell.backToRoster} />
      </div>

      <div className="client-head">
        <div className="client-head-id">
          <Avatar name={traineeDisplayName} size={48} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              className="dt"
              // EV-185 edge case 7: a 40+ character name truncates rather than pushing
              // the revoke control off a 390 px viewport. `title` keeps the whole name.
              title={traineeDisplayName}
              style={{
                margin: 0,
                fontWeight: 700,
                fontSize: "var(--fs-h1)",
                letterSpacing: -0.6,
                color: "var(--ink)",
                overflowWrap: "anywhere",
              }}
            >
              {truncateName(traineeDisplayName)}
            </h1>
            {/*
              No plan badge: `TraineeOverviewResponse` carries no plan name — the plan is
              a roster-row field only. Rendering "No plan" here would state something about
              the trainee that this response does not say.
            */}
            {(since || (chips && chips.length > 0)) && (
              <div className="client-head-chips">
                {since && (
                  <Badge tone="neutral">{copy.client.coachedSince(formatInstant(since, copy.locale))}</Badge>
                )}
                {chips?.map((chip) => <StatusPill key={chip} tone="amber" icon="shield" label={chip} />)}
              </div>
            )}
          </div>
        </div>
        {overview ? (
          <div className="client-head-actions">
            <Link href={`/clients/${clientId}/routine`} className="link-button" data-variant="secondary">
              {copy.tabs.routine}
            </Link>
            <Link href={`/clients/${clientId}/nutrition`} className="link-button" data-variant="secondary">
              {copy.tabs.nutrition}
            </Link>
            {action}
          </div>
        ) : (
          action
        )}
      </div>

      {!overview && <ClientTabs clientId={clientId} active={active} />}
    </div>
  );
}
