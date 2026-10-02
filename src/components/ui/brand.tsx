/**
 * The Evoli Pro brand: the black mark (Raed's ruling 2026-10-02 — Evoli Pro ONLY; the
 * trainee app, the landing and the admin keep their own logo until Q2 is decided).
 *
 * The mark is the design's `<symbol id="mk">`: one stroked path with round caps and joins
 * and a 1-unit `#32D583` dot at the centre, on a near-black tile (`--brand-tile`). It is
 * drawn HERE and nowhere else in the UI; `src/app/icon.svg` (the favicon) and
 * `src/app/apple-icon.png` are generated from the same path, and
 * `qa/pro-shell.spec.ts` pins the favicon's path to `MARK_PATH`.
 *
 * Server-safe: no hooks, no client directive.
 */

/** The mark's geometry, in a 24 × 24 box. */
export const MARK_PATH = "M4 20 L9 15 A4.243 4.243 0 1 1 15 9 L20 4";
export const MARK_DOT = { cx: 12, cy: 12, r: 1, fill: "#32D583" } as const;
/** The stroke on the tile, as drawn. The tile itself is `--brand-tile` (#0B0F17). */
export const MARK_STROKE = "#F6F7F9";

/**
 * The black tile with the mark. Decorative: it is always next to a wordmark or inside a
 * named link, so it is hidden from assistive technology.
 *
 * The trainee-facing invite page (`/i/[token]`) does NOT use it: a trainee is not on Evoli
 * Pro, and that page keeps the trainee brand (`Logo` in `icons.tsx`, and `src/app/i/icon.svg`).
 */
export function BrandMark({ size = 34 }: { /** The tile's side in px; radius and mark follow (34 → r10 / 22). */ size?: number }) {
  const mark = Math.round(size * 0.64);
  return (
    <span
      aria-hidden="true"
      data-brand-mark="ink"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        background: "var(--brand-tile)",
        display: "inline-grid",
        placeItems: "center",
        flex: "none",
      }}
    >
      <svg width={mark} height={mark} viewBox="0 0 24 24" focusable="false" style={{ display: "block" }}>
        <path d={MARK_PATH} fill="none" stroke={MARK_STROKE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r} fill={MARK_DOT.fill} />
      </svg>
    </span>
  );
}

/** « Evoli Pro » in Space Grotesk 700, −0.02em. */
export function Wordmark({
  size = 18,
  tone = "ink",
  children,
}: {
  size?: number;
  tone?: "ink" | "white";
  children: React.ReactNode;
}) {
  return (
    <span
      className="dt"
      style={{
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.2,
        letterSpacing: "-0.02em",
        color: tone === "white" ? "#fff" : "var(--ink)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/**
 * Tile + wordmark, the lock-up every screen uses. Sizes as drawn: sidebar 34 / 18, top bar
 * 30 / 17, login panel 36 / 20 (white), cards 26 / 15.
 */
export function Logo({ size = 34, label, tone = "ink" }: { size?: number; label: string; tone?: "ink" | "white" }) {
  const wordmark = { 26: 15, 30: 17, 34: 18, 36: 20 }[size] ?? Math.round(size * 0.53);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
      <BrandMark size={size} />
      <Wordmark size={wordmark} tone={tone}>
        {label}
      </Wordmark>
    </span>
  );
}
