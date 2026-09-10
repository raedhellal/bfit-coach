import Link from "next/link";
import { Avatar, Badge, DataTable, Td } from "@/components/ui/kit";
import { UiIcon } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import { formatDate } from "@/lib/format";
import type { RosterClient } from "@/lib/coachApi";

/**
 * The populated roster, rendered twice: a table above 768 px and a stacked card list
 * below it, with CSS choosing (see globals.css). Both are server-rendered, so the
 * narrow layout is correct on first paint — AC1 is demoed at 390 px and a table that
 * needs sideways scrolling to read a trainee's name is not "readable and tappable".
 *
 * **There is no red-flag chip here.** `GET /coach-portal/clients` returns no
 * `redFlags` — the rules are computed per trainee by the overview endpoint — so a chip
 * on this screen would cost one extra request per row on every roster render. The
 * flags live on /clients/[id]; the needs-attention signal here is the ordering
 * (`sortNeedsAttentionFirst`: least recently trained first, never-trained at the top).
 */

function StreakChip({ days }: { days: number }) {
  if (days <= 0) return <span style={{ color: "var(--ink-3)" }}>{copy.roster.noStreak}</span>;
  return (
    <Badge tone="amber">
      <UiIcon name="flame" size={12} />
      {copy.roster.streak(days)}
    </Badge>
  );
}

export function RosterRows({ clients }: { clients: RosterClient[] }) {
  return (
    <>
      <div className="only-wide">
        <DataTable
          minWidth={680}
          columns={[
            { label: copy.roster.colTrainee },
            { label: copy.roster.colPlan },
            { label: copy.roster.colLastWorkout },
            { label: copy.roster.colStreak },
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
                {c.currentPlanName || <span style={{ color: "var(--ink-3)" }}>{copy.roster.noPlan}</span>}
              </Td>
              <Td>
                {c.lastCompletedWorkoutDate ? (
                  formatDate(c.lastCompletedWorkoutDate)
                ) : (
                  <span style={{ color: "var(--ink-3)" }}>{copy.roster.noWorkout}</span>
                )}
              </Td>
              <Td>
                <StreakChip days={c.currentStreakDays} />
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
                      {c.currentPlanName || copy.roster.noPlan}
                    </div>
                  </div>
                  <UiIcon name="chevR" size={16} color="var(--ink-3)" />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <StreakChip days={c.currentStreakDays} />
                  <Badge tone={c.status === "ACTIVE" ? "green" : "neutral"}>{c.status}</Badge>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  {copy.roster.colLastWorkout}:{" "}
                  {c.lastCompletedWorkoutDate ? formatDate(c.lastCompletedWorkoutDate) : copy.roster.noWorkout}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
