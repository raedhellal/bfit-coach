import type { ReactNode } from "react";
import { Avatar, Badge } from "@/components/ui/kit";
import { BackLink } from "@/components/ui/BackLink";
import { StatusPill } from "@/components/ui/StatusPill";
import { ClientTabs, type ClientTab } from "./ClientTabs";
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
 * EV-337e (plan §5.2): the header can carry chips (the trainee's recorded injuries).
 * EV-342e (audit A5): ONE tab bar on every client page, in the same place under the name,
 * the overview included. EV-337e had replaced the overview's strip with two buttons
 * (« Programme », « Nutrition »); those are gone, so the coach meets the same control on
 * every client page and a new section is one entry of `CLIENT_SECTIONS`. The revoke menu
 * stays in the header. Every control in the header is a 44 px target; the layout is in
 * classes (`.client-head`, globals.css).
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
  return (
    <div className="client-head-wrap">
      <div style={{ marginBottom: 6 }}>
        <BackLink href="/" label={copy.shell.backToRoster} flush />
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
        {action}
      </div>

      <ClientTabs clientId={clientId} active={active} />
    </div>
  );
}
