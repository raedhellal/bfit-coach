import { UiIcon } from "./icons";
import type { Tone } from "./kit";

/**
 * Evoli Pro redesign §4 — `StatusPill`: a status as a word, with colour as decoration.
 *
 * `label` is required by the type: a status is never colour alone (WCAG 1.4.1, the brief).
 * The four tones map onto the existing `--{ok,warn,err,info}-{bg,ink}` pairs (plan §2.1:
 * the design's own pill colours are not imported — each existing pair has more contrast).
 *
 * Server-safe: no hooks, no client JavaScript.
 */
const TONES: Record<Extract<Tone, "neutral" | "green" | "amber" | "red" | "blue">, { bg: string; fg: string }> = {
  neutral: { bg: "var(--surface-2)", fg: "var(--ink-2)" },
  green: { bg: "var(--ok-bg)", fg: "var(--ok-ink)" },
  amber: { bg: "var(--warn-bg)", fg: "var(--warn-ink)" },
  red: { bg: "var(--err-bg)", fg: "var(--err-ink)" },
  blue: { bg: "var(--info-bg)", fg: "var(--info-ink)" },
};

export type StatusTone = keyof typeof TONES;

export function StatusPill({
  tone,
  icon,
  label,
  id,
}: {
  tone: StatusTone;
  icon?: string;
  label: string;
  id?: string;
}) {
  const t = TONES[tone];
  return (
    <span className="status-pill" id={id} data-tone={tone} style={{ background: t.bg, color: t.fg }}>
      {icon && (
        <span aria-hidden="true" style={{ display: "inline-flex", flex: "none" }}>
          <UiIcon name={icon} size={13} />
        </span>
      )}
      <span className="status-pill-label">{label}</span>
    </span>
  );
}
