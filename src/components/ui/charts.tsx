// Inline-SVG chart primitives. No dependency, no client JavaScript: these render on
// the server and are static markup, so the trainee overview has nothing to hydrate.
import type { CSSProperties } from "react";

export interface SparkPoint {
  label: string;
  value: number;
}

/**
 * A weight trend line. Deliberately not the admin's `Sparkline`: this one is a
 * standalone accessible figure (role="img" + a text alternative) rather than a
 * decorative flourish inside a stat card, and it draws its own min/max labels
 * because a weight chart with no scale is a squiggle, not information.
 *
 * A single point draws a dot rather than a zero-length line — the "one weigh-in in
 * eight weeks" case is real and must not render an empty box.
 */
export function TrendChart({
  points,
  ariaLabel,
  height = 132,
  color = "var(--blue-500)",
  style = {},
}: {
  points: SparkPoint[];
  ariaLabel: string;
  height?: number;
  color?: string;
  style?: CSSProperties;
}) {
  const w = 640; // viewBox units; the SVG scales to its container
  const h = height;
  const padY = 18;
  const values = points.map((p) => p.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const X = (i: number) => (points.length === 1 ? w / 2 : (i / (points.length - 1)) * w);
  const Y = (v: number) => padY + (1 - (v - min) / span) * (h - padY * 2);

  const line = points
    .map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.value).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${X(points.length - 1).toFixed(1)} ${h} L${X(0).toFixed(1)} ${h} Z`;

  return (
    <div style={{ width: "100%", ...style }}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={h}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {points.length > 1 && <path d={area} fill="url(#trend-fill)" />}
        {points.length > 1 && (
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {points.map((p, i) => (
          <circle
            key={p.label + i}
            cx={X(i)}
            cy={Y(p.value)}
            r={i === points.length - 1 || points.length === 1 ? 4 : 2.5}
            fill={i === points.length - 1 || points.length === 1 ? color : "var(--surface)"}
            stroke={color}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          fontSize: 12,
          color: "var(--ink-3)",
        }}
      >
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}
