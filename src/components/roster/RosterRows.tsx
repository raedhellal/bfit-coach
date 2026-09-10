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

function FlagChip({ count }: { count: number }) {
  if (count === 0) return <span style={{ color: "var(--ink-3)" }}>{copy.roster.noFlags}</span>;
  return (
    <Badge tone="red" dot>
      {copy.roster.flagCount(count)}
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
                  <Avatar name={c.displayName} size={32} idx={i} />
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--ink)",
                      maxWidth: 220,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={c.displayName}
                  >
                    {c.displayName}
                  </span>
                </Link>
              </Td>
              <Td
                title={c.planName || undefined}
                style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {c.planName || <span style={{ color: "var(--ink-3)" }}>{copy.roster.noPlan}</span>}
              </Td>
              <Td>
                {c.lastWorkoutDate ? (
                  formatDate(c.lastWorkoutDate)
                ) : (
                  <span style={{ color: "var(--ink-3)" }}>{copy.roster.noWorkout}</span>
                )}
              </Td>
              <Td>
                <StreakChip days={c.streakDays} />
              </Td>
              <Td>
                <FlagChip count={c.redFlags.length} />
              </Td>
              <Td>
                <Badge tone={c.status === "ACTIVE" ? "green" : "neutral"}>{c.status}</Badge>
              </Td>
              <Td align="right">
                <Link href={`/clients/${c.id}`} aria-label={c.displayName}>
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
                  <Avatar name={c.displayName} size={36} idx={i} />
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
                      {c.displayName}
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
                      {c.planName || copy.roster.noPlan}
                    </div>
                  </div>
                  <UiIcon name="chevR" size={16} color="var(--ink-3)" />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <StreakChip days={c.streakDays} />
                  <FlagChip count={c.redFlags.length} />
                  <Badge tone={c.status === "ACTIVE" ? "green" : "neutral"}>{c.status}</Badge>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  {copy.roster.colLastWorkout}:{" "}
                  {c.lastWorkoutDate ? formatDate(c.lastWorkoutDate) : copy.roster.noWorkout}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
