import type { ReactNode } from "react";

/**
 * One overview stat card (redesign §4 `StatCard`, plan §5.2): a label, the value, a foot line,
 * and optionally a picture beside them (the adherence ring).
 *
 * ⚠ The label, the value and the foot are SIBLINGS, direct children of the card. The suite
 * finds a tile by its exact label and reads the card from the label's parent
 * (`getByText("Current streak").locator("..")`, `ancestor::div[1]` for "Last session"), so
 * wrapping the label in another element would make those reads see the label alone. The
 * layout is a class (`.stat-card`, globals.css): a two-column grid when a picture is given.
 *
 * Server-safe: no hooks.
 */
export function StatTile({
  label,
  value,
  foot,
  visual,
}: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  /** A picture that repeats the value (it must carry its own text alternative). */
  visual?: ReactNode;
}) {
  return (
    <div className="stat-card" data-visual={visual ? "" : undefined}>
      {visual && <div className="stat-card-visual">{visual}</div>}
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value dt tnum">{value}</div>
      {foot && <div className="stat-card-foot">{foot}</div>}
    </div>
  );
}
