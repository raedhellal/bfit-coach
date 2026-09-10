import type { Metadata } from "next";
import { Logo } from "@/components/ui/icons";
import { copy } from "@/lib/copy";
import { sanitiseCoachName } from "@/lib/inviteName";

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
  // AC3: the coach's name is forwarded to the app on the deep link exactly as it was
  // received. The app needs it because b-fit-api cannot resolve an invite token before
  // the trainee accepts, so without this query the consent screen can only say
  // "Your coach". It is re-encoded rather than concatenated raw so a name containing
  // `&`, `#` or a space cannot split the deep link into extra parameters.
  const coachName = sanitiseCoachName(searchParams.coach);
  const deepLink =
    `evolifit://my-coach/invite/${encodeURIComponent(params.token)}` +
    (coachName ? `?coach=${encodeURIComponent(coachName)}` : "");

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 18px calc(32px + env(safe-area-inset-bottom))",
        background: "var(--bg)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-2xl)",
          boxShadow: "var(--e-card)",
          padding: "28px 22px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
        }}
      >
        <Logo size={34} label={copy.invitePage.brand} />

        <h1
          className="dt"
          style={{
            margin: 0,
            fontSize: 26,
            lineHeight: 1.2,
            letterSpacing: -0.6,
            fontWeight: 700,
            color: "var(--ink)",
          }}
        >
          {coachName ? copy.invitePage.titleFrom(coachName) : copy.invitePage.title}
        </h1>

        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: "var(--ink-2)" }}>
          {copy.invitePage.body}
        </p>

        {/* A real link, not a button with an onClick: the custom scheme needs the
            browser's own navigation from a tap, and this page ships no JavaScript. */}
        <a
          href={deepLink}
          style={{
            width: "100%",
            minHeight: 48,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 18px",
            borderRadius: "var(--r-pill)",
            background: "var(--grad-energy)",
            color: "var(--ink-on)",
            fontFamily: "var(--font-body)",
            fontSize: 15.5,
            fontWeight: 700,
            boxShadow: "var(--e-2)",
          }}
        >
          {copy.invitePage.open}
        </a>

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
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-2)" }}>
            {copy.invitePage.fallback}
          </p>
          {/* No store links yet (⛔ D8): say so, rather than ship a dead href. */}
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-3)" }}>
            {copy.invitePage.storesComingSoon}
          </p>
        </div>
      </div>
    </main>
  );
}
