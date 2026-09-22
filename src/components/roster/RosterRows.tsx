import Link from "next/link";
import { Avatar, Badge, DataTable, Td } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import { formatDate } from "@/lib/format";
import { hasScope, type RosterClient } from "@/lib/coachApi";

/**
 * The populated roster, rendered twice: a table above 768 px and a stacked card list
 * below it, with CSS choosing (see globals.css). Both are server-rendered, so the
 * narrow layout is correct on first paint — AC1 is demoed at 390 px and a table that
 * needs sideways scrolling to read a trainee's name is not "readable and tappable".
 *
 * **There IS a red-flag badge here, as of EV-187b.** There was not, and the reason was
 * good: `GET /coach-portal/clients` carried no flag count, so a chip would have cost
 * one extra request per row on every roster render. EV-187a put `redFlagCount` on the
 * row — computed from the SAME evaluation the trainee's own page runs, so the badge and
 * the flags on that page cannot disagree — and the endpoint now sorts, so the
 * needs-attention signal is the ordering AND the badge instead of the ordering alone.
 *
 * Three of these five columns can be absent because the link did not share them — and
 * since the list response carries `scopes` per row (contract item 4 / D5 S1), the row
 * can now say WHICH. "No plan", "No workouts yet" and "No streak" are statements about
 * the trainee and are rendered only when the relevant scope is held; without it the
 * cell says "Not shared" and nothing else. An absence is never a number and never a
 * claim about behaviour.
 *
 * `hasScope` fails closed, so an api that sends no `scopes` on the row lands every
 * one of these on "Not shared" rather than throwing or guessing.
 */

/**
 * `days` is nullable since ADR-0015 F1: the roster is filtered per item on the link's
 * scopes, so a trainee who has not shared PROGRESS has no streak to report. The chip
 * renders a dash for that — NOT "No streak", which is a claim about the trainee, and
 * not a 0, which is why the api stopped sending a primitive.
 *
 * `shared` comes first and the null second, for the same reason the overview reads the
 * scope flag first: an api that has not been told to null the field will send a
 * primitive `0`, and "No streak" about a trainee whose sessions this coach has never
 * been allowed to see is a claim made out of nothing.
 */
function StreakChip({ days, shared }: { days: number | null; shared: boolean }) {
  if (!shared || days === null)
    return <span style={{ color: "var(--ink-3)" }}>{copy.common.dash}</span>;
  if (days <= 0) return <span style={{ color: "var(--ink-3)" }}>{copy.roster.noStreak}</span>;
  return (
    <Badge tone="amber">
      <UiIcon name="flame" size={12} />
      {copy.roster.streak(days)}
    </Badge>
  );
}

/**
 * EV-187 AC2's flag column. Three values, three renderings, and collapsing any two of
 * them is the defect:
 *
 *   · `n > 0` → the badge, "1 flag" / "2 flags" (both spellings are verified).
 *   · `0`     → **nothing**. Not "0 flags", not a grey chip — a row with no flags is a
 *               row the coach can skip, and a badge reading zero is noise on the one
 *               screen whose job is to be scanned.
 *   · `null`  → "Not shared". The link carries neither WORKOUTS nor WEIGH_INS, so no
 *               rule could be evaluated at all. It is never rendered as "no flags":
 *               a coach must not read a consent boundary as good news. The api sorts
 *               these rows LAST for the same reason.
 */
function FlagBadge({ count }: { count: number | null }) {
  /**
   * `typeof`, not `=== null`, and it FAILS CLOSED for the same reason `hasScope` does:
   * the type describes the api we are building, not every api this build can be pointed
   * at. An api that predates EV-187a sends no `redFlagCount` at all, so at runtime the
   * value is `undefined` — and `undefined <= 0` is false, which would have rendered
   * "undefined flags" in a coach's roster. Silence about a flag count is "not shared",
   * which under-claims; the other direction invents news.
   */
  if (typeof count !== "number")
    return <span style={{ color: "var(--ink-3)" }}>{copy.roster.flagsNotShared}</span>;
  if (count <= 0) return null;
  return (
    <Badge tone="red">
      <UiIcon name="flag" size={12} />
      {copy.roster.flags(count)}
    </Badge>
  );
}

