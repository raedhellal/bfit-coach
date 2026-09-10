import { copy } from "@/lib/copy";
import { tierLabel } from "@/lib/format";

/**
 * "0 / 2 profiles · Starter" over a thin bar (AC1/AC4/AC6 — the sentence is verbatim
 * and QA reads it character by character).
 *
 * The tier word comes from the api's `capacity_tier` and is title-cased here; no
 * price is rendered anywhere, because ⛔ D8 is open and the demo commits to nothing
 * commercial (EV-183 Q1).
 */
export function CapacityMeter({
  active,
  capacity,
  tier,
}: {
  active: number;
  capacity: number;
  tier: string;
}) {
  const pct = capacity > 0 ? Math.min(100, (active / capacity) * 100) : 0;
  const label = copy.roster.capacity(active, capacity, tierLabel(tier));
  return (
    <div style={{ minWidth: 210, maxWidth: 320, width: "100%" }}>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--ink-2)",
          marginBottom: 7,
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
      <div
        role="progressbar"
        aria-label={copy.roster.capacityLabel}
        aria-valuenow={active}
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuetext={label}
        style={{
          height: 6,
          borderRadius: "var(--r-pill)",
          background: "var(--surface-3)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: "var(--r-pill)",
            background: "var(--grad-energy)",
          }}
        />
      </div>
    </div>
  );
}
