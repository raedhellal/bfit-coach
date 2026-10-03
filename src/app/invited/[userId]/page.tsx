import { BackLink } from "@/components/ui/BackLink";
import { CoachShell } from "@/components/shell/CoachShell";
import { ClientNotice } from "@/components/client/ClientNotice";
import { InvitedPageActions } from "@/components/invited/InvitedPageActions";
import { wasResent } from "@/lib/addClient";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/kit";
import { readCoachMe } from "@/lib/clientOverview";
import { readAllInvited } from "@/lib/invited";
import { getCopy } from "@/lib/i18n/server";
import { formatExpiryUtc, formatInstant } from "@/lib/format";
import type { InitialisedAccount } from "@/lib/coachApi";

/**
 * /invited/[userId] — EV-204b: one account the coach set up that has not been finished.
 *
 * Server-rendered from the same `GET /coach-portal/trainees` read as the roster (there is no
 * read by id). An id that is not in the coach's Invited list — activated, expired, withdrawn,
 * another coach's, never existed — gets ONE sentence, as the api gives Resend and Withdraw
 * one 404 for all of them (AC-P13).
 *
 * AC-P11 — the body-data control is here, VISIBLE and DISABLED, with the reason beside it
 * and wired to it (`aria-describedby`). It has no handler and there is no server action
 * behind it: b-fit-api has no coach-portal write for a measurement at all (ADR-0022 D22.6:
 * storing one before consent is Art. 9 processing with no basis), and
 * `qa/coach-add-client.spec.ts` checks the vendored spec for one so this stays true.
 */
export const dynamic = "force-dynamic";

export default async function InvitedPage({ params }: { params: { userId: string } }) {
  const copy = getCopy();
  const c = copy.invited;
  const [me, loaded] = await Promise.all([
    readCoachMe(),
    readAllInvited().then(
      (rows): { row: InitialisedAccount | null; failed: boolean } => ({
        row: rows.find((r) => r.userId === params.userId) ?? null,
        failed: false,
      }),
      () => ({ row: null, failed: true })
    ),
  ]);

  if (!loaded.row) {
    return (
      <CoachShell coachName={me?.displayName} section="roster">
        <div style={{ marginBottom: 6 }}>
          <BackLink href="/" label={copy.shell.backToRoster} flush />
        </div>
        <ClientNotice message={loaded.failed ? c.pageLoadError : c.notFound} asHeading />
      </CoachShell>
    );
  }

  const row = loaded.row;
  const expiry = formatExpiryUtc(row.expiresAt, copy.locale);
  const resent = wasResent(row);
  return (
    <CoachShell coachName={me?.displayName} section="roster">
      <div style={{ marginBottom: 6 }}>
        <BackLink href="/" label={copy.shell.backToRoster} flush />
      </div>

      <div className="challenge-head">
        <div className="challenge-head-text">
          <div className="challenge-head-title">
            <h1 className="dt">{row.fullName}</h1>
            <StatusPill tone="blue" icon="mail" label={c.status} />
          </div>
          <p className="challenge-head-sub" data-invited-email="">
            {row.email}
          </p>
        </div>
      </div>

      <section className="ov-card ov-section" aria-labelledby="invited-flow-title">
        <div className="ov-card-head">
          <h2 id="invited-flow-title" className="ov-card-title">
            {c.pageNextTitle}
          </h2>
        </div>
        <dl className="invited-facts">
          <div>
            <dt>{c.colSent}</dt>
            <dd>
              <time dateTime={row.createdAt}>{c.sent(formatInstant(row.createdAt, copy.locale))}</time>
              {resent && (
                <>
                  {" · "}
                  <time dateTime={row.passwordIssuedAt}>{c.resentOn(formatInstant(row.passwordIssuedAt, copy.locale))}</time>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>{c.colExpires}</dt>
            <dd>
              <time dateTime={row.expiresAt} data-invited-expires="">
                {expiry}
              </time>
            </dd>
          </div>
        </dl>
        <p className="ov-note" style={{ marginTop: 14 }}>
          {c.pageFlow(row.fullName)}
        </p>
        <p className="ov-note" style={{ marginTop: 8 }}>
          {c.pageExpiry(expiry)}
        </p>
        <div style={{ marginTop: 16 }}>
          <InvitedPageActions
            target={{ userId: row.userId, fullName: row.fullName, email: row.email, expiresAt: row.expiresAt }}
          />
        </div>
      </section>

      <section className="ov-card ov-section" aria-labelledby="invited-body-title" data-body-data="">
        <div className="ov-card-head">
          <h2 id="invited-body-title" className="ov-card-title">
            {c.bodyDataTitle}
          </h2>
        </div>
        <p id="invited-body-why" className="ov-note">
          {c.bodyDataWhy(row.fullName)}
        </p>
        <div style={{ marginTop: 14 }}>
          {/* A native `disabled` button: not focusable, not clickable, no handler. The reason
              is its description, so a screen reader that lists it says why it is off. */}
          <DisabledControl label={c.bodyDataAction} describedBy="invited-body-why" />
        </div>
      </section>
    </CoachShell>
  );
}

function DisabledControl({ label, describedBy }: { label: string; describedBy: string }) {
  return (
    <span style={{ display: "inline-flex" }} data-body-data-control="">
      <Button variant="secondary" icon="plus" disabled ariaDescribedBy={describedBy}>
        {label}
      </Button>
    </span>
  );
}
