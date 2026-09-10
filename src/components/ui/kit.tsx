"use client";
// Evoli Pro UI kit — copied from b-fit-admin/src/components/ui/kit.tsx (ADR-0012 D5:
// copied, not extracted; with two consumers a shared package is premature, revisit at
// MVE-7). Unused primitives (Textarea, Toggle, Checkbox, Tabs, SegTabs, Toolbar,
// Pagination) were dropped rather than carried dead; re-copy from the admin verbatim
// if a screen needs one.
//
// Divergences from the admin copy, both deliberate:
//   · Card uses --r-2xl (24px) with a hairline border, per the Evoli Pro look.
//   · Button/IconButton accept `title`, `ariaLabel` and `onMouseEnter`-free props only;
//     no behaviour was invented.
import type { CSSProperties, ReactNode } from "react";
import { UiIcon } from "./icons";

type Sx = CSSProperties;

/**
 * The minimum height of anything clickable in this kit (BUG-146).
 *
 * 44 px is Apple's HIG minimum and WCAG 2.5.5 "Target Size (Enhanced)". EV-183 AC1
 * demos this back-office at a 390 px viewport, where every control is a thumb target,
 * so the floor is enforced HERE rather than by each call site passing `size="lg"` —
 * the roster's "Invite a trainee" button was 38 px precisely because the default size
 * decided the touch target. `size` now chooses type scale and padding only; the height
 * is not a per-screen decision.
 */
export const MIN_TOUCH_TARGET = 44;
// ───────────────────────── Buttons ─────────────────────────
type BtnVariant =
  | "primary"
  | "gradient"
  | "secondary"
  | "ghost"
  | "soft"
  | "danger"
  | "dangerSoft";

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconR,
  full,
  onClick,
  disabled,
  type = "button",
  title,
  ariaLabel,
  style = {},
}: {
  children?: ReactNode;
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  icon?: string;
  iconR?: string;
  full?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  /** Native tooltip. A disabled button still shows it, which is why the
      "Send by email" control uses it rather than a hover-only overlay. */
  title?: string;
  ariaLabel?: string;
  style?: Sx;
}) {
  const S = {
    sm: { h: MIN_TOUCH_TARGET, px: 12, fs: 13 },
    md: { h: MIN_TOUCH_TARGET, px: 15, fs: 13.5 },
    lg: { h: MIN_TOUCH_TARGET, px: 20, fs: 14.5 },
  }[size];
  const V: Record<BtnVariant, Sx> = {
    primary: { background: "var(--blue-500)", color: "#fff", border: "1px solid transparent", boxShadow: "var(--e-1)" },
    gradient: { background: "var(--grad-energy)", color: "#fff", border: "1px solid transparent", boxShadow: "0 4px 14px rgba(79,124,255,0.3)" },
    secondary: { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--border-2)", boxShadow: "var(--e-1)" },
    ghost: { background: "transparent", color: "var(--ink-2)", border: "1px solid transparent" },
    soft: { background: "var(--blue-50)", color: "var(--blue-600)", border: "1px solid transparent" },
    danger: { background: "var(--red-500)", color: "#fff", border: "1px solid transparent" },
    dangerSoft: { background: "var(--err-bg)", color: "var(--err-ink)", border: "1px solid transparent" },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      style={{
        height: S.h,
        padding: `0 ${S.px}px`,
        borderRadius: "var(--r-md)",
        fontWeight: 600,
        fontSize: S.fs,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        cursor: disabled ? "not-allowed" : "pointer",
        width: full ? "100%" : "auto",
        whiteSpace: "nowrap",
        opacity: disabled ? 0.5 : 1,
        transition: "filter .15s, transform .1s",
        ...V[variant],
        ...style,
      }}
    >
      {icon && <UiIcon name={icon} size={S.fs + 3} />}
      {children}
      {iconR && <UiIcon name={iconR} size={S.fs + 3} />}
    </button>
  );
}

export function IconButton({
  icon,
  size = "md",
  active,
  onClick,
  title,
  style = {},
}: {
  icon: string;
  size?: "sm" | "md";
  active?: boolean;
  onClick?: () => void;
  title?: string;
  style?: Sx;
}) {
  // Square, so the 44 px floor applies to both axes: the overview's "More" trigger is
  // the only icon-only control in the app and it opens the revoke menu.
  const d = MIN_TOUCH_TARGET;
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: d,
        height: d,
        borderRadius: "var(--r-md)",
        background: active ? "var(--blue-50)" : "transparent",
        border: "1px solid " + (active ? "transparent" : "var(--border)"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        color: active ? "var(--blue-600)" : "var(--ink-2)",
        transition: "all .15s",
        ...style,
      }}
    >
      <UiIcon name={icon} size={size === "sm" ? 16 : 18} />
    </button>
  );
}

