"use client";
// Ported from b-fit-admin/src/components/ui/icons.tsx (design_handoff_evoli/admin-kit.jsx)
// — 24px grid, 1.8 stroke. The path table is copied whole so an icon name used here is
// the same glyph as in the dashboard; `Logo` is the one divergence (it wordmarks the
// surface it is on).
import type { CSSProperties } from "react";

export const AP: Record<string, string> = {
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM13 13h7v7h-7zM4 13h7v7H4z",
  users:
    "M16 19a4 4 0 0 0-8 0M12 11a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M21 19a3.4 3.4 0 0 0-5-3M18.5 9.4a2.6 2.6 0 1 0-2-4",
  dumbbell: "M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  apple:
    "M12 7c0-2 1.5-3.5 3.5-3.5M9 7.5c-2.5 0-4.5 2-4.5 5.5S7 21 9.5 21c1 0 1.5-.5 2.5-.5s1.5.5 2.5.5c2.5 0 5-4.5 5-8s-2-5.5-4.5-5.5c-1.2 0-2 .6-3 .6s-1.8-.6-3-.6Z",
  spark:
    "M12 3.2 13.7 9 19.5 10.7 13.7 12.4 12 18.2 10.3 12.4 4.5 10.7 10.3 9ZM18.5 3v3.4M20.2 4.7h-3.4",
  card: "M3 7h18a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1ZM2 11h20M6 15h4",
  life: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M15 6l-2.5 3M9 6l2.5 3M15 18l-2.5-3M9 18l2.5-3",
  file: "M6 2h8l4 4v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1ZM14 2v4h4M8 13h8M8 17h6",
  settings:
    "M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.2a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 2.9 14H2.8a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.8 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.5a1.6 1.6 0 0 0 1-1.5V2.8a2 2 0 1 1 4 0v.1A1.6 1.6 0 0 0 17 4.8a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V11a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1Z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5",
  bell: "M18 8.5a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  chevD: "M5 9l7 7 7-7",
  chevR: "M9 5l7 7-7 7",
  chevL: "M15 5l-7 7 7 7",
  chevU: "M5 15l7-7 7 7",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5 10 17.5 19.5 6.5",
  x: "M6 6l12 12M18 6 6 18",
  filter: "M3 5h18M6 12h12M10 19h4",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  moreV: "M12 5h.01M12 12h.01M12 19h.01",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  trend: "M3 16l5-5 4 4 8-8M16 7h5v5",
  trendD: "M3 8l5 5 4-4 8 8M16 17h5v-5",
  edit: "M4 20h4L19 9l-4-4L4 16v4ZM14 6l4 4",
  trash:
    "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  ban: "M5.6 5.6l12.8 12.8M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18",
  download: "M12 3v12M7 10l5 5 5-5M5 21h14",
  upload: "M12 21V9M7 14l5-5 5 5M5 3h14",
  play: "M7 4.5 19 12 7 19.5Z",
  calendar:
    "M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7.5V12l3 2",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z",
  logout: "M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9",
  menu: "M3 6h18M3 12h18M3 18h18",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  star: "M12 3.5 14.6 9l5.9.6-4.4 4 1.2 5.8L12 16.6 6.7 19.4l1.2-5.8-4.4-4L9.4 9Z",
  mail: "M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1ZM3 7l9 6 9-6",
  dollar: "M12 2v20M17 5.5C17 4 14.8 3 12 3S7 4 7 6s2.2 3 5 3.5 5 1.5 5 3.5-2.2 3-5 3-5-1-5-2.5",
  flame:
    "M12 22c4 0 6.5-2.6 6.5-6.2 0-3.6-2.8-5.4-3.7-8.8-.3 2-1.4 3-2.6 3.9C10.6 12.3 9 13.4 9 9.5c-1.6 1.3-3.5 3.6-3.5 6.3C5.5 19.4 8 22 12 22Z",
  heart:
    "M12 20.5C5.5 16 3 12.3 3 8.8 3 6 5 4 7.6 4c1.7 0 3.2.9 4.4 2.5C13.2 4.9 14.7 4 16.4 4 19 4 21 6 21 8.8c0 3.5-2.5 7.2-9 11.7Z",
  trophy:
    "M7 4h10v4a5 5 0 0 1-10 0V4ZM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 17h6M8.5 21h7M12 13v4",
  bolt: "M13 2 4 14h6l-1 8 9-12h-6Z",
  pulse: "M2 12h4l2.5-7 4 14 2.5-7H22",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  mic: "M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3M6 11a6 6 0 0 0 12 0M12 17v4",
  send: "M4 4 21 12 4 20l3-8Z",
  external:
    "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  copy: "M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1ZM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1",
  refresh:
    "M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5",
  dots: "M12 12h.01",
  arrowR: "M4 12h16M13 5l7 7-7 7",
  arrowL: "M20 12H4M11 5l-7 7 7 7",
  user: "M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8M5 20.5a7 7 0 0 1 14 0",
  key: "M14 7a4 4 0 1 1-5.5 5.5L3 18v3h3l1-1h2v-2h2l1.5-1.5A4 4 0 0 1 14 7ZM16.5 7.5h.01",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18",
  camera:
    "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7",
};

export function UiIcon({
  name,
  size = 20,
  color = "currentColor",
  stroke = 1.8,
  fill = false,
  style = {},
}: {
  name: string;
  size?: number;
  color?: string;
  stroke?: number;
  fill?: boolean;
  style?: CSSProperties;
}) {
  const d = AP[name] || "";
  const solid = fill || ["play", "spark", "star", "flame"].includes(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ display: "block", flexShrink: 0, ...style }}
    >
      <path
        d={d}
        stroke={solid ? "none" : color}
        fill={solid ? color : "none"}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ size = 30, on = "light", label = "Evoli Pro" }: { size?: number; on?: "light" | "dark"; label?: string }) {
  const ink = on === "dark" ? "#fff" : "var(--ink)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.3,
          background: "var(--grad-energy)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(160deg,rgba(255,255,255,0.28),transparent 55%)",
          }}
        />
        <svg
          width={size * 0.56}
          height={size * 0.56}
          viewBox="0 0 24 24"
          fill="none"
          style={{ position: "relative" }}
        >
          <path
            d="M3 16 L9 7 L13 13 L21 4"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="21" cy="4" r="2.4" fill="#fff" />
        </svg>
      </div>
      <span
        className="dt"
        style={{ fontWeight: 700, fontSize: size * 0.62, letterSpacing: -0.5, color: ink }}
      >
        {label}
      </span>
    </div>
  );
}