export function RosterRows({ clients }: { clients: RosterClient[] }) {
  return (
    <>
      <div className="only-wide">
        <DataTable
          minWidth={760}
          columns={[
            { label: copy.roster.colTrainee },
            { label: copy.roster.colPlan },
            { label: copy.roster.colLastWorkout },
            { label: copy.roster.colStreak },
            { label: copy.roster.colFlags },
            { label: copy.roster.colStatus },
            { label: "", w: 44 },
          ]}
        >
          {clients.map((c, i) => (
            <tr key={c.id} className="row-hover">
              <Td>
                <Link
                  href={`/clients/${c.id}`}
                  style={{ display: "flex", alignItems: "center", gap: 10 }}
                >
                  <Avatar name={c.traineeDisplayName} size={32} idx={i} />
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--ink)",
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={c.traineeDisplayName}
                  >
                    {c.traineeDisplayName}
                  </span>
                </Link>
              </Td>
              <Td
                title={c.currentPlanName || undefined}
                style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {/* "No plan" is a statement about the trainee's app; "Not shared" is
                    a statement about the link. `scopes` is what makes them two cells
                    instead of one hedge. */}
                {c.currentPlanName || (
                  <span style={{ color: "var(--ink-3)" }}>
                    {hasScope(c.scopes, "WORKOUTS") ? copy.roster.noPlan : copy.client.notShared}
                  </span>
                )}
              </Td>
              <Td>
                {c.lastCompletedWorkoutDate ? (
                  formatDate(c.lastCompletedWorkoutDate)
                ) : (
                  // Two readings of one null, and `scopes` picks: PROGRESS held means
                  // the trainee has genuinely never completed a workout ("No workouts
                  // yet", and `sortNeedsAttentionFirst` puts the row FIRST); PROGRESS
                  // withheld means the date is unknown ("Not shared", sorted last).
                  <span style={{ color: "var(--ink-3)" }}>
                    {hasScope(c.scopes, "PROGRESS")
                      ? copy.roster.noWorkout
                      : copy.client.notShared}
                  </span>
                )}
              </Td>
              <Td>
                <StreakChip
                  days={c.currentStreakDays}
                  shared={hasScope(c.scopes, "PROGRESS")}
                />
              </Td>
              <Td>
                <FlagBadge count={c.redFlagCount} />
              </Td>
              <Td>
                <Badge tone={c.status === "ACTIVE" ? "green" : "neutral"}>{c.status}</Badge>
              </Td>
              <Td align="right">
                <Link href={`/clients/${c.id}`} aria-label={c.traineeDisplayName}>
                  <UiIcon name="chevR" size={16} color="var(--ink-3)" />
                </Link>
              </Td>
            </tr>
          ))}
        </DataTable>
      </div>

      <div className="only-narrow">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {clients.map((c, i) => (
            <Link key={c.id} href={`/clients/${c.id}`}>
              <div
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-2xl)",
                  boxShadow: "var(--e-card)",
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar name={c.traineeDisplayName} size={36} idx={i} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: 15,
                        color: "var(--ink)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.traineeDisplayName}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: "var(--ink-3)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.currentPlanName ||
                        (hasScope(c.scopes, "WORKOUTS")
                          ? copy.roster.noPlan
                          : copy.client.notShared)}
                    </div>
                  </div>
                  <UiIcon name="chevR" size={16} color="var(--ink-3)" />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <StreakChip
                    days={c.currentStreakDays}
                    shared={hasScope(c.scopes, "PROGRESS")}
                  />
                  {/* The narrow card carries the badge too — AC2 is demoed at 390 px,
                      and a triage signal that only exists on a desktop table is not a
                      triage signal. */}
                  <FlagBadge count={c.redFlagCount} />
                  <Badge tone={c.status === "ACTIVE" ? "green" : "neutral"}>{c.status}</Badge>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  {copy.roster.colLastWorkout}:{" "}
                  {c.lastCompletedWorkoutDate
                    ? formatDate(c.lastCompletedWorkoutDate)
                    : hasScope(c.scopes, "PROGRESS")
                      ? copy.roster.noWorkout
                      : copy.client.notShared}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
