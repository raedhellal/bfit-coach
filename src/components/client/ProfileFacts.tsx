import { Badge, Card, CardHead } from "@/components/ui/kit";
import { copy } from "@/lib/copy";

/**
 * The trainee's stored profile facts, rendered read-only (EV-184 AC1, EV-185 AC1).
 *
 * One component for both tabs because both stories give the SAME sentence — "From the
 * trainee's profile — you cannot change these here." — and a sentence that appears in
 * two stories should not be able to drift in two files.
 *
 * It renders text and nothing else: no input, no chip with a remove affordance, no
 * link. That is the point. Injuries come from the profile and never from a payload
 * (CS-22 / ADR-0001), and allergies, HALAL and KOSHER come from the trainee's
 * `nutrition_preferences` and may not be overridden by the coach — so the absence of a
 * control here is load-bearing, not a styling choice.
 *
 * Note there is no sentence anywhere in this component claiming the plan is safe for
 * the listed equipment. `RoutinePolicy.apply` takes injuries only; equipment-aware
 * replacement is BUG-053 and is undeployed (EV-184 AC3).
 */
export function ProfileFacts({
  title,
  icon,
  groups,
  emptyAll,
}: {
  title: string;
  icon: string;
  /** Label → values. A group with no values renders `copy.profile.none`. */
  groups: { label: string; values: string[] }[];
  /**
   * Rendered INSTEAD of the groups when every group is empty — EV-185 edge case 1's
   * "No dietary restrictions recorded.", which says something different from four
   * empty lists: it says nothing was recorded, not that nothing applies.
   */
  emptyAll?: string;
}) {
  const allEmpty = groups.every((g) => g.values.length === 0);
  return (
    <Card style={{ marginBottom: 18 }}>
      <CardHead title={title} icon={icon} />
      {emptyAll && allEmpty ? (
        <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "var(--ink-2)" }}>{emptyAll}</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
          {groups.map((group) => (
            <div key={group.label}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--ink-2)",
                  marginBottom: 6,
                }}
              >
                {group.label}
              </div>
              {group.values.length === 0 ? (
                <span style={{ fontSize: 13.5, color: "var(--ink-3)" }}>
                  {copy.profile.none}
                </span>
              ) : (
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                  {group.values.map((value) => (
                    <Badge key={value} tone="neutral">
                      {value}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55 }}>
        {copy.profile.fromProfile}
      </p>
    </Card>
  );
}
