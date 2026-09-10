import { UiIcon, Logo } from "@/components/ui/icons";
import { LoginForm } from "@/components/auth/LoginForm";
import { copy } from "@/lib/copy";

/**
 * /login — the only unguarded page (middleware.ts).
 *
 * Server component: it reads the redirect reason middleware attached and hands it to
 * the client form as its initial error, so a coach bounced out of /roster sees the
 * reason on the screen they land on rather than a bare form.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const initialError =
    searchParams?.error === "not_coach"
      ? copy.login.notACoach
      : searchParams?.error === "expired"
        ? copy.login.signedOut
        : null;

  return (
    <div className="login-split">
      {/* Brand panel — decorative, hidden below 768 px by CSS (no JS, no reflow). */}
      <div
        className="login-brand"
        style={{
          background: "var(--grad-energy)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 48,
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(160deg,rgba(255,255,255,0.16),transparent 50%)",
          }}
        />
        <div style={{ position: "relative" }}>
          <Logo size={34} on="dark" label={copy.brand} />
        </div>
        <div style={{ position: "relative", maxWidth: 460 }}>
          <p
            className="dt"
            style={{ fontSize: 36, lineHeight: 1.15, letterSpacing: -1, margin: 0, fontWeight: 700 }}
          >
            {copy.tagline}
          </p>
        </div>
        <div style={{ position: "relative", display: "flex", gap: 22, opacity: 0.92 }}>
          {[
            ["users", copy.roster.title],
            ["pulse", copy.client.adherence],
          ].map(([ic, l]) => (
            <div
              key={l}
              style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600 }}
            >
              <UiIcon name={ic} size={18} color="#fff" />
              {l}
            </div>
          ))}
        </div>
      </div>

      <div
        className="login-form"
        style={{
          background: "var(--surface)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <LoginForm initialError={initialError} />
      </div>
    </div>
  );
}
