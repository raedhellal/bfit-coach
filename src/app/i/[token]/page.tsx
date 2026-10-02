import type { Metadata } from "next";
import { Logo } from "@/components/ui/icons";
import { getCopy } from "@/lib/i18n/server";
import { sanitiseCoachName } from "@/lib/inviteName";
import { INVITE_APPS, inviteDeepLink } from "@/lib/traineeApps";

/**
 * /i/<token> — the invite landing page (ADR-0012 D5, EV-183 edge case 3).
 *
 * PUBLIC. The middleware matcher excludes `/i/*`: whoever scans this QR is a trainee
 * with no Evoli Pro account, so guarding it would send every invited person to a coach
 * login screen they can never pass.
 *
 * It makes **no API call**. The token is opaque to this surface — only b-fit-api can
 * say whether it is valid, unexpired and unused, and it decides that at *accept* time
 * inside the app. Validating here would burn a round trip to tell a stranger whether a
 * credential exists, which is an oracle, and it would still be stale by the time the
 * app opened. So this page renders the same for any string.
 *
 * No auto-redirect. iOS Safari only follows a custom-scheme URL from a real user
 * gesture; a `location.href = "evolifit://…"` on load is either silently dropped or
 * shows "Safari cannot open the page", and it would also make the fallback text
 * unreachable. It is a plain <a href> and it stays one.
 *
 * The token is never rendered as text — not in the body, not in a copyable field, not
 * in the title. It appears only inside the anchor's href, where it has to be.
 */

type SearchParams = { [key: string]: string | string[] | undefined };

export function generateMetadata({ searchParams }: { searchParams: SearchParams }): Metadata {
  const copy = getCopy();
  const coachName = sanitiseCoachName(searchParams.coach);
  return {
    // Still no token anywhere near the title — only the coach's name, which is public
    // to anyone holding the link anyway.
    title: coachName ? copy.invitePage.titleFrom(coachName) : copy.invitePage.title,
    description: copy.invitePage.body,
    robots: { index: false, follow: false },
  };
}

// The token is per-request and this page must never be prerendered into a shared HTML
// file (a cached /i/<token> would be one invite handed to the next scanner).
export const dynamic = "force-dynamic";

export default function InvitePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: SearchParams;
}) {
  const copy = getCopy();
  // AC3: the coach's name is forwarded to the app on the deep link exactly as it was
  // received. The app needs it because b-fit-api cannot resolve an invite token before
  // the trainee accepts, so without this query the consent screen can only say
  // "Your coach". Encoding is `inviteDeepLink`'s.
  const coachName = sanitiseCoachName(searchParams.coach);
  // EV-289 (ADR-0027 D27.5d): one button per app, same token and `coach` query. The page
  // cannot pick one — an invite is a bearer token and does not know whose account will
  // accept it — and a web page cannot reliably detect which app is installed.
  const links = INVITE_APPS.map((app, i) => ({
    key: app.scheme,
    primary: i === 0,
    label: copy.invitePage.openIn(app.name),
    href: inviteDeepLink(app, params.token, coachName),
  }));

  const initials = coachName ? initialsOf(coachName) : null;

  return (
    <main
      style={{
        minHeight: "calc(100vh - var(--legal-footer-h))",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px calc(32px + env(safe-area-inset-bottom))",
        background: "var(--bg)",
      }}
    >
      <div
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
          gap: 20,
          textAlign: "center",
        }}
      >
        {/* R1 (Raed, 2026-10-02): the trainee brand, never the Evoli Pro black mark — this
            page is a trainee's, and edge case 4 holds even for a browser that signed in as a
            coach a minute ago (the page reads no session at all). */}
        <Logo size={36} label={copy.invitePage.brand} />

        {/* The inviting coach's initials, from the same `?coach=` name the heading prints.
            Decoration: the name itself is in the h1. No name, no circle. */}
        {initials && (
          <span
            aria-hidden="true"
            data-testid="invite-coach-initials"
            className="dt"
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--blue-50)",
              color: "var(--link)",
              display: "grid",
              placeItems: "center",
              fontSize: 18,
              fontWeight: 700,
              flex: "none",
            }}
          >
            {initials}
          </span>
        )}

        <h1
          className="dt"
          style={{
            margin: 0,
            fontSize: "clamp(24px, 6vw, 30px)",
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            fontWeight: 700,
            color: "var(--ink)",
            textWrap: "pretty",
            maxWidth: "100%",
          }}
        >
          {coachName ? copy.invitePage.titleFrom(coachName) : copy.invitePage.title}
        </h1>

        <p style={{ margin: 0, fontSize: 15, lineHeight: "22px", color: "var(--ink-2)" }}>
          {copy.invitePage.body}
        </p>

        {/* Real links, not buttons with an onClick: the custom scheme needs the
            browser's own navigation from a tap, and this page ships no JavaScript of its
            own. The primary fill is the darker gradient (R2): white 15.5 px text reads
            5.39:1 on it, 3.71:1 on the old one. */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
          {links.map((link) => (
            <a
              key={link.key}
              href={link.href}
              style={{
                width: "100%",
                minHeight: 48,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 18px",
                borderRadius: "var(--r-pill)",
                fontFamily: "var(--font-body)",
                fontSize: 15.5,
                fontWeight: 700,
                ...(link.primary
                  ? {
                      background: "var(--grad-energy-strong)",
                      color: "var(--ink-on)",
                      boxShadow: "0 4px 14px rgba(58,95,224,0.25)",
                    }
                  : {
                      background: "var(--surface)",
                      color: "var(--ink)",
                      border: "1px solid var(--border-2)",
                    }),
              }}
            >
              {link.label}
            </a>
          ))}
        </div>

        <div
          style={{
            width: "100%",
            paddingTop: 16,
            borderTop: "1px solid var(--hairline)",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--ink-2)" }}>
            {copy.invitePage.fallback}
          </p>
          {/* No store links yet (⛔ D8): say so, rather than ship a dead href. The design's
              « Invitation valable jusqu'au 7 oct. » is not drawn: this page cannot look a
              token up (no pre-accept lookup, plan G22), so it cannot know an expiry. */}
          <p style={{ margin: 0, fontSize: 13, lineHeight: "18px", color: "var(--ink-2)" }}>
            {copy.invitePage.storesComingSoon}
          </p>
        </div>
      </div>
    </main>
  );
}

/**
 * "Alex Roussel" → "AR", "Léa" → "L", "jean-marc d." → "JD". Whole code points, so a name
 * that starts with a character outside the BMP is not cut in half.
 */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toLocaleUpperCase();
}
