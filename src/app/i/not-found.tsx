import Link from "next/link";
import { Logo } from "@/components/ui/icons";
import { MIN_TOUCH_TARGET } from "@/components/ui/kit";
import { getCopy } from "@/lib/i18n/server";

/**
 * EV-337k — a URL under `/i/` that is not an invitation (`/i`, `/i/<token>/<anything>`).
 *
 * R1 / EV-337 edge case 4: nothing under `/i/*` shows the Evoli Pro mark. Before this file
 * those URLs fell through to the ROOT not-found, which draws the black mark (signed out) or
 * the whole coach shell (a coach's browser), with the Pro favicon. `src/app/i/page.tsx` and
 * `src/app/i/[token]/[...rest]/page.tsx` call `notFound()` so the request lands HERE, inside
 * the `/i` segment: the trainee mark, and the segment's own favicon and home-screen icon.
 *
 * The same sentences as the root page's signed-out version (EV-241 AC2, pinned by
 * `qa/coach-not-found.spec.ts`), for every visitor: this page reads no session, as the
 * invitation itself reads none. No api call, nothing awaited — like the root one, it is
 * rendered into every `/i` page's payload as the segment's boundary.
 */
export default function InviteNotFound() {
  const copy = getCopy();
  return (
    <main
      style={{
        minHeight: "calc(100vh - var(--legal-footer-h))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px calc(32px + env(safe-area-inset-bottom))",
        background: "var(--bg)",
      }}
    >
      <div
        data-testid="not-found"
        style={{
          width: "100%",
          maxWidth: 420,
          minWidth: 0,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-2xl)",
          boxShadow: "var(--e-card)",
          padding: "32px 24px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          textAlign: "center",
        }}
      >
        <Logo size={36} label={copy.invitePage.brand} />
        <h1 className="dt" style={{ margin: 0, fontSize: 22, lineHeight: "30px", fontWeight: 700, color: "var(--ink)" }}>
          {copy.notFound.title}
        </h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--ink-2)" }}>{copy.notFound.bodySignedOut}</p>
        <Link
          href="/login"
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: MIN_TOUCH_TARGET,
            padding: "0 18px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border-2)",
            background: "var(--surface)",
            boxShadow: "var(--e-1)",
            color: "var(--ink)",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {copy.notFound.toLogin}
        </Link>
      </div>
    </main>
  );
}
