import { CoachShell } from "@/components/shell/CoachShell";
import { CapacityMeter } from "@/components/roster/CapacityMeter";
import { InviteButton } from "@/components/roster/InviteButton";
import { AddClientButton } from "@/components/roster/AddClientButton";
import { InvitedSection, type InvitedRowData } from "@/components/roster/InvitedSection";
import { RosterBrowser, type RosterEntry } from "@/components/roster/RosterBrowser";
import { RosterRow } from "@/components/roster/RosterRows";
import { RosterSortToggle } from "@/components/roster/RosterSortToggle";
import { Card, EmptyState, PageHead } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { coachApi, type CoachMe, type RosterClient } from "@/lib/coachApi";
import { readRosterSort } from "@/lib/rosterSort";
import { classifyRosterRow, dayIn, searchKey } from "@/lib/rosterView";
import { getCopy } from "@/lib/i18n/server";
import { tierLabel } from "@/lib/format";
import { readAllInvited } from "@/lib/invited";

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
  const copy = getCopy();
  let me: CoachMe | null = null;
  let clients: RosterClient[] | null = null;
  /**
   * EV-337d. "Today" is read ONCE, on the server, in Europe/Paris (D1), and every row is
   * classified against it — so a render cannot put two rows on two different days, and the
   * browser's clock never decides who is inactive. Inside the try: if the zone data cannot
   * produce a day, the roster's error card is the answer, not a roster of wrong groups.
   */
  let today: string | null = null;
  let failed = false;
  /**
   * EV-187 AC2. The session cookie, or "Needs attention" on a fresh session — read on
   * the SERVER because the api does the sorting: the key spans the whole roster and
   * this page holds one page of it, so sorting here would order page 1 among itself.
   */
  const sort = readRosterSort();
  /**
   * EV-204b — the Invited accounts, read beside the roster (one more request in the same
   * round trip). Its failure is its OWN state: the roster still renders, and the section
   * says the invitations could not be loaded rather than showing none.
   */
  const invitedRead = readAllInvited().then(
    (rows): { rows: InvitedRowData[]; failed: boolean } => ({
      // Field by field: the row data is serialised into a client island.
      rows: rows.map((r) => ({
        userId: r.userId,
        fullName: r.fullName,
        email: r.email,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        passwordIssuedAt: r.passwordIssuedAt,
      })),
      failed: false,
    }),
    () => ({ rows: [], failed: true })
  );

  /**
   * BUG-692 — how many ACTIVE links the api holds beyond the one page read. `listClients`
   * is paged; one page of ROSTER_PAGE_SIZE (100, the api's own maximum) is the entire
   * roster for every tier sold today (STARTER, 10), so there is no pager on this screen.
   * Past 100, rows 101+ would otherwise vanish without a word: the envelope's
   * `totalElements` is read here and the roster says how many are not shown. The fixture
   * constructs it: `evoli_fixture_roster_extra=95` serves 101 links, page 0 holds 100
   * (qa/roster-not-shown.spec.ts).
   */
  let hiddenCount = 0;

  try {
    const [meResult, roster] = await Promise.all([
      coachApi.getMe(),
      coachApi.listClients(sort),
      invitedRead,
    ]);
    me = meResult;
    // Rendered in the order the api returned. Re-sorting here is the defect, not the
    // safety net: see the block where `sortNeedsAttentionFirst` used to live.
    clients = roster.items;
    hiddenCount = Math.max(0, roster.totalElements - roster.items.length);
    today = dayIn(new Date());
  } catch {
    failed = true;
  }

  if (failed || !me || !clients || !today) {
    return (
      <CoachShell section="roster">
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
            {/* BUG-616: one control, a link drawn as the secondary button (was a <button>
                inside the <a>). Still a plain <a>: the retry is a full document load. */}
            <a href="/" className="link-button" data-variant="secondary">
              <UiIcon name="refresh" size={16.5} />
              {copy.roster.retry}
            </a>
          </div>
        </Card>
      </CoachShell>
    );
  }

  const invited = await invitedRead;
  const full = me.active >= me.capacity;
  // Edge case 5's sentence, built from the api's own tier and capacity so it can never
  // contradict the meter beside it.
  const fullReason = copy.roster.inviteFull(tierLabel(me.tier), me.capacity);

  const day = today;
  const entries: RosterEntry[] = clients.map((c, i) => {
    const view = classifyRosterRow(c, day);
    return {
      id: c.id,
      group: view.group,
      flagged: view.flagged,
      inactive: view.inactive,
      search: searchKey(`${c.traineeDisplayName} ${c.currentPlanName ?? ""}`),
      node: <RosterRow client={c} view={view} idx={i} />,
    };
  });
  const toReview = entries.filter((e) => e.group === "attention").length;

  return (
    // D3 (restated 2026-10-02, PO ruling 1): the navigation's count is the number of FLAGGED
    // rows — the « À traiter » chip and the subtitle's « n à traiter » — from THIS page's own
    // read. Never a 0 standing in for "not loaded": the failure branch above passes none, the
    // shell draws nothing for 0, and no other page reads the roster to feed a badge (plan
    // §5.1, ADR-0033 2b withdrawn). Search and filters live in the island and cannot reach it.
    <CoachShell coachName={me.displayName} section="roster" toReviewCount={toReview}>
      <PageHead
        title={copy.roster.title}
        sub={clients.length > 0 ? copy.roster.subtitleCounts(clients.length, toReview) : copy.roster.subtitle}
        actions={
          // EV-204b: « Ajouter un client » is the roster's primary action. The link invite
          // stays beside it (its own empty-state home below when there are no clients).
          <div className="roster-actions">
            <AddClientButton
              capacityNote={full ? copy.addClient.capacityNote(tierLabel(me.tier), me.capacity) : undefined}
              inviteDisabledReason={full ? fullReason : undefined}
            />
            {clients.length > 0 && <InviteButton variant="secondary" disabled={full} disabledReason={fullReason} />}
          </div>
        }
      />

      {/* The capacity meter moves to a compact line (plan §5.1), beside AC2's sort toggle. */}
      <div className="roster-meta">
        <CapacityMeter active={me.active} capacity={me.capacity} tier={me.tier} />
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", minWidth: 0 }}>
          {full && <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>{fullReason}</span>}
          {/* AC2's one control (R7: kept, although the design does not draw it). Absent on
              the empty roster: an order for zero rows is a control that can only mislead. */}
          {clients.length > 0 && <RosterSortToggle sort={sort} />}
        </div>
      </div>

      <InvitedSection rows={invited.rows} loadFailed={invited.failed} />

      {clients.length === 0 ? (
        <Card pad={0}>
          <EmptyState
            icon="users"
            title={copy.roster.emptyTitle}
            sub={copy.roster.emptyBody}
            action={<InviteButton disabled={full} disabledReason={fullReason} />}
          />
        </Card>
      ) : (
        <>
          {/* BUG-692: above the list, where a coach looking for a missing client reads first. */}
          {hiddenCount > 0 && (
            <p className="roster-not-shown" data-roster-not-shown="">
              {copy.roster.notShown(hiddenCount)}
            </p>
          )}
          <RosterBrowser entries={entries} />
        </>
      )}
    </CoachShell>
  );
}
