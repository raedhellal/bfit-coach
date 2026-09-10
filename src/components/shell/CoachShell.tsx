import Link from "next/link";
import { Logo } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/kit";
import { copy } from "@/lib/copy";
import { SignOutButton } from "./SignOutButton";

/**
 * Header + page frame. A top bar rather than the admin's sidebar: Evoli Pro has two
 * routes, and a 248 px navigation rail listing one destination is chrome that costs a
 * quarter of a 390 px viewport (AC1 is demoed at that width).
 *
 * Server component — the only client island is the sign-out button.
 */
export function CoachShell({
  coachName,
  children,
}: {
  coachName?: string | null;
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
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            height: 62,
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {/* AC1: the app header reads exactly "Evoli Pro". */}
          <Link href="/" aria-label={copy.shell.backToRoster}>
            <Logo size={30} label={copy.brand} />
          </Link>
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
