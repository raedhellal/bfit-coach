import Link from "next/link";
import { CoachShell } from "@/components/shell/CoachShell";
import { Logo } from "@/components/ui/brand";
import { Card, MIN_TOUCH_TARGET } from "@/components/ui/kit";
import { getCopy } from "@/lib/i18n/server";
import { hasCoachRole } from "@/lib/jwt";
import { readAccessToken } from "@/lib/session";

/**
 * EV-241 — a URL that matches no page. Next serves this for every unmatched path with
 * **404**: an unmatched URL renders the root layout and this file only, above every
 * segment `loading.tsx`, so nothing has flushed a 200 before the status is decided.
 *
 * Who sees which version:
 *   · a coach session (AC1) — middleware let the request through because the access
 *     cookie carries COACH, so the page is drawn in the portal's frame with a way back
 *     to the roster;
 *   · anybody else (AC2) — middleware sends a signed-out visitor to /login before any
 *     page runs, so they only reach this on a path it does not guard (an unknown
 *     `/api/auth/…`): no frame (it would offer a nav and a sign-out to nobody) and a link
 *     to /login. Not `/i/…`: since EV-337k / BUG-678 every non-invitation `/i` path draws
 *     the trainee 404 (`src/components/invite/InviteNotFound.tsx`), on Vercel too.
 * The cookie is read for which screen to draw, exactly as middleware reads it; it is
 * never an authorization decision — the roster link still goes through the guard.
 *
 * ⚠ COST: Next 14 renders the root not-found into EVERY page's RSC payload (it is the
 * root segment's notFound boundary, built eagerly), so this component runs on every
 * request. It therefore makes NO api call — the shell is drawn without the coach's name
 * (a `readCoachMe()` here was a `/coach-portal/me` read on every roster load, which reads
 * `getMe` uncached) — and reads one cookie. The embedded tree is ~4–5 kB of uncompressed
 * HTML per document load (measured on /challenges under `next start`).
 *
 * A typo'd TRAINEE id (`/clients/<anything>`) is not this page: it matches
 * `/clients/[id]`, the api answers 403 for an id that is not the coach's, and it is
 * served as /clients/denied with 403 (BUG-139) — "not in your list", which is the
 * truth the api is willing to tell.
 */
export const dynamic = "force-dynamic";

export default function NotFound() {
  const copy = getCopy();
  const coach = hasCoachRole(readAccessToken());
  const card = (
    <Card>
      <div
        data-testid="not-found"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "32px 16px", textAlign: "center" }}
      >
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--ink)" }}>{copy.notFound.title}</h1>
        <p style={{ margin: 0, fontSize: 14.5, color: "var(--ink-2)", maxWidth: 400, lineHeight: 1.5 }}>
          {coach ? copy.notFound.body : copy.notFound.bodySignedOut}
        </p>
        <Link
          href={coach ? "/" : "/login"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: MIN_TOUCH_TARGET,
            padding: "0 15px",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--border-2)",
            background: "var(--surface)",
            boxShadow: "var(--e-1)",
            color: "var(--ink)",
            fontSize: 13.5,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {coach ? copy.notFound.toRoster : copy.notFound.toLogin}
        </Link>
      </div>
    </Card>
  );

  if (coach) return <CoachShell>{card}</CoachShell>;
  return (
    <main className="page" style={{ maxWidth: 520, margin: "0 auto", paddingTop: 64 }}>
      <div style={{ marginBottom: 24 }}>
        <Logo size={30} label={copy.brand} />
      </div>
      {card}
    </main>
  );
}
