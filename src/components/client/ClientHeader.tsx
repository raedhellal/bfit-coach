import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, Badge } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { ClientTabs, type ClientTab } from "./ClientTabs";
import { copy } from "@/lib/copy";
import { formatInstant, truncateName } from "@/lib/format";

/**
 * The header every trainee tab shares: back to the roster, who this is, since when,
 * and the tab strip.
 *
 * Extracted from the overview when EV-184b/EV-185b added two more tabs — three copies
 * of a header is three places for the trainee's name to be rendered differently, and
 * the name is the one string on this screen that belongs to a real person.
 *
 * `action` is the overview's revoke menu. The other two tabs pass nothing: revoking
 * from inside the editor would discard work with no warning.
 */
export function ClientHeader({
  clientId,
  traineeDisplayName,
  since,
  active,
  action,
}: {
  clientId: string;
  traineeDisplayName: string;
  since?: string | null;
  active: ClientTab;
  action?: ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--ink-3)",
          marginBottom: 14,
        }}
      >
        <UiIcon name="arrowL" size={14} color="var(--ink-3)" />
        {copy.shell.backToRoster}
      </Link>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
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
              fontSize: 24,
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
          {since && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 7 }}>
              <Badge tone="neutral">{copy.client.coachedSince(formatInstant(since))}</Badge>
            </div>
          )}
        </div>
        {action}
      </div>

      <ClientTabs clientId={clientId} active={active} />
    </div>
  );
}
