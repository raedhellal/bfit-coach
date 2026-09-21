import Link from "next/link";
import { Logo } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { SignOutButton } from "./SignOutButton";

/**
 * Header + page frame. A top bar rather than the admin's sidebar: a 248 px navigation
 * rail is chrome that costs a quarter of a 390 px viewport (AC1 is demoed at that
 * width), and the portal has two destinations.
 *
 * EV-188 AC1 asks for Templates to be reachable "from the portal's main navigation",
 * so the header grew one — two links, both always visible, `nav` landmarked. The
 * current section is marked with `aria-current` rather than only with a colour.
 *
 * ⚠ The links sit BEFORE the `flex: 1` spacer and each is `whiteSpace: nowrap`, so
 * they never wrap into the coach's name at 320 px; the name is what gives (it already
 * ellipsises at 140 px) and `SignOutButton` holds the right edge. Swept at 320 / 360 /
 * 390 / 414 in `qa/coach-library.spec.ts`.
 *
 * Server component — the only client island is the sign-out button.
 */
export function CoachShell({
  coachName,
  section,
  children,
}: {
  coachName?: string | null;
  /** Which nav entry is the page under this shell. Undefined on a trainee screen. */
  section?: "roster" | "templates";
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/*
          `shell-bar` / `shell-nav` are CLASSES and not inline styles, and that is
          load-bearing: the nav has to drop to its own line below 520 px and an inline
          `height` cannot be overridden by a media query.

          Measured 2026-09-21 with the EV-188b sweep, which is why the class exists at
          all: inline at 320 px the nav box shrank to 88.75 px while its two links need
          ~155, so "Templates" overflowed its own nav and was painted UNDER the Sign out
          button — a 43 px overlap that `toBeVisible()` reports as visible. It is the
          same defect class as EV-201 item 4 (a flex item shrinking below its children's
          intrinsic width), on new markup, caught before it shipped this time.
        */}
        <div className="shell-bar">
          {/* AC1: the app header reads exactly "Evoli Pro". */}
          <Link href="/" aria-label={copy.shell.backToRoster}>
            <Logo size={30} label={copy.brand} />
          </Link>
          <nav aria-label={copy.shell.roster} className="shell-nav">
            <ShellLink href="/" current={section === "roster"}>
              {copy.shell.roster}
            </ShellLink>
            <ShellLink href="/templates" current={section === "templates"}>
              {copy.templates.nav}
            </ShellLink>
          </nav>
          <div style={{ flex: 1 }} />
          {coachName && (
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Avatar name={coachName} size={30} />
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "var(--ink-2)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 140,
                }}
              >
                {coachName}
              </span>
            </div>
          )}
          <SignOutButton />
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}

/**
 * One navigation entry. `aria-current="page"` is the statement; the weight and the
 * background are the decoration, because a coach who cannot distinguish the two greys
 * still needs to know where they are.
 */
function ShellLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 34,
        padding: "0 10px",
        borderRadius: "var(--r-md)",
        fontSize: 13.5,
        fontWeight: current ? 700 : 600,
        color: current ? "var(--ink)" : "var(--ink-2)",
        background: current ? "var(--surface-2)" : "transparent",
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Link>
  );
}
