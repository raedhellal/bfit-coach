import { CoachShell } from "@/components/shell/CoachShell";
import { CapacityMeter } from "@/components/roster/CapacityMeter";
import { InviteButton } from "@/components/roster/InviteButton";
import { RosterRows } from "@/components/roster/RosterRows";
import { Button, Card, EmptyState, PageHead } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { coachApi, sortNeedsAttentionFirst, type CoachMe, type RosterClient } from "@/lib/coachApi";
import { copy } from "@/lib/copy";

/**
 * / — the roster (AC1, AC4).
 *
 * Server component: the api call happens on the server with the httpOnly cookie, so
 * the browser gets HTML and no token. Nothing here is fetched client-side.
 *
 * `force-dynamic`: AC6 requires a revoked trainee to be gone on the coach's very next
 * plain reload. A statically rendered or route-cached roster would be a stale
 * authorization view, which is the one thing ADR-0012 D3 forbids.
 */
export const dynamic = "force-dynamic";

export default async function RosterPage() {
  let me: CoachMe | null = null;
  let clients: RosterClient[] | null = null;
  let failed = false;

  try {
    const [meResult, roster] = await Promise.all([
      coachApi.getMe(),
      coachApi.listClients(),
    ]);
    me = meResult;
    clients = sortNeedsAttentionFirst(roster.items);
  } catch {
    failed = true;
  }

  if (failed || !me || !clients) {
    return (
      <CoachShell>
        <PageHead title={copy.roster.title} sub={copy.roster.subtitle} />
        <Card>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              padding: "32px 16px",
              textAlign: "center",
            }}
          >
            <UiIcon name="ban" size={26} color="var(--err-ink)" />
            <div style={{ fontSize: 14.5, color: "var(--ink-2)" }}>{copy.roster.loadError}</div>
            <a href="/">
              <Button variant="secondary" icon="refresh">
                {copy.roster.retry}
              </Button>
            </a>
          </div>
        </Card>
      </CoachShell>
    );
  }

  const full = me.capacity.active >= me.capacity.capacity;

  return (
    <CoachShell coachName={me.displayName}>
      <PageHead
        title={copy.roster.title}
        sub={copy.roster.subtitle}
        actions={
          clients.length > 0 ? (
            <InviteButton disabled={full} disabledReason={copy.roster.inviteFull} />
          ) : undefined
        }
      />

      <Card style={{ marginBottom: 18 }} pad={18}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
            justifyContent: "space-between",
          }}
        >
          <CapacityMeter
            active={me.capacity.active}
            capacity={me.capacity.capacity}
            tier={me.capacity.tier}
          />
          {full && (
            <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{copy.roster.inviteFull}</span>
          )}
        </div>
      </Card>

      {clients.length === 0 ? (
        <Card pad={0}>
          <EmptyState
            icon="users"
            title={copy.roster.emptyTitle}
            sub={copy.roster.emptyBody}
            action={<InviteButton disabled={full} disabledReason={copy.roster.inviteFull} />}
          />
        </Card>
      ) : (
        <RosterRows clients={clients} />
      )}
    </CoachShell>
  );
}