// ───────────────────────── Badge ─────────────────────────
export type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "purple";
export function Badge({
  children,
  tone = "neutral",
  dot,
  style = {},
}: {
  children?: ReactNode;
  tone?: Tone;
  dot?: boolean;
  style?: Sx;
}) {
  const T: Record<Tone, { bg: string; fg: string }> = {
    neutral: { bg: "var(--surface-2)", fg: "var(--ink-2)" },
    blue: { bg: "var(--info-bg)", fg: "var(--info-ink)" },
    green: { bg: "var(--ok-bg)", fg: "var(--ok-ink)" },
    amber: { bg: "var(--warn-bg)", fg: "var(--warn-ink)" },
    red: { bg: "var(--err-bg)", fg: "var(--err-ink)" },
    purple: { bg: "var(--purple-50)", fg: "var(--purple-600)" },
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: "var(--r-pill)",
        background: T[tone].bg,
        color: T[tone].fg,
        fontWeight: 600,
        fontSize: 12,
        lineHeight: 1.4,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />}
      {children}
    </span>
  );
}

// ───────────────────────── Card ─────────────────────────
export function Card({
  children,
  pad = 20,
  style = {},
  hover,
  onClick,
}: {
  children?: ReactNode;
  pad?: number;
  style?: Sx;
  hover?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-2xl)",
        boxShadow: "var(--e-card)",
        padding: pad,
        transition: hover ? "box-shadow .15s, transform .15s" : "none",
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHead({
  title,
  sub,
  action,
  icon,
  style = {},
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  icon?: string;
  style?: Sx;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16, ...style }}>
      <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
        {icon && (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "var(--r-md)",
              background: "var(--blue-50)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <UiIcon name={icon} size={19} color="var(--blue-600)" />
          </div>
        )}
        <div>
          <div className="dt" style={{ fontWeight: 600, fontSize: 15.5, color: "var(--ink)", letterSpacing: -0.2 }}>{title}</div>
          {sub && <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 2 }}>{sub}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

// ───────────────────────── Inputs ─────────────────────────
export function Input({
  label,
  value,
  placeholder,
  icon,
  type,
  hint,
  error,
  trailing,
  full,
  onChange,
  onKeyDown,
  focusRing,
  style = {},
}: {
  label?: string;
  value?: string;
  placeholder?: string;
  icon?: string;
  type?: string;
  hint?: string;
  error?: string;
  trailing?: ReactNode;
  full?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  focusRing?: boolean;
  style?: Sx;
}) {
  return (
    <label style={{ display: "block", width: full ? "100%" : "auto", ...style }}>
      {label && <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)", marginBottom: 7 }}>{label}</div>}
      <div
        style={{
          height: 40,
          borderRadius: "var(--r-md)",
          background: "var(--surface)",
          border: `1px solid ${error ? "var(--err)" : focusRing ? "var(--blue-500)" : "var(--border-2)"}`,
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "0 12px",
          boxShadow: focusRing ? "var(--ring)" : "none",
          transition: "all .15s",
        }}
      >
        {icon && <UiIcon name={icon} size={16} color="var(--ink-3)" />}
        <input
          value={value}
          placeholder={placeholder}
          type={type || "text"}
          onChange={onChange}
          onKeyDown={onKeyDown}
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "var(--font-body)",
            fontSize: 13.5,
            color: "var(--ink)",
            minWidth: 0,
            width: "100%",
          }}
        />
        {trailing}
      </div>
      {(hint || error) && <div style={{ fontSize: 12, marginTop: 6, color: error ? "var(--err)" : "var(--ink-3)" }}>{error || hint}</div>}
    </label>
  );
}

// ───────────────────────── Avatar ─────────────────────────
const GRADS = [
  "var(--grad-energy)",
  "var(--grad-vital)",
  "var(--grad-purple)",
  "linear-gradient(135deg,#F59E0B,#FF6A55)",
  "linear-gradient(135deg,#22C7D6,#4F7CFF)",
];
export function Avatar({ name = "AR", size = 36, idx = 0, ring, style = {} }: { name?: string; size?: number; idx?: number; ring?: boolean; style?: Sx }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: GRADS[idx % GRADS.length],
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: size * 0.38,
        color: "#fff",
        flexShrink: 0,
        boxShadow: ring ? "0 0 0 2px var(--surface),0 0 0 4px var(--blue-500)" : "none",
        ...style,
      }}
    >
      {initials}
    </div>
  );
}

// ───────────────────────── Empty / Loading ─────────────────────────
export function EmptyState({ icon = "file", title, sub, action, style = {} }: { icon?: string; title: ReactNode; sub?: ReactNode; action?: ReactNode; style?: Sx }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "48px 24px", ...style }}>
      <div style={{ width: 56, height: 56, borderRadius: "var(--r-lg)", background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
        <UiIcon name={icon} size={26} color="var(--ink-3)" />
      </div>
      <div className="dt" style={{ fontWeight: 600, fontSize: 16, color: "var(--ink)" }}>{title}</div>
      {sub && <div style={{ fontSize: 13.5, color: "var(--ink-3)", marginTop: 6, maxWidth: 320, lineHeight: 1.5 }}>{sub}</div>}
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ w = "100%", h = 14, r = 7, style = {} }: { w?: number | string; h?: number; r?: number; style?: Sx }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: r,
        background: "linear-gradient(90deg,var(--surface-2) 25%,var(--surface-3) 50%,var(--surface-2) 75%)",
        backgroundSize: "400px 100%",
        animation: "shimmer 1.4s infinite",
        ...style,
      }}
    />
  );
}

