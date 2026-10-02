/**
 * Redesign §4 `ProgressRing` — this week's adherence as a ring beside its "done / planned".
 *
 * Drawn only from the two numbers printed next to it, and only when `planned > 0`: a week with
 * nothing planned has no ratio, and `0 / 0` would be `NaN` (an invalid value, which a browser
 * silently drops). `done` can exceed `planned` (BUG-198: a workout on a declared rest day
 * counts as planned work), so the arc is capped at a full ring rather than wrapping round.
 *
 * `role="img"` with a sentence: the ring repeats the value, it never replaces it. The drawn
 * ratio is emitted as `data-ratio` so a test can read what was painted.
 */
export function ProgressRing({
  done,
  planned,
  label,
  size = 48,
}: {
  done: number;
  planned: number;
  label: string;
  size?: number;
}) {
  if (!(planned > 0) || !Number.isFinite(done)) return null;
  const ratio = Math.min(Math.max(done / planned, 0), 1);
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      data-ratio={ratio.toFixed(3)}
      style={{ display: "block", flex: "none" }}
    >
      <circle cx={mid} cy={mid} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
      {ratio > 0 && (
        <circle
          cx={mid}
          cy={mid}
          r={r}
          fill="none"
          stroke="var(--blue-600)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(c * ratio).toFixed(2)} ${c.toFixed(2)}`}
          transform={`rotate(-90 ${mid} ${mid})`}
        />
      )}
    </svg>
  );
}
