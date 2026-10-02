import Link from "next/link";
import { Logo } from "@/components/ui/icons";
import { getCopy } from "@/lib/i18n/server";

/**
 * EV-337k — the trainee-branded "page not found" for a URL under `/i/` that is not an
 * invitation (`/i`, `/i/<token>/<anything>`).
 *
 * R1 / edge case 4: nothing under `/i/*` shows the Evoli Pro mark; the ROOT 404 draws it.
 * The same sentences as the root page's signed-out version (EV-241 AC2, pinned by
 * `qa/coach-not-found.spec.ts`), for every visitor: it reads no session, as the invitation
 * reads none. No api call, nothing awaited.
 *
 * Rendered DIRECTLY by `src/app/i/page.tsx` and `src/app/i/[token]/[...rest]/page.tsx`, NOT
 * through `notFound()` (QA PB-1 on 8b5ca26): a `notFound()` thrown from a page reaches the
 * browser as Next's `<html id="__next_error__">` shell with an EMPTY body, filled in by
 * JavaScript — blank with JavaScript off. The 404 STATUS comes from `middleware.ts`, which
 * rewrites these paths onto themselves with `status: 404` (the /clients/denied pattern).
 */
export function InviteNotFoundView() {
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
            // 44 px: the kit's MIN_TOUCH_TARGET, written out — importing kit.tsx (a client module)
            // added ~46 kB of JavaScript to these two 404s.
            minHeight: 44,
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
