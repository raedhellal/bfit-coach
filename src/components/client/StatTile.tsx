import type { ReactNode } from "react";
import { UiIcon } from "@/components/ui/icons";

/** One of the four overview tiles. Value + a foot line; no delta arrow unless given. */
export function StatTile({
  icon,
  tone = "blue",
  label,
  value,
  foot,
}: {
  icon: string;
  tone?: "blue" | "green" | "purple" | "amber";
  label: string;
  value: ReactNode;
  foot?: ReactNode;
}) {
  const tones: Record<string, [string, string]> = {
    blue: ["var(--blue-50)", "var(--blue-600)"],
    green: ["var(--ok-bg)", "var(--ok-ink)"],
    purple: ["var(--purple-50)", "var(--purple-600)"],
    amber: ["var(--warn-bg)", "var(--warn-ink)"],
  };
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-2xl)",
        boxShadow: "var(--e-card)",
        padding: 16,
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: "var(--r-md)",
          background: tones[tone][0],
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <UiIcon name={icon} size={18} color={tones[tone][1]} />
      </div>
      <div
        className="dt tnum"
        style={{
          fontWeight: 700,
          fontSize: 24,
          color: "var(--ink)",
          marginTop: 12,
          letterSpacing: -0.5,
          lineHeight: 1.15,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 3 }}>{label}</div>
      {foot && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: "1px solid var(--hairline)",
            fontSize: 12,
            color: "var(--ink-3)",
            lineHeight: 1.45,
          }}
        >
          {foot}
        </div>
      )}
    </div>
  );
}