// ───────────────────────── Modal ─────────────────────────
export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  width = 440,
  icon,
  iconTone = "blue",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  icon?: string;
  iconTone?: "blue" | "red" | "amber";
}) {
  if (!open) return null;
  const tone = {
    blue: ["var(--blue-50)", "var(--blue-600)"],
    red: ["var(--err-bg)", "var(--err-ink)"],
    amber: ["var(--warn-bg)", "var(--warn-ink)"],
  }[iconTone];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(16,23,41,0.45)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "relative", width: `min(${width}px, 100vw - 24px)`, maxWidth: "100%", maxHeight: "90dvh", display: "flex", flexDirection: "column", background: "var(--surface)", borderRadius: "var(--r-2xl)", boxShadow: "var(--e-3)", border: "1px solid var(--border)", overflow: "hidden" }}>
        <div style={{ padding: "22px 24px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 13, alignItems: "center" }}>
              {icon && (
                <div style={{ width: 42, height: 42, borderRadius: "var(--r-md)", background: tone[0], display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <UiIcon name={icon} size={22} color={tone[1]} />
                </div>
              )}
              <div>
                <div className="dt" style={{ fontWeight: 600, fontSize: 18, color: "var(--ink)", letterSpacing: -0.3 }}>{title}</div>
                {sub && <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 3 }}>{sub}</div>}
              </div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "var(--r-sm)", background: "var(--surface-2)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UiIcon name="x" size={17} color="var(--ink-2)" />
            </button>
          </div>
        </div>
        <div style={{ padding: "18px 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>{children}</div>
        {footer && <div style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10, background: "var(--surface-2)", flexShrink: 0, flexWrap: "wrap" }}>{footer}</div>}
      </div>
    </div>
  );
}

// ───────────────────────── Page header ─────────────────────────
export function PageHead({ title, sub, actions, breadcrumb }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; breadcrumb?: string[] }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
      <div>
        {breadcrumb && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 12.5, color: "var(--ink-3)" }}>
            {breadcrumb.map((b, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {i > 0 && <UiIcon name="chevR" size={13} color="var(--ink-3)" />}
                <span style={{ color: i === breadcrumb.length - 1 ? "var(--ink-2)" : "var(--ink-3)", fontWeight: i === breadcrumb.length - 1 ? 600 : 400 }}>{b}</span>
              </span>
            ))}
          </div>
        )}
        <h1 className="dt" style={{ margin: 0, fontWeight: 700, fontSize: 24, letterSpacing: -0.6, color: "var(--ink)" }}>{title}</h1>
        {sub && <p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--ink-3)" }}>{sub}</p>}
      </div>
      {actions && <div style={{ display: "flex", gap: 10, alignItems: "center" }}>{actions}</div>}
    </div>
  );
}

// ───────────────────────── Table primitives ─────────────────────────
export type Column = { label: string; align?: "left" | "right" | "center"; w?: number | string; sortKey?: string };
export type SortState = { key: string; order: "asc" | "desc" };
export function DataTable({
  columns,
  children,
  sort,
  onSort,
  minWidth = 640,
  style = {},
}: {
  columns: Column[];
  children: ReactNode;
  sort?: SortState;
  onSort?: (key: string) => void;
  minWidth?: number;
  style?: Sx;
}) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-2xl)", boxShadow: "var(--e-card)", overflow: "hidden", ...style }}>
      {/* Horizontal scroll container: on narrow viewports the table scrolls
          inside the card instead of stretching the page body. */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", minWidth, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "var(--surface-2)" }}>
            {columns.map((c, i) => {
              const sortable = !!c.sortKey && !!onSort;
              const active = sortable && sort?.key === c.sortKey;
              return (
                <th
                  key={i}
                  onClick={sortable ? () => onSort!(c.sortKey!) : undefined}
                  style={{
                    textAlign: c.align || "left",
                    padding: "11px 16px",
                    fontSize: 11.5,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                    color: active ? "var(--ink-2)" : "var(--ink-3)",
                    whiteSpace: "nowrap",
                    width: c.w,
                    cursor: sortable ? "pointer" : undefined,
                    userSelect: sortable ? "none" : undefined,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {c.label}
                    {active && <UiIcon name={sort!.order === "asc" ? "chevU" : "chevD"} size={12} color="var(--ink-2)" stroke={2.4} />}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      </div>
    </div>
  );
}

export function Td({ children, align = "left", title, style = {} }: { children?: ReactNode; align?: "left" | "right" | "center"; title?: string; style?: Sx }) {
  return <td title={title} style={{ padding: "13px 16px", fontSize: 13.5, color: "var(--ink-2)", textAlign: align, borderTop: "1px solid var(--hairline)", ...style }}>{children}</td>;
}

